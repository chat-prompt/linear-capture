import type { ContextItem, SearchResult } from '../types/context-search';
import { getLocalSearchService } from './local-search';

// OLD: Worker-based search (kept for reference)
// const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

/**
 * SemanticSearchService - Now delegates to LocalSearchService
 *
 * Maintains backward compatibility with existing code while using local DB search.
 * The Worker-based search has been replaced with hybrid local search (semantic + keyword).
 */
export class SemanticSearchService {
  /**
   * Search using local hybrid search (semantic + keyword with RRF)
   *
   * @param query - Search query text
   * @param items - Ignored (local search queries DB directly)
   * @param limit - Maximum results to return (default: 5)
   * @returns SearchResult[] sorted by relevance
   */
  async search(query: string, items: ContextItem[], limit = 5): Promise<SearchResult[]> {
    if (!query) {
      return [];
    }

    try {
      // Delegate to local search service
      const localSearch = getLocalSearchService();
      return await localSearch.search(query, items, limit);
    } catch (error) {
      console.error('[SemanticSearch] Local search failed:', error);
      return [];
    }
  }

  // OLD: Worker-based implementation (removed)
  /*
  private maxRetries = 2;
  private baseDelay = 1000;

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async callWorker(query: string, items: ContextItem[], limit: number): Promise<SearchResult[]> {
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
  }
  */
}

let searchService: SemanticSearchService | null = null;

export function getSemanticSearchService(): SemanticSearchService {
  if (!searchService) {
    searchService = new SemanticSearchService();
  }
  return searchService;
}
