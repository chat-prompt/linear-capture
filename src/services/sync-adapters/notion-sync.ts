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
import { createEmbeddingService } from '../embedding-service';
import type { NotionService, NotionPage } from '../notion-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { EmbeddingService } from '../embedding-service';

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ pageId: string; error: string }>;
  lastCursor?: string;
}

export class NotionSyncAdapter {
  private notionService: NotionService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingService: EmbeddingService;

  constructor() {
    this.notionService = createNotionService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingService = createEmbeddingService();
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
        const searchResult = await this.notionService.searchPages('', 100, cursor);

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
              pageId: page.id,
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
   * Incremental sync - fetch only pages modified after last sync
   */
  async syncIncremental(): Promise<SyncResult> {
    console.log('[NotionSync] Starting incremental sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');

      const lastSyncCursor = await this.getLastSyncCursor();
      console.log(`[NotionSync] Last sync cursor: ${lastSyncCursor || 'none'}`);

      let cursor: string | undefined;
      let hasMore = true;
      let latestTime: string | undefined;

      while (hasMore) {
        const searchResult = await this.notionService.searchPages('', 100, cursor);

        if (!searchResult.success || !searchResult.pages) {
          throw new Error(searchResult.error || 'Failed to fetch pages');
        }

        const pagesToSync = lastSyncCursor
          ? searchResult.pages.filter((page) => page.lastEditedTime > lastSyncCursor)
          : searchResult.pages;

        console.log(
          `[NotionSync] Found ${pagesToSync.length} pages to sync (${searchResult.pages.length} in batch, cursor: ${cursor || 'none'})`
        );

        for (const page of pagesToSync) {
          try {
            await this.syncPage(page);
            result.itemsSynced++;
          } catch (error) {
            console.error(`[NotionSync] Failed to sync page ${page.id}:`, error);
            result.itemsFailed++;
            result.errors.push({
              pageId: page.id,
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

      await this.updateSyncStatus('idle');

      console.log(
        `[NotionSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[NotionSync] Incremental sync failed:', error);
      result.success = false;
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

    const embedding = await this.embeddingService.embed(preprocessedText);

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
        JSON.stringify(embedding),
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
