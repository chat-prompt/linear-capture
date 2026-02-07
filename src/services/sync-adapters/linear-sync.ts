/**
 * LinearSyncAdapter - Sync Linear issues to local database
 *
 * Features:
 * - Incremental sync based on updatedAt timestamp
 * - Issue fetching via Linear SDK
 * - Batch processing (10 issues at a time)
 * - Batch embedding for performance
 * - Change detection via content_hash
 * - Per-item error tracking (don't block entire sync)
 */

import { BaseSyncAdapter } from './base-sync-adapter';
import { createLinearServiceFromEnv } from '../linear-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import type { LinearService } from '../linear-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import type { Issue } from '@linear/sdk';
import type { SyncResult } from '../../types';
import { logger } from '../utils/logger';

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

const BATCH_SIZE = 25;

interface PreparedIssue {
  issue: Issue;
  preprocessedText: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  title: string;
  needsUpdate: boolean;
}

interface BatchResult {
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
  latestUpdatedAt: string | null;
}

export class LinearSyncAdapter extends BaseSyncAdapter {
  protected readonly sourceType = 'linear';
  private linearService: LinearService | null;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;

  constructor() {
    super();
    this.linearService = createLinearServiceFromEnv();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
  }

   async sync(): Promise<SyncResult> {
     logger.info('[LinearSync] Starting full sync');

     const result: SyncResult = {
       success: true,
       itemsSynced: 0,
       itemsFailed: 0,
       errors: [],
     };

     if (!this.linearService) {
       logger.error('[LinearSync] LinearService not initialized');
       return { ...result, success: false, errors: [{ id: 'init', error: 'LinearService not initialized' }] };
     }

    try {
      await this.updateSyncStatus('syncing');

      const client = (this.linearService as any).client;
      const allIssues = await this.fetchAllIssues(client, {});

      logger.info(`[LinearSync] Found ${allIssues.length} issues`);

      let latestUpdatedAt: string | null = null;

      for (let i = 0; i < allIssues.length; i += BATCH_SIZE) {
        const batch = allIssues.slice(i, i + BATCH_SIZE);
        const batchResult = await this.processBatch(batch);

        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        if (batchResult.latestUpdatedAt && (!latestUpdatedAt || batchResult.latestUpdatedAt > latestUpdatedAt)) {
          latestUpdatedAt = batchResult.latestUpdatedAt;
        }
      }

      const totalFetched = allIssues.length;
      const syncRatio = totalFetched > 0 ? result.itemsSynced / totalFetched : 1;

      if (latestUpdatedAt) {
        if (syncRatio >= 0.8) {
          await this.updateSyncCursor(latestUpdatedAt, result.itemsSynced);
          result.lastCursor = latestUpdatedAt;
        } else {
          logger.warn(
            `[LinearSync] Cursor not advanced: only ${result.itemsSynced}/${totalFetched} items synced (${(syncRatio * 100).toFixed(1)}% < 80% threshold)`
          );
        }
      }

      await this.updateSyncStatus('idle');

      logger.info(
        `[LinearSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      logger.error('[LinearSync] Full sync failed:', error);
      result.success = false;
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

   async syncIncremental(onProgress?: SyncProgressCallback): Promise<SyncResult> {
     logger.info('[LinearSync] Starting incremental sync');

     const result: SyncResult = {
       success: true,
       itemsSynced: 0,
       itemsFailed: 0,
       errors: [],
     };

     if (!this.linearService) {
       logger.error('[LinearSync] LinearService not initialized');
       return { ...result, success: false, errors: [{ id: 'init', error: 'LinearService not initialized' }] };
     }

     try {
       await this.updateSyncStatus('syncing');
       onProgress?.({ source: 'linear', phase: 'discovering', current: 0, total: 0 });

      const lastCursor = await this.getLastSyncCursor();
      logger.info(`[LinearSync] Last sync cursor: ${lastCursor || 'none'}`);

      const client = (this.linearService as any).client;
      const filter = lastCursor
        ? { updatedAt: { gt: new Date(lastCursor) } }
        : {};
      logger.info(`[LinearSync] Incremental sync filter:`, JSON.stringify(filter));

      const allIssues = await this.fetchAllIssues(client, filter);
      const totalIssues = allIssues.length;

      logger.info(`[LinearSync] Found ${totalIssues} issues to sync`);

      let latestUpdatedAt: string | null = lastCursor;
      let processedCount = 0;

      for (let i = 0; i < allIssues.length; i += BATCH_SIZE) {
        const batch = allIssues.slice(i, i + BATCH_SIZE);
        onProgress?.({ source: 'linear', phase: 'syncing', current: processedCount, total: totalIssues });

        const batchResult = await this.processBatch(batch);

        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);
        processedCount += batch.length;

        if (batchResult.latestUpdatedAt && (!latestUpdatedAt || batchResult.latestUpdatedAt > latestUpdatedAt)) {
          latestUpdatedAt = batchResult.latestUpdatedAt;
        }
      }

      const totalFetched = allIssues.length;
      const syncRatio = totalFetched > 0 ? result.itemsSynced / totalFetched : 1;

      if (latestUpdatedAt && latestUpdatedAt !== lastCursor) {
        if (syncRatio >= 0.8) {
          await this.updateSyncCursor(latestUpdatedAt, result.itemsSynced);
          result.lastCursor = latestUpdatedAt;
        } else {
          logger.warn(
            `[LinearSync] Cursor not advanced: only ${result.itemsSynced}/${totalFetched} items synced (${(syncRatio * 100).toFixed(1)}% < 80% threshold)`
          );
        }
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'linear', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      logger.info(
        `[LinearSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      logger.error('[LinearSync] Incremental sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'linear', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  private async fetchAllIssues(client: any, filter: Record<string, unknown>): Promise<Issue[]> {
    const seenIds = new Set<string>();
    const allNodes: Issue[] = [];
    let pageCount = 1;
    const MAX_PAGES = 200; // Safety limit: 200 pages * 100 = 20,000 issues max

    let connection = await client.issues({ first: 100, filter });
    for (const node of connection.nodes) {
      if (!seenIds.has(node.id)) {
        seenIds.add(node.id);
        allNodes.push(node);
      }
    }
    logger.info(`[LinearSync] Page ${pageCount}: fetched ${connection.nodes.length} issues (${allNodes.length} unique total)`);

    while (connection.pageInfo.hasNextPage && pageCount < MAX_PAGES) {
      try {
        pageCount++;
        connection = await connection.fetchNext();

        let newCount = 0;
        let dupCount = 0;
        for (const node of connection.nodes) {
          if (!seenIds.has(node.id)) {
            seenIds.add(node.id);
            allNodes.push(node);
            newCount++;
          } else {
            dupCount++;
          }
        }

        logger.info(`[LinearSync] Page ${pageCount}: fetched ${connection.nodes.length} (${newCount} new, ${dupCount} duplicates) — ${allNodes.length} unique total`);

        // Detect pagination loop: if entire page is duplicates, stop
        if (newCount === 0 && connection.nodes.length > 0) {
          logger.warn(`[LinearSync] Pagination loop detected at page ${pageCount}: all ${dupCount} items are duplicates. Stopping.`);
          break;
        }
      } catch (error) {
        logger.error(`[LinearSync] Error fetching page ${pageCount}:`, error);
        logger.warn(`[LinearSync] Returning partial results: ${allNodes.length} issues from ${pageCount - 1} complete pages`);
        break;
      }
    }

    if (pageCount >= MAX_PAGES) {
      logger.warn(`[LinearSync] Reached max page limit (${MAX_PAGES}). Returning ${allNodes.length} issues.`);
    }

    logger.info(`[LinearSync] fetchAllIssues complete: ${allNodes.length} unique issues from ${pageCount} pages`);
    return allNodes;
  }

  private async processBatch(issues: Issue[]): Promise<BatchResult> {
    const result: BatchResult = {
      synced: 0,
      failed: 0,
      errors: [],
      latestUpdatedAt: null,
    };

    if (issues.length === 0) return result;

    const prepareResults = await Promise.allSettled(
      issues.map(issue => this.prepareIssueData(issue))
    );

    const prepared: PreparedIssue[] = [];
    for (let i = 0; i < prepareResults.length; i++) {
      const prepResult = prepareResults[i];
       if (prepResult.status === 'fulfilled') {
         prepared.push(prepResult.value);
       } else {
         result.failed++;
         result.errors.push({
           id: issues[i].id,
           error: prepResult.reason instanceof Error ? prepResult.reason.message : 'Prepare failed',
         });
       }
    }

    const needsUpdate = prepared.filter(p => p.needsUpdate);

    if (needsUpdate.length === 0) {
      for (const p of prepared) {
        const updatedAt = p.issue.updatedAt?.toISOString();
        if (updatedAt && (!result.latestUpdatedAt || updatedAt > result.latestUpdatedAt)) {
          result.latestUpdatedAt = updatedAt;
        }
      }
      result.synced = prepared.length;
      return result;
    }

    const texts = needsUpdate.map(p => p.preprocessedText);
    let embeddings: Float32Array[];

     try {
       embeddings = await this.embeddingClient.embed(texts);
       const emptyEmbeddings = embeddings.filter(e => e.length === 0 || e.every(v => v === 0)).length;
       if (emptyEmbeddings > 0) {
         logger.warn(`[LinearSync] ${emptyEmbeddings}/${embeddings.length} embeddings are empty/zero`);
       }
     } catch (error) {
       logger.error(`[LinearSync] Batch embedding failed for ${needsUpdate.length} items:`, error);
       for (const p of needsUpdate) {
         result.failed++;
         result.errors.push({
           id: p.issue.id,
           error: 'Embedding failed',
         });
       }
      result.synced = prepared.length - needsUpdate.length;
      return result;
    }

    const db = this.dbService.getDb();
    const saveResults = await Promise.allSettled(
      needsUpdate.map((p, idx) => this.saveIssueToDb(db, p, embeddings[idx]))
    );

    for (let i = 0; i < saveResults.length; i++) {
      const saveResult = saveResults[i];
      const p = needsUpdate[i];
      const updatedAt = p.issue.updatedAt?.toISOString();

       if (saveResult.status === 'fulfilled') {
         result.synced++;
         if (updatedAt && (!result.latestUpdatedAt || updatedAt > result.latestUpdatedAt)) {
           result.latestUpdatedAt = updatedAt;
         }
       } else {
         result.failed++;
         result.errors.push({
           id: p.issue.id,
           error: saveResult.reason instanceof Error ? saveResult.reason.message : 'Save failed',
         });
       }
     }

    const unchangedCount = prepared.length - needsUpdate.length;
    result.synced += unchangedCount;

    for (const p of prepared.filter(x => !x.needsUpdate)) {
      const updatedAt = p.issue.updatedAt?.toISOString();
      if (updatedAt && (!result.latestUpdatedAt || updatedAt > result.latestUpdatedAt)) {
        result.latestUpdatedAt = updatedAt;
      }
    }

    return result;
  }

  private async prepareIssueData(issue: Issue): Promise<PreparedIssue> {
    const contentParts = [
      `${issue.identifier}: ${issue.title}`,
      issue.description || '',
    ].filter(Boolean);

    const fullText = contentParts.join('\n');
    const preprocessedText = this.preprocessor.preprocess(fullText);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();
    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['linear', issue.id]
    );

    const needsUpdate = existingDoc.rows.length === 0 || existingDoc.rows[0].content_hash !== contentHash;

    const metadata = {
      identifier: issue.identifier,
      priority: issue.priority,
      url: issue.url,
    };

    return {
      issue,
      preprocessedText,
      contentHash,
      metadata,
      title: `${issue.identifier}: ${issue.title}`,
      needsUpdate,
    };
  }

  private async saveIssueToDb(
    db: ReturnType<DatabaseService['getDb']>,
    prepared: PreparedIssue,
    embedding: Float32Array
  ): Promise<void> {
    await db.query(
      `
      INSERT INTO documents (
        source_type, source_id, parent_id, title, content, content_hash,
        embedding, metadata, source_created_at, source_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        'linear',
        prepared.issue.id,
        null,
        prepared.title,
        prepared.preprocessedText,
        prepared.contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(prepared.metadata),
        prepared.issue.createdAt,
        prepared.issue.updatedAt,
      ]
    );
  }

}

export function createLinearSyncAdapter(): LinearSyncAdapter {
  return new LinearSyncAdapter();
}
