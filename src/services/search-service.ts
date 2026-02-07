/**
 * SearchService - Hybrid search combining semantic + keyword search
 *
 * Uses:
 * - Semantic search: pgvector cosine similarity on embeddings
 * - Keyword search: PostgreSQL Full-Text Search (FTS) with LIKE fallback
 * - RRF (Reciprocal Rank Fusion): Combines results from both channels
 * - Reranking and recency boost for final scoring
 */

import type { ContextItem, SearchResult } from '../types/context-search';
import { getDatabaseService } from './database';
import { getEmbeddingClient, EmbeddingClient } from './embedding-client';
import { TextPreprocessor } from './text-preprocessor';
import { getSelectedSlackChannels } from './settings-store';
import { rerank } from './reranker';
import { applyRecencyBoost } from './recency-boost';

const RRF_K = 60;
const RETRIEVAL_LIMIT = 100;

interface DatabaseRow {
  id: string;
  source_type: 'notion' | 'slack' | 'linear' | 'gmail';
  source_id: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
  source_created_at?: Date;
  score: number;
}

export class SearchService {
  private dbService = getDatabaseService();
  private embeddingClient: EmbeddingClient;
  private preprocessor = new TextPreprocessor();

  constructor() {
    this.embeddingClient = getEmbeddingClient();
  }

  isInitialized(): boolean {
    try {
      return this.dbService?.getDb() !== null;
    } catch {
      return false;
    }
  }

  /**
   * Hybrid search: Semantic + Keyword with RRF fusion
   */
  async search(query: string, _items: ContextItem[], limit = 5, source?: string): Promise<SearchResult[]> {
    if (!query) {
      return [];
    }

    if (!this.isInitialized()) {
      console.warn('[SearchService] Search skipped - DB not initialized');
      return [];
    }

    try {
      const preprocessedQuery = this.preprocessor.preprocess(query);
      const queryEmbedding = await this.embeddingClient.embedSingle(preprocessedQuery);

      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(queryEmbedding, RETRIEVAL_LIMIT, source),
        this.keywordSearch(query, RETRIEVAL_LIMIT, source),
      ]);

      console.log(
        `[SearchService] Semantic: ${semanticResults.length}, Keyword: ${keywordResults.length}${source ? `, source: ${source}` : ''}`
      );

      const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

      const reranked = await this.applyRerank(query, merged.slice(0, 30));
      const boosted = applyRecencyBoost(reranked);
      const sorted = [...boosted].sort((a, b) => b.score - a.score);

      return sorted.slice(0, limit);
    } catch (error) {
      console.error('[SearchService] Search failed:', error);
      return [];
    }
  }

  /**
   * Apply Slack channel filter to query conditions/params.
   * Opt-out model: no config = include all, some selected = include only those, all deselected = exclude all.
   */
  private applySlackChannelFilter(conditions: string[], params: any[]): void {
    const allChannels = getSelectedSlackChannels();
    const selectedIds = allChannels.filter(ch => ch.selected).map(ch => ch.id);

    if (allChannels.length === 0) {
      // No config = include all Slack (opt-out model)
    } else if (selectedIds.length > 0) {
      params.push(JSON.stringify(selectedIds));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      conditions.push(`source_type != 'slack'`);
    }
  }

  private async semanticSearch(
    queryEmbedding: Float32Array,
    limit: number,
    source?: string
  ): Promise<SearchResult[]> {
    if (!this.isInitialized()) {
      console.warn('[SearchService] semanticSearch skipped - DB not initialized');
      return [];
    }

    const db = this.dbService.getDb();

    const conditions = ['embedding IS NOT NULL'];
    const params: any[] = [JSON.stringify(Array.from(queryEmbedding)), limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    this.applySlackChannelFilter(conditions, params);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await db.query<DatabaseRow>(
      `
      SELECT
        id, source_type, source_id, title, content, metadata, source_created_at,
        1 - (embedding <=> $1) AS score
      FROM documents
      ${whereClause}
      ORDER BY embedding <=> $1
      LIMIT $2
      `,
      params
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  private async keywordSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    if (!this.isInitialized()) {
      console.warn('[SearchService] keywordSearch skipped - DB not initialized');
      return [];
    }

    // PostgreSQL websearch_to_tsquery ignores short tokens (<=3 chars) like "cto", "kr"
    if (query.length <= 3) {
      console.log(`[SearchService] Short query "${query}" - using LIKE search`);
      return this.likeSearch(query, limit, source);
    }

    const ftsResults = await this.ftsSearch(query, limit, source);

    if (ftsResults.length === 0) {
      console.log(`[SearchService] FTS returned 0 results for "${query}", falling back to LIKE`);
      return this.likeSearch(query, limit, source);
    }

    return ftsResults;
  }

  private async ftsSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const conditions = ['tsv @@ query'];
    const params: any[] = [query, limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    this.applySlackChannelFilter(conditions, params);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await db.query<DatabaseRow>(
      `
      SELECT
        id, source_type, source_id, title, content, metadata, source_created_at,
        ts_rank_cd(tsv, query, 32) AS score
      FROM documents, websearch_to_tsquery('simple', $1) query
      ${whereClause}
      ORDER BY score DESC
      LIMIT $2
      `,
      params
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  private async likeSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const conditions = [`(
      content ILIKE $1
      OR title ILIKE $1
      OR metadata->>'assigneeName' ILIKE $1
      OR metadata->>'projectName' ILIKE $1
      OR metadata->>'teamName' ILIKE $1
      OR metadata->>'labels' ILIKE $1
      OR metadata->>'userName' ILIKE $1
      OR metadata->>'fromName' ILIKE $1
    )`];
    const params: any[] = [`%${query}%`, limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    this.applySlackChannelFilter(conditions, params);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await db.query<DatabaseRow>(
      `
      SELECT
        id, source_type, source_id, title, content, metadata, source_created_at,
        0.5 AS score
      FROM documents
      ${whereClause}
      ORDER BY source_created_at DESC
      LIMIT $2
      `,
      params
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  private async applyRerank(
    query: string,
    results: SearchResult[]
  ): Promise<SearchResult[]> {
    try {
      const documents = results.map((r) => ({
        id: `${r.source}:${r.id}`,
        text: `${r.title || ''} ${r.content}`.slice(0, 1000),
      }));

      const reranked = await rerank(query, documents, documents.length);

      const scoreMap = new Map(
        reranked.map((r) => [r.id, r.relevanceScore])
      );

      return results.map((result) => ({
        ...result,
        score: scoreMap.get(`${result.source}:${result.id}`) ?? result.score,
      }));
    } catch (error) {
      console.error('[SearchService] Rerank failed, using original scores:', error);
      return results;
    }
  }

  private mergeWithRRF(
    semantic: SearchResult[],
    keyword: SearchResult[],
    k = RRF_K
  ): SearchResult[] {
    const rrfScores = new Map<string, number>();
    const semanticScores = new Map<string, number>();
    const resultMap = new Map<string, SearchResult>();

    semantic.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + rrfScore);
      semanticScores.set(result.id, result.score);
      resultMap.set(result.id, result);
    });

    keyword.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + rrfScore);
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, result);
        semanticScores.set(result.id, 0.3);
      }
    });

    const merged = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => {
        const result = resultMap.get(id)!;
        const displayScore = semanticScores.get(id) || 0;
        return { ...result, score: displayScore };
      });

    return merged;
  }

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
