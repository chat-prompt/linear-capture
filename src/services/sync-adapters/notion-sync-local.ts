/**
 * Notion Local Sync - Optimized sync using local Notion cache + batch embedding
 *
 * Reads pages from Notion's local SQLite cache (much faster than API),
 * filters by change detection via content_hash, then batch-embeds.
 */

import { getNotionLocalReader } from '../notion-local-reader';
import type { TextPreprocessor } from '../text-preprocessor';
import type { EmbeddingClient } from '../embedding-client';
import type { DatabaseService } from '../database';
import type { SyncResult, SyncProgressCallback } from '../../types';
import { logger } from '../utils/logger';
import { upsertNotionDocument } from './notion-sync-upsert';

interface SyncFromLocalDeps {
  dbService: DatabaseService;
  preprocessor: TextPreprocessor;
  embeddingClient: EmbeddingClient;
  getLastSyncCursor: () => Promise<string | null>;
  updateSyncCursor: (cursor: string, itemCount: number) => Promise<void>;
  updateSyncStatus: (status: 'idle' | 'syncing' | 'error') => Promise<void>;
  calculateContentHash: (content: string) => string;
}

export async function syncFromLocal(
  deps: SyncFromLocalDeps,
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

    const localReader = getNotionLocalReader();
    const pages = await localReader.getAllPagesForSync();
    logger.info(`[NotionSync] Local reader found ${pages.length} pages`);

    if (pages.length === 0) {
      onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
      await deps.updateSyncStatus('idle');
      return result;
    }

    const lastSyncCursor = await deps.getLastSyncCursor();
    const pagesToProcess = lastSyncCursor
      ? pages.filter(p => p.lastEditedTime > lastSyncCursor)
      : pages;

    logger.info(`[NotionSync] ${pagesToProcess.length} pages to process (after cursor filter)`);

    const MAX_TEXT_CHARS = 5000;
    const pagesWithMeta = pagesToProcess.map(page => {
      const fullText = `${page.title}\n\n${page.content}`;
      let preprocessed = deps.preprocessor.preprocess(fullText);
      if (preprocessed.length > MAX_TEXT_CHARS) {
        preprocessed = preprocessed.substring(0, MAX_TEXT_CHARS);
      }
      const hash = deps.calculateContentHash(preprocessed);
      return { ...page, preprocessed, hash };
    });

    const db = deps.dbService.getDb();
    const existingHashes = await db.query<{ source_id: string; content_hash: string }>(
      `SELECT source_id, content_hash FROM documents WHERE source_type = $1`,
      ['notion']
    );
    const hashMap = new Map(existingHashes.rows.map(r => [r.source_id, r.content_hash]));

    const changedPages = pagesWithMeta.filter(p =>
      hashMap.get(p.id) !== p.hash && p.preprocessed.trim().length > 0
    );
    logger.info(`[NotionSync] ${changedPages.length} pages changed (need embedding)`);

    if (changedPages.length === 0) {
      await deps.updateSyncStatus('idle');
      logger.info(`[NotionSync] No changes detected, sync complete in ${Date.now() - startTime}ms`);
      return result;
    }

    const BATCH_SIZE = 300;
    for (let i = 0; i < changedPages.length; i += BATCH_SIZE) {
      const batch = changedPages.slice(i, i + BATCH_SIZE);
      const texts = batch.map(p => p.preprocessed);

      onProgress?.({ source: 'notion', phase: 'embedding', current: i, total: changedPages.length });
      logger.info(`[NotionSync] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(changedPages.length / BATCH_SIZE)} (${batch.length} pages)`);

      try {
        const embeddings = await deps.embeddingClient.embed(texts);

        const savePromises = batch.map(async (page, idx) => {
          try {
            const metadata = { url: page.url };
            await upsertNotionDocument(db, {
              sourceId: page.id,
              title: page.title,
              content: page.preprocessed,
              contentHash: page.hash,
              embedding: JSON.stringify(Array.from(embeddings[idx])),
              metadata: JSON.stringify(metadata),
              sourceDate: new Date(page.lastEditedTime),
            });
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
        logger.error(`[NotionSync] Batch embedding failed:`, error);
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
      await deps.updateSyncCursor(latestTime, result.itemsSynced);
      result.lastCursor = latestTime;
    }

    await deps.updateSyncStatus('idle');
    onProgress?.({ source: 'notion', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

    const elapsed = Date.now() - startTime;
    logger.info(
      `[NotionSync] Local sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed in ${elapsed}ms`
    );
  } catch (error) {
    logger.error('[NotionSync] Local sync failed:', error);
    result.success = false;
    onProgress?.({ source: 'notion', phase: 'complete', current: 0, total: 0 });
    await deps.updateSyncStatus('error');
    throw error;
  }

  return result;
}
