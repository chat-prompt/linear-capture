/**
 * NotionSyncAdapter - Sync Notion pages to local database
 *
 * Features:
 * - Incremental sync based on last_edited_time
 * - Content extraction via NotionService
 * - Text preprocessing and embedding generation
 * - Change detection via content_hash
 * - Per-page error tracking (don't block entire sync)
 */

import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import { createNotionService } from '../notion-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import { isNotionDbAvailable, getNotionLocalReader } from '../notion-local-reader';
import type { NotionService, NotionPage } from '../notion-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgress, SyncProgressCallback } from '../local-search';
import type { SyncResult } from '../../types';

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

export class NotionSyncAdapter {
  private notionService: NotionService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;

  constructor() {
    this.notionService = createNotionService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
  }

  /**
   * Full sync - fetch all pages (for initial sync)
   */
  async sync(): Promise<SyncResult> {
    console.log('[NotionSync] Starting full sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    let cursor: string | undefined;

    try {
      await this.updateSyncStatus('syncing');

      cursor = await this.getSavedPaginationCursor();
      if (cursor) {
        console.log(`[NotionSync] Resuming from saved cursor: ${cursor}`);
      }

      let hasMore = true;
      let latestTime: string | undefined;

      while (hasMore) {
        const searchResult = await this.notionService.searchPagesForSync(100, cursor);

        if (!searchResult.success || !searchResult.pages) {
          throw new Error(searchResult.error || 'Failed to fetch pages');
        }

        console.log(`[NotionSync] Found ${searchResult.pages.length} pages (cursor: ${cursor || 'none'})`);

        for (const page of searchResult.pages) {
          try {
            await this.syncPage(page);
            result.itemsSynced++;
          } catch (error) {
            console.error(`[NotionSync] Failed to sync page ${page.id}:`, error);
            result.itemsFailed++;
            result.errors.push({
              id: page.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          if (!latestTime || page.lastEditedTime > latestTime) {
            latestTime = page.lastEditedTime;
          }
        }

        hasMore = searchResult.hasMore ?? false;
        cursor = searchResult.nextCursor ?? undefined;
      }

      if (latestTime) {
        await this.updateSyncCursor(latestTime, result.itemsSynced);
        result.lastCursor = latestTime;
      }

      await this.clearPaginationCursor();
      await this.updateSyncStatus('idle');

      console.log(
        `[NotionSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[NotionSync] Full sync failed:', error);
      result.success = false;
      if (cursor) {
        await this.savePaginationCursor(cursor);
      }
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  /**
   * Incremental sync - uses local reader if available, falls back to API
   */
  async syncIncremental(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    console.log('[NotionSync] Starting incremental sync');

    if (isNotionDbAvailable()) {
      console.log('[NotionSync] Using local reader (optimized batch sync)');
      return this.syncFromLocal(onProgress);
    }

    console.log('[NotionSync] Local reader unavailable, using API fallback');
    return this.syncFromApi(onProgress);
  }

  /**
   * Optimized sync using local Notion cache + batch embedding
   */
  private async syncFromLocal(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');
      onProgress?.({ source: 'notion', phase: 'discovering', current: 0, total: 0 });

      const localReader = getNotionLocalReader();
      const pages = await localReader.getAllPagesForSync();
      console.log(`[NotionSync] Local reader found ${pages.length} pages`);

      if (pages.length === 0) {
        onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
        await this.updateSyncStatus('idle');
        return result;
      }

      const lastSyncCursor = await this.getLastSyncCursor();
      const pagesToProcess = lastSyncCursor
        ? pages.filter(p => p.lastEditedTime > lastSyncCursor)
        : pages;

      console.log(`[NotionSync] ${pagesToProcess.length} pages to process (after cursor filter)`);

      const MAX_TEXT_CHARS = 5000;
      const pagesWithMeta = pagesToProcess.map(page => {
        const fullText = `${page.title}\n\n${page.content}`;
        let preprocessed = this.preprocessor.preprocess(fullText);
        if (preprocessed.length > MAX_TEXT_CHARS) {
          preprocessed = preprocessed.substring(0, MAX_TEXT_CHARS);
        }
        const hash = this.calculateContentHash(preprocessed);
        return { ...page, preprocessed, hash };
      });

      const db = this.dbService.getDb();
      const existingHashes = await db.query<{ source_id: string; content_hash: string }>(
        `SELECT source_id, content_hash FROM documents WHERE source_type = $1`,
        ['notion']
      );
      const hashMap = new Map(existingHashes.rows.map(r => [r.source_id, r.content_hash]));

      const changedPages = pagesWithMeta.filter(p => 
        hashMap.get(p.id) !== p.hash && p.preprocessed.trim().length > 0
      );
      console.log(`[NotionSync] ${changedPages.length} pages changed (need embedding)`);

      if (changedPages.length === 0) {
        await this.updateSyncStatus('idle');
        console.log(`[NotionSync] No changes detected, sync complete in ${Date.now() - startTime}ms`);
        return result;
      }

      const BATCH_SIZE = 300;
      for (let i = 0; i < changedPages.length; i += BATCH_SIZE) {
        const batch = changedPages.slice(i, i + BATCH_SIZE);
        const texts = batch.map(p => p.preprocessed);

        onProgress?.({ source: 'notion', phase: 'embedding', current: i, total: changedPages.length });
        console.log(`[NotionSync] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(changedPages.length / BATCH_SIZE)} (${batch.length} pages)`);

        try {
          const embeddings = await this.embeddingClient.embed(texts);

          const savePromises = batch.map(async (page, idx) => {
            try {
              const metadata = { url: page.url };
              await db.query(
                `
                INSERT INTO documents (
                  source_type, source_id, title, content, content_hash,
                  embedding, metadata, source_created_at, source_updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (source_type, source_id) 
                DO UPDATE SET
                  title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  content_hash = EXCLUDED.content_hash,
                  embedding = EXCLUDED.embedding,
                  metadata = EXCLUDED.metadata,
                  source_updated_at = EXCLUDED.source_updated_at,
                  indexed_at = NOW()
                `,
                [
                  'notion',
                  page.id,
                  page.title,
                  page.preprocessed,
                  page.hash,
                  JSON.stringify(Array.from(embeddings[idx])),
                  JSON.stringify(metadata),
                  new Date(page.lastEditedTime),
                  new Date(page.lastEditedTime)
                ]
              );
              result.itemsSynced++;
            } catch (error) {
              result.itemsFailed++;
              result.errors.push({
                id: page.id,
                error: error instanceof Error ? error.message : 'DB insert failed',
              });
            }
          });

          await Promise.all(savePromises);
        } catch (error) {
          console.error(`[NotionSync] Batch embedding failed:`, error);
          for (const page of batch) {
            result.itemsFailed++;
            result.errors.push({
              id: page.id,
              error: error instanceof Error ? error.message : 'Embedding failed',
            });
          }
        }
      }

      const latestTime = pagesToProcess.reduce((max, p) => 
        p.lastEditedTime > max ? p.lastEditedTime : max, 
        pagesToProcess[0]?.lastEditedTime || ''
      );

      if (latestTime) {
        await this.updateSyncCursor(latestTime, result.itemsSynced);
        result.lastCursor = latestTime;
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'notion', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      const elapsed = Date.now() - startTime;
      console.log(
        `[NotionSync] Local sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed in ${elapsed}ms`
      );
    } catch (error) {
      console.error('[NotionSync] Local sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  /**
   * Fallback sync using Notion API (when local cache unavailable)
   * Collects pages first, then batch-embeds for performance.
   */
  private async syncFromApi(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');
      onProgress?.({ source: 'notion', phase: 'discovering', current: 0, total: 0 });

      const lastSyncCursor = await this.getLastSyncCursor();
      console.log(`[NotionSync] Last sync cursor: ${lastSyncCursor || 'none'}`);

      // Phase 1: Discover all pages
      const allPages: NotionPage[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        console.log(`[NotionSync] Calling searchPagesForSync with cursor: ${cursor || 'none'}`);
        const searchResult = await this.notionService.searchPagesForSync(100, cursor);

        if (!searchResult.success || !searchResult.pages) {
          throw new Error(searchResult.error || 'Failed to fetch pages');
        }

        const pagesToSync = lastSyncCursor
          ? searchResult.pages.filter((page) => page.lastEditedTime > lastSyncCursor)
          : searchResult.pages;

        console.log(
          `[NotionSync] Found ${pagesToSync.length} pages to sync (${searchResult.pages.length} in batch, cursor: ${cursor || 'none'})`
        );

        allPages.push(...pagesToSync);
        hasMore = searchResult.hasMore ?? false;
        cursor = searchResult.nextCursor ?? undefined;
      }

      if (allPages.length === 0) {
        await this.updateSyncStatus('idle');
        onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
        return result;
      }

      // Phase 2: Fetch page content with concurrency limit
      const CONCURRENCY = 3;
      const MAX_TEXT_CHARS = 5000;
      const pagesWithContent: Array<{
        page: NotionPage;
        preprocessed: string;
        hash: string;
        metadata: Record<string, unknown>;
      }> = [];

      for (let i = 0; i < allPages.length; i += CONCURRENCY) {
        const chunk = allPages.slice(i, i + CONCURRENCY);
        onProgress?.({ source: 'notion', phase: 'syncing', current: i, total: allPages.length });

        const results = await Promise.allSettled(
          chunk.map(async (page) => {
            const contentResult = await this.notionService.getPageContent(page.id);
            return { page, contentResult };
          })
        );

        for (const settled of results) {
          if (settled.status === 'rejected') {
            result.itemsFailed++;
            result.errors.push({ id: 'unknown', error: String(settled.reason) });
            continue;
          }

          const { page, contentResult } = settled.value;
          if (!contentResult.success || !contentResult.content) {
            result.itemsFailed++;
            result.errors.push({
              id: page.id,
              error: contentResult.error || 'Failed to fetch page content',
            });
            continue;
          }

          const fullText = `${page.title}\n\n${contentResult.content}`;
          let preprocessed = this.preprocessor.preprocess(fullText);
          if (preprocessed.length > MAX_TEXT_CHARS) {
            preprocessed = preprocessed.substring(0, MAX_TEXT_CHARS);
          }
          const hash = this.calculateContentHash(preprocessed);

          if (preprocessed.trim().length === 0) continue;

          pagesWithContent.push({
            page,
            preprocessed,
            hash,
            metadata: {
              url: page.url,
              icon: page.icon,
              parentType: page.parentType,
              blockCount: contentResult.blockCount,
              truncated: contentResult.truncated,
            },
          });
        }
      }

      // Phase 3: Filter unchanged pages
      const db = this.dbService.getDb();
      const existingHashes = await db.query<{ source_id: string; content_hash: string }>(
        `SELECT source_id, content_hash FROM documents WHERE source_type = $1`,
        ['notion']
      );
      const hashMap = new Map(existingHashes.rows.map(r => [r.source_id, r.content_hash]));

      const changedPages = pagesWithContent.filter(p => hashMap.get(p.page.id) !== p.hash);
      console.log(`[NotionSync] ${changedPages.length} pages changed (need embedding)`);

      // Phase 4: Batch embed and save
      const BATCH_SIZE = 300;
      for (let i = 0; i < changedPages.length; i += BATCH_SIZE) {
        const batch = changedPages.slice(i, i + BATCH_SIZE);
        const texts = batch.map(p => p.preprocessed);

        onProgress?.({ source: 'notion', phase: 'embedding', current: i, total: changedPages.length });
        console.log(`[NotionSync] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(changedPages.length / BATCH_SIZE)} (${batch.length} pages)`);

        try {
          const embeddings = await this.embeddingClient.embed(texts);

          const savePromises = batch.map(async (item, idx) => {
            try {
              await db.query(
                `
                INSERT INTO documents (
                  source_type, source_id, title, content, content_hash,
                  embedding, metadata, source_created_at, source_updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (source_type, source_id) 
                DO UPDATE SET
                  title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  content_hash = EXCLUDED.content_hash,
                  embedding = EXCLUDED.embedding,
                  metadata = EXCLUDED.metadata,
                  source_updated_at = EXCLUDED.source_updated_at,
                  indexed_at = NOW()
                `,
                [
                  'notion',
                  item.page.id,
                  item.page.title,
                  item.preprocessed,
                  item.hash,
                  JSON.stringify(embeddings[idx]),
                  JSON.stringify(item.metadata),
                  new Date(item.page.lastEditedTime),
                  new Date(item.page.lastEditedTime)
                ]
              );
              result.itemsSynced++;
            } catch (error) {
              result.itemsFailed++;
              result.errors.push({
                id: item.page.id,
                error: error instanceof Error ? error.message : 'DB insert failed',
              });
            }
          });

          await Promise.all(savePromises);
        } catch (error) {
          console.error(`[NotionSync] Batch embedding failed:`, error);
          for (const item of batch) {
            result.itemsFailed++;
            result.errors.push({
              id: item.page.id,
              error: error instanceof Error ? error.message : 'Embedding failed',
            });
          }
        }
      }

      const latestTime = allPages.reduce((max, p) =>
        p.lastEditedTime > max ? p.lastEditedTime : max,
        allPages[0]?.lastEditedTime || ''
      );

      if (latestTime) {
        await this.updateSyncCursor(latestTime, result.itemsSynced);
        result.lastCursor = latestTime;
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'notion', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      const elapsed = Date.now() - startTime;
      console.log(
        `[NotionSync] API sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed in ${elapsed}ms`
      );
    } catch (error) {
      console.error('[NotionSync] API sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  /**
   * Sync a single page to database
   */
  private async syncPage(page: NotionPage): Promise<void> {
    console.log(`[NotionSync] Syncing page: ${page.title} (${page.id})`);

    const contentResult = await this.notionService.getPageContent(page.id);

    if (!contentResult.success || !contentResult.content) {
      throw new Error(contentResult.error || 'Failed to fetch page content');
    }

    const fullText = `${page.title}\n\n${contentResult.content}`;
    const preprocessedText = this.preprocessor.preprocess(fullText);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();
    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['notion', page.id]
    );

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      console.log(`[NotionSync] Page ${page.id} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingClient.embedSingle(preprocessedText);

    const metadata = {
      url: page.url,
      icon: page.icon,
      parentType: page.parentType,
      blockCount: contentResult.blockCount,
      truncated: contentResult.truncated,
    };
    await db.query(
      `
      INSERT INTO documents (
        source_type, source_id, title, content, content_hash,
        embedding, metadata, source_created_at, source_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source_type, source_id) 
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        source_updated_at = EXCLUDED.source_updated_at,
        indexed_at = NOW()
      WHERE documents.content_hash != EXCLUDED.content_hash
    `,
      [
        'notion',
        page.id,
        page.title,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        new Date(page.lastEditedTime),
        new Date(page.lastEditedTime)
      ]
    );

    console.log(`[NotionSync] Page ${page.id} synced successfully`);
  }

  private async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['notion']
    );

    return result.rows[0]?.cursor_value || null;
  }

  private async getSavedPaginationCursor(): Promise<string | undefined> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['notion_pagination_cursor']
    );
    return result.rows[0]?.cursor_value || undefined;
  }

  private async savePaginationCursor(cursor: string): Promise<void> {
    const db = this.dbService.getDb();
    await db.query(
      `INSERT INTO sync_cursors (source_type, cursor_value, cursor_type)
       VALUES ($1, $2, 'pagination_cursor')
       ON CONFLICT (source_type) DO UPDATE SET cursor_value = EXCLUDED.cursor_value`,
      ['notion_pagination_cursor', cursor]
    );
    console.log(`[NotionSync] Saved pagination cursor for resume: ${cursor}`);
  }

  private async clearPaginationCursor(): Promise<void> {
    const db = this.dbService.getDb();
    await db.query(
      `DELETE FROM sync_cursors WHERE source_type = $1`,
      ['notion_pagination_cursor']
    );
  }

  /**
   * Update sync cursor in database
   */
  private async updateSyncCursor(cursor: string, itemCount: number): Promise<void> {
    const db = this.dbService.getDb();
    await db.query(
      `
      INSERT INTO sync_cursors (source_type, cursor_value, cursor_type, items_synced)
      VALUES ($1, $2, 'timestamp', $3)
      ON CONFLICT (source_type) DO UPDATE SET
        cursor_value = EXCLUDED.cursor_value,
        last_synced_at = NOW(),
        items_synced = sync_cursors.items_synced + EXCLUDED.items_synced,
        status = 'idle'
    `,
      ['notion', cursor, itemCount]
    );
  }

  /**
   * Update sync status in database
   */
  private async updateSyncStatus(status: 'idle' | 'syncing' | 'error'): Promise<void> {
    const db = this.dbService.getDb();
    if (status === 'idle') {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status, last_synced_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status,
          last_synced_at = NOW()
      `,
        ['notion', status]
      );
    } else {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status)
        VALUES ($1, $2)
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status
      `,
        ['notion', status]
      );
    }
  }

  /**
   * Calculate MD5 hash of content for change detection
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

/**
 * Factory function for creating NotionSyncAdapter instance
 */
export function createNotionSyncAdapter(): NotionSyncAdapter {
  return new NotionSyncAdapter();
}
