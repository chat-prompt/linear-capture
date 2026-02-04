import type { ContextItem, SearchResult, SemanticSearchResponse } from '../types/context-search';
import { LocalVectorStore } from './local-vector-store';
import { HybridSearch, HybridSearchResult } from './hybrid-search';
import { SlackSync, SlackSyncResult } from './slack-sync';
import { slackUserCache } from './slack-user-cache';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export class SemanticSearchService {
  private maxRetries = 2;
  private baseDelay = 1000;
  private localVectorStore: LocalVectorStore | null = null;
  private hybridSearch: HybridSearch | null = null;
  private slackSync: SlackSync | null = null;
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize local vector search infrastructure.
   * Call on app startup (background, non-blocking).
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    try {
      console.log('[SemanticSearch] Initializing local vector store...');

      this.localVectorStore = new LocalVectorStore();
      const success = await this.localVectorStore.initialize();

      if (!success) {
        console.error('[SemanticSearch] Failed to initialize vector store');
        return false;
      }

      this.hybridSearch = new HybridSearch(this.localVectorStore);
      this.slackSync = new SlackSync(this.localVectorStore);
      this.initialized = true;

      const stats = await this.localVectorStore.getStats();
      console.log(`[SemanticSearch] Initialized: ${stats.totalDocuments} docs, ${stats.totalEmbeddings} embeddings`);

      return true;
    } catch (error) {
      console.error('[SemanticSearch] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Sync Slack messages to local vector store.
   * Call on app startup and after Slack OAuth complete.
   */
  async syncSlack(): Promise<SlackSyncResult> {
    if (!this.slackSync) {
      console.warn('[SemanticSearch] Not initialized, skipping Slack sync');
      return { synced: 0, channels: 0, workspaceId: '', errors: ['Not initialized'] };
    }

    console.log('[SemanticSearch] Starting Slack sync...');
    const result = await this.slackSync.sync();
    console.log(`[SemanticSearch] Slack sync complete: ${result.synced} messages from ${result.channels} channels`);

    if (result.errors.length > 0) {
      console.warn('[SemanticSearch] Sync errors:', result.errors);
    }

    return result;
  }

  async getStats(): Promise<{ totalDocuments: number; totalEmbeddings: number } | null> {
    if (!this.localVectorStore) return null;
    return this.localVectorStore.getStats();
  }

  /**
   * Search using local hybrid (FTS + vector) first, Worker fallback if empty.
   * @param items Context items for Worker fallback (ignored in local search)
   */
  async search(query: string, items: ContextItem[], limit = 5): Promise<SearchResult[]> {
    if (!query) return [];

    if (this.hybridSearch) {
      try {
        const localResults = await this.hybridSearch.search(query, { limit });

        if (localResults.length > 0) {
          console.log(`[SemanticSearch] Local search returned ${localResults.length} results`);
          return this.convertHybridResults(localResults);
        }

        console.log('[SemanticSearch] Local search returned no results');
      } catch (error) {
        console.error('[SemanticSearch] Local search failed:', error);
      }
    }

    if (items.length > 0) {
      console.log('[SemanticSearch] Falling back to Worker search');
      return this.callWorker(query, items, limit);
    }

    return [];
  }

  private convertHybridResults(results: HybridSearchResult[]): SearchResult[] {
    let resolvedCount = 0;
    console.log('[SemanticSearch] convertHybridResults - slackUserCache.isLoaded():', slackUserCache.isLoaded());

    const converted = results.map(r => {
      let content = r.content;
      let title = r.title || '';

      if (r.source === 'slack') {
        console.log('[SemanticSearch] Slack result - original title:', title, 'original content:', content.substring(0, 50));
        
        if (slackUserCache.isLoaded()) {
          const originalContent = content;
          const originalTitle = title;
          content = slackUserCache.resolve(content);
          title = slackUserCache.resolve(title);
          if (content !== originalContent || title !== originalTitle) {
            resolvedCount++;
          }
        }
      }

      return {
        id: r.id,
        source: r.source,
        title,
        content,
        url: r.url,
        score: r.score
      };
    });

    if (resolvedCount > 0) {
      console.log(`[SemanticSearch] Resolved user mentions in ${resolvedCount} results`);
    }

    return converted;
  }

  private async callWorker(query: string, items: ContextItem[], limit: number): Promise<SearchResult[]> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        const response = await fetch(`${WORKER_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, items, limit }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Worker error: ${response.status} - ${errorText}`);
        }

        const result = await response.json() as SemanticSearchResponse;

        if (!result.success) {
          throw new Error(result.error || 'Search failed');
        }

        return result.results || [];
      } catch (error) {
        console.error(`[SemanticSearch] Worker attempt ${attempt + 1} failed:`, error);

        if (attempt < this.maxRetries - 1) {
          continue;
        }

        return [];
      }
    }

    return [];
  }

  close(): void {
    if (this.localVectorStore) {
      this.localVectorStore.close();
      this.localVectorStore = null;
    }
    this.hybridSearch = null;
    this.slackSync = null;
    this.initialized = false;
    this.initPromise = null;
    console.log('[SemanticSearch] Resources cleaned up');
  }
}

let searchService: SemanticSearchService | null = null;

export function getSemanticSearchService(): SemanticSearchService {
  if (!searchService) {
    searchService = new SemanticSearchService();
  }
  return searchService;
}
