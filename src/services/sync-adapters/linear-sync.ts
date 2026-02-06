/**
 * LinearSyncAdapter - Sync Linear issues to local database
 *
 * Features:
 * - Incremental sync based on updatedAt timestamp
 * - Issue fetching via Linear SDK
 * - Text preprocessing and embedding generation
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

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ itemId: string; error: string }>;
  lastCursor?: string;
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

  /**
   * Full sync - fetch all issues (for initial sync)
   */
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

      // Fetch all issues via Linear SDK
      const client = (this.linearService as any).client;
      const issues = await client.issues({ first: 100 });

      console.log(`[LinearSync] Found ${issues.nodes.length} issues`);

      let latestUpdatedAt: string | null = null;

      for (const issue of issues.nodes) {
        try {
          await this.syncIssue(issue);
          result.itemsSynced++;

          const updatedAt = issue.updatedAt?.toISOString();
          if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
            latestUpdatedAt = updatedAt;
          }
        } catch (error) {
          console.error(`[LinearSync] Failed to sync issue ${issue.id}:`, error);
          result.itemsFailed++;
          result.errors.push({
            itemId: issue.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
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

  /**
   * Incremental sync - fetch only issues modified after last sync
   */
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

      const issues = await client.issues({ first: 100, filter });
      const totalIssues = issues.nodes.length;

      console.log(`[LinearSync] Found ${totalIssues} issues to sync`);

      let latestUpdatedAt: string | null = lastCursor;
      let processedCount = 0;

      for (const issue of issues.nodes) {
        try {
          onProgress?.({ source: 'linear', phase: 'syncing', current: processedCount, total: totalIssues });
          await this.syncIssue(issue);
          result.itemsSynced++;
          processedCount++;

          const updatedAt = issue.updatedAt?.toISOString();
          if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
            latestUpdatedAt = updatedAt;
          }
        } catch (error) {
          console.error(`[LinearSync] Failed to sync issue ${issue.id}:`, error);
          result.itemsFailed++;
          processedCount++;
          result.errors.push({
            itemId: issue.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
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

  private async syncIssue(issue: Issue): Promise<void> {
    console.log(`[LinearSync] Syncing issue: ${issue.identifier} - ${issue.title}`);

    const team = await issue.team;
    const project = await issue.project;
    const state = await issue.state;
    const assignee = await issue.assignee;
    const labelsConnection = await issue.labels();
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

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      console.log(`[LinearSync] Issue ${issue.id} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingClient.embedSingle(preprocessedText);

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
        issue.id,
        null, // parent_id is null for issues
        `${issue.identifier}: ${issue.title}`,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        issue.createdAt,
        issue.updatedAt,
      ]
    );

    console.log(`[LinearSync] Issue ${issue.id} synced successfully`);
  }

  /**
   * Get last sync cursor from database
   */
  private async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['linear']
    );

    return result.rows[0]?.cursor_value || null;
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
      ['linear', cursor, itemCount]
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

  /**
   * Calculate MD5 hash of content for change detection
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

/**
 * Factory function for creating LinearSyncAdapter instance
 */
export function createLinearSyncAdapter(): LinearSyncAdapter {
  return new LinearSyncAdapter();
}
