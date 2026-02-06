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

import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import { createLinearServiceFromEnv } from '../linear-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import type { LinearService } from '../linear-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import type { Issue } from '@linear/sdk';

const BATCH_SIZE = 10;

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ itemId: string; error: string }>;
  lastCursor?: string;
}

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
  errors: Array<{ itemId: string; error: string }>;
  latestUpdatedAt: string | null;
}

export class LinearSyncAdapter {
  private linearService: LinearService | null;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;

  constructor() {
    this.linearService = createLinearServiceFromEnv();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
  }

  async sync(): Promise<SyncResult> {
    console.log('[LinearSync] Starting full sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    if (!this.linearService) {
      console.error('[LinearSync] LinearService not initialized');
      return { ...result, success: false, errors: [{ itemId: 'init', error: 'LinearService not initialized' }] };
    }

    try {
      await this.updateSyncStatus('syncing');

      const client = (this.linearService as any).client;
      const allIssues = await this.fetchAllIssues(client, {});

      console.log(`[LinearSync] Found ${allIssues.length} issues`);

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

      if (latestUpdatedAt) {
        await this.updateSyncCursor(latestUpdatedAt, result.itemsSynced);
        result.lastCursor = latestUpdatedAt;
      }

      await this.updateSyncStatus('idle');

      console.log(
        `[LinearSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[LinearSync] Full sync failed:', error);
      result.success = false;
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  async syncIncremental(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    console.log('[LinearSync] Starting incremental sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    if (!this.linearService) {
      console.error('[LinearSync] LinearService not initialized');
      return { ...result, success: false, errors: [{ itemId: 'init', error: 'LinearService not initialized' }] };
    }

    try {
      await this.updateSyncStatus('syncing');
      onProgress?.({ source: 'linear', phase: 'discovering', current: 0, total: 0 });

      const lastCursor = await this.getLastSyncCursor();
      console.log(`[LinearSync] Last sync cursor: ${lastCursor || 'none'}`);

      const client = (this.linearService as any).client;
      const filter = lastCursor
        ? { updatedAt: { gt: new Date(lastCursor) } }
        : {};

      const allIssues = await this.fetchAllIssues(client, filter);
      const totalIssues = allIssues.length;

      console.log(`[LinearSync] Found ${totalIssues} issues to sync`);

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

      if (latestUpdatedAt && latestUpdatedAt !== lastCursor) {
        await this.updateSyncCursor(latestUpdatedAt, result.itemsSynced);
        result.lastCursor = latestUpdatedAt;
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'linear', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      console.log(
        `[LinearSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[LinearSync] Incremental sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'linear', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  private async fetchAllIssues(client: any, filter: Record<string, unknown>): Promise<Issue[]> {
    const allNodes: Issue[] = [];
    let connection = await client.issues({ first: 100, filter });
    allNodes.push(...connection.nodes);

    while (connection.pageInfo.hasNextPage) {
      console.log(`[LinearSync] Fetching next page... (${allNodes.length} issues so far)`);
      connection = await connection.fetchNext();
      allNodes.push(...connection.nodes);
    }

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
          itemId: issues[i].id,
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
    } catch (error) {
      console.error('[LinearSync] Batch embedding failed:', error);
      for (const p of needsUpdate) {
        result.failed++;
        result.errors.push({
          itemId: p.issue.id,
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
          itemId: p.issue.id,
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
    const [team, project, state, assignee, labelsConnection] = await Promise.all([
      issue.team,
      issue.project,
      issue.state,
      issue.assignee,
      issue.labels(),
    ]);
    const labels = labelsConnection?.nodes.map(l => l.name).join(', ') || '';

    const contentParts = [
      `${issue.identifier}: ${issue.title}`,
      issue.description || '',
      assignee?.name ? `담당자: ${assignee.name}` : '',
      project?.name ? `프로젝트: ${project.name}` : '',
      team?.name ? `팀: ${team.name}` : '',
      labels ? `라벨: ${labels}` : '',
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
      teamId: team?.id,
      teamName: team?.name,
      projectId: project?.id,
      projectName: project?.name,
      assigneeId: assignee?.id,
      assigneeName: assignee?.name,
      labels,
      state: state?.name,
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

  private async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['linear']
    );

    return result.rows[0]?.cursor_value || null;
  }

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
      ['linear', cursor, itemCount]
    );
  }

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
        ['linear', status]
      );
    } else {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status)
        VALUES ($1, $2)
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status
      `,
        ['linear', status]
      );
    }
  }

  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

export function createLinearSyncAdapter(): LinearSyncAdapter {
  return new LinearSyncAdapter();
}
