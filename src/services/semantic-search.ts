import type { ContextItem, SearchResult, SemanticSearchResponse } from '../types/context-search';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export class SemanticSearchService {
  private maxRetries = 2;
  private baseDelay = 1000;

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async search(query: string, items: ContextItem[], limit = 5): Promise<SearchResult[]> {
    if (!query || items.length === 0) {
      return [];
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        return await this.callWorker(query, items, limit);
      } catch (error) {
        console.error(`Semantic search attempt ${attempt + 1} failed:`, error);

        if (attempt < this.maxRetries - 1) {
          continue;
        }

        return [];
      }
    }

    return [];
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
}

let searchService: SemanticSearchService | null = null;

export function getSemanticSearchService(): SemanticSearchService {
  if (!searchService) {
    searchService = new SemanticSearchService();
  }
  return searchService;
}
