/**
 * LocalSearchService - Facade composing SyncOrchestrator + SearchService
 *
 * Preserves the original public API so all existing imports continue to work.
 * Delegates sync operations to SyncOrchestrator and search to SearchService.
 */

import type { ContextItem, SearchResult } from '../types/context-search';
import { SyncOrchestrator } from './sync-orchestrator';
import { SearchService } from './search-service';
import type { SyncResult, SyncStatus, SyncProgressCallback } from '../types';
import { logger } from './utils/logger';

// Re-export types so existing `import { ... } from '../local-search'` still works
export type { SyncResult, SyncProgress, SyncProgressCallback, SyncStatus } from '../types';

export class LocalSearchService {
  private syncOrchestrator = new SyncOrchestrator();
  private searchService = new SearchService();

  constructor() {
    logger.info('[LocalSearch] EmbeddingClient initialized (Worker-based)');
  }

  canSync(): boolean {
    return this.syncOrchestrator.canSync();
  }

  isInitialized(): boolean {
    return this.syncOrchestrator.isInitialized();
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.syncOrchestrator.getSyncStatus();
  }

  invalidateSyncStatusCache(): void {
    this.syncOrchestrator.invalidateSyncStatusCache();
  }

  async syncSource(source: string, onProgress?: SyncProgressCallback): Promise<SyncResult> {
    return this.syncOrchestrator.syncSource(source, onProgress);
  }

  async syncAll(): Promise<void> {
    return this.syncOrchestrator.syncAll();
  }

  async search(query: string, items: ContextItem[], limit = 5, source?: string): Promise<SearchResult[]> {
    return this.searchService.search(query, items, limit, source);
  }
}

// Singleton instance
let localSearchService: LocalSearchService | null = null;

export function getLocalSearchService(): LocalSearchService | null {
  if (!localSearchService) {
    try {
      localSearchService = new LocalSearchService();
    } catch (error) {
      logger.error('[LocalSearch] Failed to initialize:', error);
      return null;
    }
  }
  return localSearchService;
}
