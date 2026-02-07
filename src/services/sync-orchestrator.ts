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

export class SyncOrchestrator {
  private dbService = getDatabaseService();

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

  async getSyncStatus(): Promise<SyncStatus> {
    const db = this.dbService?.getDb();
    if (!db) {
      return { initialized: false };
    }

    try {
      const result = await db.query<{ source_type: string; count: string; last_synced_at: string | null }>(`
        SELECT d.source_type, COUNT(*) as count, sc.last_synced_at
        FROM documents d
        LEFT JOIN sync_cursors sc ON d.source_type = sc.source_type
        GROUP BY d.source_type, sc.last_synced_at
      `);

      const sources: Record<string, { lastSync?: number; documentCount?: number }> = {};

      for (const row of result.rows) {
        const sourceKey = row.source_type as 'slack' | 'notion' | 'linear' | 'gmail';
        sources[sourceKey] = {
          documentCount: parseInt(row.count, 10),
          lastSync: row.last_synced_at ? new Date(row.last_synced_at).getTime() : undefined,
        };
      }

      return {
        initialized: true,
        sources,
      } as SyncStatus;
    } catch (error) {
      console.error('[SyncOrchestrator] getSyncStatus error:', error);
      return { initialized: true };
    }
  }

  async syncSource(source: string, onProgress?: SyncProgressCallback): Promise<SyncResult> {
    console.log(`[SyncOrchestrator] Starting sync for: ${source}`);

    if (!this.canSync()) {
      const reason = !this.isInitialized()
        ? 'Database not initialized'
        : 'OpenAI API key not set';
      console.error(`[SyncOrchestrator] Cannot sync: ${reason}`);
      throw new Error(`Sync unavailable: ${reason}. Please check Settings.`);
    }

    try {
      const adapter = this.createAdapter(source);
      if (!adapter) {
        console.warn(`[SyncOrchestrator] Unknown source: ${source}`);
        return { success: false, itemsSynced: 0, itemsFailed: 0, errors: [] };
      }

      const adapterResult = await adapter.syncIncremental(onProgress);
      console.log(`[SyncOrchestrator] ${source} sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
      return {
        success: adapterResult.success,
        itemsSynced: adapterResult.itemsSynced,
        itemsFailed: adapterResult.itemsFailed,
        errors: adapterResult.errors,
        lastCursor: adapterResult.lastCursor,
      };
    } catch (error) {
      console.error(`[SyncOrchestrator] Sync failed for ${source}:`, error);
      throw error;
    }
  }

  async syncAll(): Promise<void> {
    console.log('[SyncOrchestrator] Starting syncAll');

    if (!this.canSync()) {
      console.warn('[SyncOrchestrator] syncAll skipped - not ready');
      return;
    }

    const sources = ['slack', 'notion', 'linear', 'gmail'];
    const results = await Promise.allSettled(
      sources.map(source => this.syncSource(source))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[SyncOrchestrator] ${sources[index]} sync failed:`, result.reason);
      }
    });

    console.log('[SyncOrchestrator] syncAll complete');
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
