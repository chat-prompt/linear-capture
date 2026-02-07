/**
 * NotionSyncAdapter - Sync Notion pages to local database
 *
 * Features:
 * - Incremental sync based on last_edited_time
 * - Content extraction via NotionService
 * - Text preprocessing and embedding generation
 * - Change detection via content_hash
 * - Per-page error tracking (don't block entire sync)
 *
 * Delegates to:
 * - notion-sync-local.ts for local cache sync
 * - notion-sync-api.ts for API fallback sync
 */

import { BaseSyncAdapter } from './base-sync-adapter';
import { createNotionService } from '../notion-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import { isNotionDbAvailable } from '../notion-local-reader';
import { syncFromLocal } from './notion-sync-local';
import { syncFromApi } from './notion-sync-api';
import { upsertNotionDocument } from './notion-sync-upsert';
import type { NotionService } from '../notion-client';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import type { SyncResult } from '../../types';
import { logger } from '../utils/logger';

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

export class NotionSyncAdapter extends BaseSyncAdapter {
  protected readonly sourceType = 'notion';
  private notionService: NotionService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;

  constructor() {
    super();
    this.notionService = createNotionService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
  }

  /**
   * Full sync - fetch all pages (for initial sync)
   */
  async sync(): Promise<SyncResult> {
    logger.info('[NotionSync] Starting full sync');

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
        logger.info(`[NotionSync] Resuming from saved cursor: ${cursor}`);
      }

      let hasMore = true;
      let latestTime: string | undefined;

      while (hasMore) {
        const searchResult = await this.notionService.searchPagesForSync(100, cursor);

        if (!searchResult.success || !searchResult.pages) {
          throw new Error(searchResult.error || 'Failed to fetch pages');
        }

        logger.info(`[NotionSync] Found ${searchResult.pages.length} pages (cursor: ${cursor || 'none'})`);

        for (const page of searchResult.pages) {
          try {
            await this.syncPage(page);
            result.itemsSynced++;
          } catch (error) {
            logger.error(`[NotionSync] Failed to sync page ${page.id}:`, error);
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

      logger.info(
        `[NotionSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      logger.error('[NotionSync] Full sync failed:', error);
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
    logger.info('[NotionSync] Starting incremental sync');

    const deps = {
      dbService: this.dbService,
      notionService: this.notionService,
      preprocessor: this.preprocessor,
      embeddingClient: this.embeddingClient,
      getLastSyncCursor: () => this.getLastSyncCursor(),
      updateSyncCursor: (cursor: string, itemCount: number) => this.updateSyncCursor(cursor, itemCount),
      updateSyncStatus: (status: 'idle' | 'syncing' | 'error') => this.updateSyncStatus(status),
      calculateContentHash: (content: string) => this.calculateContentHash(content),
    };

    if (isNotionDbAvailable()) {
      logger.info('[NotionSync] Using local reader (optimized batch sync)');
      return syncFromLocal(deps, onProgress);
    }

    logger.info('[NotionSync] Local reader unavailable, using API fallback');
    return syncFromApi(deps, onProgress);
  }

  /**
   * Sync a single page to database
   */
  private async syncPage(page: { id: string; title: string; url: string; icon?: string; parentType?: string; lastEditedTime: string }): Promise<void> {
    logger.info(`[NotionSync] Syncing page: ${page.title} (${page.id})`);

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
      logger.info(`[NotionSync] Page ${page.id} unchanged, skipping`);
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

    await upsertNotionDocument(db, {
      sourceId: page.id,
      title: page.title,
      content: preprocessedText,
      contentHash,
      embedding: JSON.stringify(Array.from(embedding)),
      metadata: JSON.stringify(metadata),
      sourceDate: new Date(page.lastEditedTime),
    });

    logger.info(`[NotionSync] Page ${page.id} synced successfully`);
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
    logger.info(`[NotionSync] Saved pagination cursor for resume: ${cursor}`);
  }

  private async clearPaginationCursor(): Promise<void> {
    const db = this.dbService.getDb();
    await db.query(
      `DELETE FROM sync_cursors WHERE source_type = $1`,
      ['notion_pagination_cursor']
    );
  }

}

/**
 * Factory function for creating NotionSyncAdapter instance
 */
export function createNotionSyncAdapter(): NotionSyncAdapter {
  return new NotionSyncAdapter();
}
