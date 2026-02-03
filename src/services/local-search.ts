/**
 * LocalSearchService - Hybrid search combining semantic + keyword search
 *
 * Uses:
 * - Semantic search: pgvector cosine similarity on embeddings
 * - Keyword search: PostgreSQL Full-Text Search (FTS)
 * - RRF (Reciprocal Rank Fusion): Combines results from both channels
 *
 * Replaces Worker-based search with local database search.
 */

import type { ContextItem, SearchResult } from '../types/context-search';
import { getDatabaseService } from './database';
import { createEmbeddingService } from './embedding-service';
import { TextPreprocessor } from './text-preprocessor';

const RRF_K = 60; // Standard RRF constant
const RETRIEVAL_LIMIT = 100; // Retrieve top 100 from each channel before RRF

interface DatabaseRow {
  id: string;
  source_type: 'notion' | 'slack' | 'linear';
  source_id: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
  source_created_at?: Date;
  score: number;
}

export class LocalSearchService {
  private dbService = getDatabaseService();
  private embeddingService = createEmbeddingService();
  private preprocessor = new TextPreprocessor();

  /**
   * Hybrid search: Semantic + Keyword with RRF fusion
   *
   * @param query - Search query text
   * @param items - Ignored (we search local DB instead)
   * @param limit - Final result limit (default: 5)
   * @returns SearchResult[] sorted by RRF score
   */
  async search(query: string, items: ContextItem[], limit = 5): Promise<SearchResult[]> {
    if (!query) {
      return [];
    }

    try {
      // 1. Generate query embedding
      const preprocessedQuery = this.preprocessor.preprocess(query);
      const queryEmbedding = await this.embeddingService.embed(preprocessedQuery);

      // 2. Parallel search: Semantic + Keyword
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(queryEmbedding, RETRIEVAL_LIMIT),
        this.keywordSearch(query, RETRIEVAL_LIMIT),
      ]);

      console.log(
        `[LocalSearch] Semantic: ${semanticResults.length}, Keyword: ${keywordResults.length}`
      );

      // 3. Merge with RRF
      const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

      // 4. Return top N results
      return merged.slice(0, limit);
    } catch (error) {
      console.error('[LocalSearch] Search failed:', error);
      return [];
    }
  }

  /**
   * Semantic search using pgvector cosine similarity
   *
   * SQL: SELECT ... WHERE embedding IS NOT NULL ORDER BY embedding <=> $1
   */
  private async semanticSearch(
    queryEmbedding: number[],
    limit: number
  ): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const result = await db.query<DatabaseRow>(
      `
      SELECT 
        id, source_type, source_id, title, content, metadata, source_created_at,
        1 - (embedding <=> $1) AS score
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT $2
      `,
      [JSON.stringify(queryEmbedding), limit]
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  /**
   * Keyword search using PostgreSQL Full-Text Search
   *
   * SQL: SELECT ... WHERE tsv @@ query ORDER BY ts_rank_cd(tsv, query) DESC
   */
  private async keywordSearch(query: string, limit: number): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const result = await db.query<DatabaseRow>(
      `
      SELECT 
        id, source_type, source_id, title, content, metadata, source_created_at,
        ts_rank_cd(tsv, query, 32) AS score
      FROM documents, websearch_to_tsquery('simple', $1) query
      WHERE tsv @@ query
      ORDER BY score DESC
      LIMIT $2
      `,
      [query, limit]
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  /**
   * Reciprocal Rank Fusion (RRF) algorithm
   *
   * Formula: score = Σ(1 / (k + rank))
   * - k = 60 (standard constant)
   * - rank = 1-based position in result list
   *
   * Combines semantic and keyword results by rank, not raw score.
   */
  private mergeWithRRF(
    semantic: SearchResult[],
    keyword: SearchResult[],
    k = RRF_K
  ): SearchResult[] {
    const scores = new Map<string, number>();
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results (rank 1, 2, 3, ...)
    semantic.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      scores.set(result.id, (scores.get(result.id) || 0) + rrfScore);
      resultMap.set(result.id, result);
    });

    // Add keyword results (rank 1, 2, 3, ...)
    keyword.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      scores.set(result.id, (scores.get(result.id) || 0) + rrfScore);
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, result);
      }
    });

    // Sort by RRF score descending
    const merged = Array.from(scores.entries())
      .map(([id, score]) => {
        const result = resultMap.get(id)!;
        return { ...result, score };
      })
      .sort((a, b) => b.score - a.score);

    return merged;
  }

  /**
   * Convert database row to SearchResult
   */
  private rowToSearchResult(row: DatabaseRow): SearchResult {
    return {
      id: row.source_id,
      content: row.content,
      title: row.title,
      url: row.metadata?.url,
      source: row.source_type,
      timestamp: row.source_created_at?.getTime(),
      metadata: row.metadata,
      score: row.score,
    };
  }
}

// Singleton instance
let localSearchService: LocalSearchService | null = null;

/**
 * Get singleton LocalSearchService instance
 */
export function getLocalSearchService(): LocalSearchService {
  if (!localSearchService) {
    localSearchService = new LocalSearchService();
  }
  return localSearchService;
}
