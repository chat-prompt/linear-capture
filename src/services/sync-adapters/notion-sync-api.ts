/**
 * Notion API Sync - Fallback sync using Notion API
 *
 * Used when local Notion cache is unavailable.
 * Collects pages first, then batch-embeds for performance.
 */

import type { NotionService, NotionPage } from '../notion-client';
import type { TextPreprocessor } from '../text-preprocessor';
import type { EmbeddingClient } from '../embedding-client';
import type { DatabaseService } from '../database';
import type { SyncResult, SyncProgressCallback } from '../../types';
import { logger } from '../utils/logger';
import { upsertNotionDocument } from './notion-sync-upsert';

interface SyncFromApiDeps {
  dbService: DatabaseService;
  notionService: NotionService;
  preprocessor: TextPreprocessor;
  embeddingClient: EmbeddingClient;
  getLastSyncCursor: () => Promise<string | null>;
  updateSyncCursor: (cursor: string, itemCount: number) => Promise<void>;
  updateSyncStatus: (status: 'idle' | 'syncing' | 'error') => Promise<void>;
  calculateContentHash: (content: string) => string;
}

export async function syncFromApi(
  deps: SyncFromApiDeps,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: true,
    itemsSynced: 0,
    itemsFailed: 0,
    errors: [],
  };

  try {
    await deps.updateSyncStatus('syncing');
    onProgress?.({ source: 'notion', phase: 'discovering', current: 0, total: 0 });

    const lastSyncCursor = await deps.getLastSyncCursor();
    logger.info(`[NotionSync] Last sync cursor: ${lastSyncCursor || 'none'}`);

    // Phase 1: Discover all pages
    const allPages: NotionPage[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      logger.info(`[NotionSync] Calling searchPagesForSync with cursor: ${cursor || 'none'}`);
      const searchResult = await deps.notionService.searchPagesForSync(100, cursor);

      if (!searchResult.success || !searchResult.pages) {
        throw new Error(searchResult.error || 'Failed to fetch pages');
      }

      const pagesToSync = lastSyncCursor
        ? searchResult.pages.filter((page) => page.lastEditedTime > lastSyncCursor)
        : searchResult.pages;

      logger.info(
        `[NotionSync] Found ${pagesToSync.length} pages to sync (${searchResult.pages.length} in batch, cursor: ${cursor || 'none'})`
      );

      allPages.push(...pagesToSync);
      hasMore = searchResult.hasMore ?? false;
      cursor = searchResult.nextCursor ?? undefined;
    }

    if (allPages.length === 0) {
      await deps.updateSyncStatus('idle');
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
          const contentResult = await deps.notionService.getPageContent(page.id);
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
        let preprocessed = deps.preprocessor.preprocess(fullText);
        if (preprocessed.length > MAX_TEXT_CHARS) {
          preprocessed = preprocessed.substring(0, MAX_TEXT_CHARS);
        }
        const hash = deps.calculateContentHash(preprocessed);

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
    const db = deps.dbService.getDb();
    const existingHashes = await db.query<{ source_id: string; content_hash: string }>(
      `SELECT source_id, content_hash FROM documents WHERE source_type = $1`,
      ['notion']
    );
    const hashMap = new Map(existingHashes.rows.map(r => [r.source_id, r.content_hash]));

    const changedPages = pagesWithContent.filter(p => hashMap.get(p.page.id) !== p.hash);
    logger.info(`[NotionSync] ${changedPages.length} pages changed (need embedding)`);

    // Phase 4: Batch embed and save
    const BATCH_SIZE = 300;
    for (let i = 0; i < changedPages.length; i += BATCH_SIZE) {
      const batch = changedPages.slice(i, i + BATCH_SIZE);
      const texts = batch.map(p => p.preprocessed);

      onProgress?.({ source: 'notion', phase: 'embedding', current: i, total: changedPages.length });
      logger.info(`[NotionSync] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(changedPages.length / BATCH_SIZE)} (${batch.length} pages)`);

      try {
        const embeddings = await deps.embeddingClient.embed(texts);

        const savePromises = batch.map(async (item, idx) => {
          try {
            await upsertNotionDocument(db, {
              sourceId: item.page.id,
              title: item.page.title,
              content: item.preprocessed,
              contentHash: item.hash,
              embedding: JSON.stringify(embeddings[idx]),
              metadata: JSON.stringify(item.metadata),
              sourceDate: new Date(item.page.lastEditedTime),
            });
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
        logger.error(`[NotionSync] Batch embedding failed:`, error);
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
      await deps.updateSyncCursor(latestTime, result.itemsSynced);
      result.lastCursor = latestTime;
    }

    await deps.updateSyncStatus('idle');
    onProgress?.({ source: 'notion', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

    const elapsed = Date.now() - startTime;
    logger.info(
      `[NotionSync] API sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed in ${elapsed}ms`
    );
  } catch (error) {
    logger.error('[NotionSync] API sync failed:', error);
    result.success = false;
    onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
    await deps.updateSyncStatus('error');
    throw error;
  }

  return result;
}
