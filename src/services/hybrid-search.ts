import type { ContextSource } from '../types/context-search';
import { LocalVectorStore, SearchResult, SearchOptions } from './local-vector-store';
import { EmbeddingClient, getEmbeddingClient } from './embedding-client';
import { logger } from './utils/logger';

export interface HybridSearchOptions extends SearchOptions {
  ftsWeight?: number;
  vectorWeight?: number;
}

export interface HybridSearchResult extends SearchResult {
  matchType: 'vector' | 'fts' | 'both';
}

export class HybridSearch {
  private embeddingClient: EmbeddingClient;

  constructor(private vectorStore: LocalVectorStore) {
    this.embeddingClient = getEmbeddingClient();
  }

  async search(query: string, options: HybridSearchOptions = {}): Promise<HybridSearchResult[]> {
    const { limit = 10, ftsWeight = 1.0, vectorWeight = 1.0 } = options;
    const startTime = Date.now();

    if (!query || !query.trim()) {
      return [];
    }

     let queryEmbedding: Float32Array;
     try {
       queryEmbedding = await this.embeddingClient.embedSingle(query);
     } catch (error) {
       logger.warn('[HybridSearch] Embedding failed, falling back to FTS only:', error);
       return this.ftsOnlySearch(query, options);
     }

     if (queryEmbedding.length === 0) {
       logger.warn('[HybridSearch] Empty embedding returned, falling back to FTS only');
       return this.ftsOnlySearch(query, options);
     }

    const searchLimit = Math.max(limit * 2, 20);
    const [vectorResults, ftsResults] = await Promise.all([
      this.vectorStore.vectorSearch(queryEmbedding, { ...options, limit: searchLimit }),
      this.ftsSearchSafe(query, { ...options, limit: searchLimit })
    ]);

    const combined = this.reciprocalRankFusion(
      vectorResults,
      ftsResults,
      limit,
      vectorWeight,
      ftsWeight
    );

     const duration = Date.now() - startTime;
     logger.log(`[HybridSearch] Query: "${query.substring(0, 50)}...", Vector: ${vectorResults.length}, FTS: ${ftsResults.length}, Combined: ${combined.length}, Duration: ${duration}ms`);

     return combined;
  }

  private async ftsOnlySearch(query: string, options: HybridSearchOptions): Promise<HybridSearchResult[]> {
    const { limit = 10 } = options;
    const startTime = Date.now();

     const results = await this.ftsSearchSafe(query, { ...options, limit });
     
     const duration = Date.now() - startTime;
     logger.log(`[HybridSearch] FTS-only Query: "${query.substring(0, 50)}...", Results: ${results.length}, Duration: ${duration}ms`);

     return results.map(r => ({
      ...r,
      matchType: 'fts' as const
    }));
  }

   private async ftsSearchSafe(query: string, options: SearchOptions): Promise<SearchResult[]> {
     try {
       const escapedQuery = this.escapeFtsQuery(query);
       return await this.vectorStore.ftsSearch(escapedQuery, options);
     } catch (error) {
       logger.warn('[HybridSearch] FTS search failed:', error);
       return [];
     }
   }

  private escapeFtsQuery(query: string): string {
    return query
      .replace(/"/g, '')
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term}"`)
      .join(' ');
  }

  /**
   * RRF score = Σ weight / (k + rank), k=60 prevents high scores from dominating
   */
  private reciprocalRankFusion(
    vectorResults: SearchResult[],
    ftsResults: SearchResult[],
    limit: number,
    vectorWeight: number = 1.0,
    ftsWeight: number = 1.0,
    k: number = 60
  ): HybridSearchResult[] {
    const scores = new Map<string, { score: number; item: SearchResult; sources: Set<'vector' | 'fts'> }>();

    vectorResults.forEach((item, rank) => {
      const rrfScore = vectorWeight / (k + rank + 1);
      const existing = scores.get(item.id);
      
      if (existing) {
        existing.score += rrfScore;
        existing.sources.add('vector');
      } else {
        scores.set(item.id, {
          score: rrfScore,
          item,
          sources: new Set(['vector'])
        });
      }
    });

    ftsResults.forEach((item, rank) => {
      const rrfScore = ftsWeight / (k + rank + 1);
      const existing = scores.get(item.id);
      
      if (existing) {
        existing.score += rrfScore;
        existing.sources.add('fts');
      } else {
        scores.set(item.id, {
          score: rrfScore,
          item,
          sources: new Set(['fts'])
        });
      }
    });

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item, score, sources }) => ({
        ...item,
        score,
        matchType: (sources.has('vector') && sources.has('fts') 
          ? 'both' 
          : sources.has('vector') ? 'vector' : 'fts') as 'vector' | 'fts' | 'both'
      }));
  }

  async vectorOnlySearch(query: string, options: SearchOptions = {}): Promise<HybridSearchResult[]> {
    const queryEmbedding = await this.embeddingClient.embedSingle(query);
    
    if (queryEmbedding.length === 0) {
      return [];
    }

    const results = await this.vectorStore.vectorSearch(queryEmbedding, options);
    return results.map(r => ({
      ...r,
      matchType: 'vector' as const
    }));
  }
}

let hybridSearch: HybridSearch | null = null;

export function getHybridSearch(vectorStore: LocalVectorStore): HybridSearch {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch(vectorStore);
  }
  return hybridSearch;
}
