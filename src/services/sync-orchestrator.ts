/**
 * SyncOrchestrator - Coordinates sync across all data sources
 *
 * Delegates to per-source sync adapters and tracks sync status/cursors.
 */

import { getDatabaseService } from './database';
import { createSlackSyncAdapter } from './sync-adapters/slack-sync';
import { createNotionSyncAdapter } from './sync-adapters/notion-sync';
import { createLinearSyncAdapter } from './sync-adapters/linear-sync';
import { createGmailSyncAdapter } from './sync-adapters/gmail-sync';
import type { SyncResult, SyncStatus, SyncProgressCallback } from '../types';
import { logger } from './utils/logger';

export class SyncOrchestrator {
  private dbService = getDatabaseService();
  private syncStatusCache: { data: SyncStatus; timestamp: number } | null = null;
  private static CACHE_TTL = 30_000; // 30 seconds

  isInitialized(): boolean {
    try {
      return this.dbService?.getDb() !== null;
    } catch {
      return false;
    }
  }

  canSync(): boolean {
    return this.isInitialized();
  }

  /** Invalidate cached sync status (call after sync completes) */
  invalidateSyncStatusCache(): void {
    this.syncStatusCache = null;
  }

  async getSyncStatus(): Promise<SyncStatus> {
    // Return cached result if fresh (avoids expensive DB query)
    if (this.syncStatusCache && Date.now() - this.syncStatusCache.timestamp < SyncOrchestrator.CACHE_TTL) {
      return this.syncStatusCache.data;
    }

    const db = this.dbService?.getDb();
    if (!db) {
      return { initialized: false };
    }

    try {
      // Split into two simpler queries instead of one JOIN
      const [cursorResult, countResult] = await Promise.all([
        db.query<{ source_type: string; last_synced_at: string | null }>(
          `SELECT source_type, last_synced_at FROM sync_cursors`
        ),
        db.query<{ source_type: string; count: string }>(
          `SELECT source_type, COUNT(*) as count FROM documents GROUP BY source_type`
        ),
      ]);

      const sources: Record<string, { lastSync?: number; documentCount?: number }> = {};

      for (const row of cursorResult.rows) {
        sources[row.source_type] = {
          lastSync: row.last_synced_at ? new Date(row.last_synced_at).getTime() : undefined,
        };
      }

      for (const row of countResult.rows) {
        if (!sources[row.source_type]) {
          sources[row.source_type] = {};
        }
        sources[row.source_type].documentCount = parseInt(row.count, 10);
      }

      const status = { initialized: true, sources } as SyncStatus;
      this.syncStatusCache = { data: status, timestamp: Date.now() };
      return status;
    } catch (error) {
      logger.error('[SyncOrchestrator] getSyncStatus error:', error);
      return { initialized: true };
    }
  }

  async syncSource(source: string, onProgress?: SyncProgressCallback): Promise<SyncResult> {
    logger.info(`[SyncOrchestrator] Starting sync for: ${source}`);

    if (!this.canSync()) {
      const reason = !this.isInitialized()
        ? 'Database not initialized'
        : 'OpenAI API key not set';
      logger.error(`[SyncOrchestrator] Cannot sync: ${reason}`);
      throw new Error(`Sync unavailable: ${reason}. Please check Settings.`);
    }

    try {
      const adapter = this.createAdapter(source);
      if (!adapter) {
        logger.warn(`[SyncOrchestrator] Unknown source: ${source}`);
        return { success: false, itemsSynced: 0, itemsFailed: 0, errors: [] };
      }

      const adapterResult = await adapter.syncIncremental(onProgress);
      this.invalidateSyncStatusCache();
      logger.info(`[SyncOrchestrator] ${source} sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
      return {
        success: adapterResult.success,
        itemsSynced: adapterResult.itemsSynced,
        itemsFailed: adapterResult.itemsFailed,
        errors: adapterResult.errors,
        lastCursor: adapterResult.lastCursor,
      };
    } catch (error) {
      logger.error(`[SyncOrchestrator] Sync failed for ${source}:`, error);
      throw error;
    }
  }

  async syncAll(): Promise<void> {
    logger.info('[SyncOrchestrator] Starting syncAll');

    if (!this.canSync()) {
      logger.warn('[SyncOrchestrator] syncAll skipped - not ready');
      return;
    }

    const sources = ['slack', 'notion', 'linear', 'gmail'];
    const results = await Promise.allSettled(
      sources.map(source => this.syncSource(source))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(`[SyncOrchestrator] ${sources[index]} sync failed:`, result.reason);
      }
    });

    logger.info('[SyncOrchestrator] syncAll complete');
  }

  private createAdapter(source: string) {
    switch (source) {
      case 'slack': return createSlackSyncAdapter();
      case 'notion': return createNotionSyncAdapter();
      case 'linear': return createLinearSyncAdapter();
      case 'gmail': return createGmailSyncAdapter();
      default: return null;
    }
  }
}
