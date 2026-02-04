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
import { getSelectedSlackChannels } from './settings-store';

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

export interface SyncStatus {
  initialized: boolean;
  slack?: { lastSync?: number; documentCount?: number };
  notion?: { lastSync?: number; documentCount?: number };
  linear?: { lastSync?: number; documentCount?: number };
}

export class LocalSearchService {
  private dbService = getDatabaseService();
  private embeddingService = createEmbeddingService();
  private preprocessor = new TextPreprocessor();

  isInitialized(): boolean {
    try {
      return this.dbService?.getDb() !== null;
    } catch {
      return false;
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const db = this.dbService?.getDb();
    if (!db) {
      return { initialized: false };
    }

    try {
      const result = await db.query<{ source_type: string; count: string }>(`
        SELECT source_type, COUNT(*) as count
        FROM documents
        GROUP BY source_type
      `);

      const status: SyncStatus = { initialized: true };

      for (const row of result.rows) {
        const sourceKey = row.source_type as 'slack' | 'notion' | 'linear';
        status[sourceKey] = { documentCount: parseInt(row.count, 10) };
      }

      return status;
    } catch (error) {
      console.error('[LocalSearch] getSyncStatus error:', error);
      return { initialized: true };
    }
  }

  async syncSource(source: string): Promise<void> {
    console.log(`[LocalSearch] syncSource called for: ${source}`);
  }

  async syncAll(): Promise<void> {
    console.log('[LocalSearch] syncAll called');
    await Promise.all([
      this.syncSource('slack'),
      this.syncSource('notion'),
      this.syncSource('linear'),
    ]);
  }

  /**
   * Hybrid search: Semantic + Keyword with RRF fusion
   *
   * @param query - Search query text
   * @param items - Ignored (we search local DB instead)
   * @param limit - Final result limit (default: 5)
   * @param source - Optional source filter ('slack' | 'notion' | 'linear')
   * @returns SearchResult[] sorted by RRF score
   */
  async search(query: string, items: ContextItem[], limit = 5, source?: string): Promise<SearchResult[]> {
    if (!query) {
      return [];
    }

    try {
      // 1. Generate query embedding
      const preprocessedQuery = this.preprocessor.preprocess(query);
      const queryEmbedding = await this.embeddingService.embed(preprocessedQuery);

      // 2. Parallel search: Semantic + Keyword (with optional source filter)
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(queryEmbedding, RETRIEVAL_LIMIT, source),
        this.keywordSearch(query, RETRIEVAL_LIMIT, source),
      ]);

      console.log(
        `[LocalSearch] Semantic: ${semanticResults.length}, Keyword: ${keywordResults.length}${source ? `, source: ${source}` : ''}`
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

  private async semanticSearch(
    queryEmbedding: number[],
    limit: number,
    source?: string
  ): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const conditions = ['embedding IS NOT NULL'];
    const params: any[] = [JSON.stringify(queryEmbedding), limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    // Filter by selected Slack channels (no selection = exclude Slack)
    const selectedChannels = getSelectedSlackChannels();
    if (selectedChannels.length > 0) {
      const channelIds = selectedChannels.map(ch => ch.id);
      params.push(JSON.stringify(channelIds));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      conditions.push(`source_type != 'slack'`);
    }

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
    const db = this.dbService.getDb();

    const conditions = ['tsv @@ query'];
    const params: any[] = [query, limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    const selectedChannels = getSelectedSlackChannels();
    if (selectedChannels.length > 0) {
      const channelIds = selectedChannels.map(ch => ch.id);
      params.push(JSON.stringify(channelIds));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      conditions.push(`source_type != 'slack'`);
    }

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

  private mergeWithRRF(
    semantic: SearchResult[],
    keyword: SearchResult[],
    k = RRF_K
  ): SearchResult[] {
    const rrfScores = new Map<string, number>();
    const semanticScores = new Map<string, number>();
    const resultMap = new Map<string, SearchResult>();

    // Store semantic results with original cosine similarity score
    semantic.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + rrfScore);
      semanticScores.set(result.id, result.score); // Keep original similarity
      resultMap.set(result.id, result);
    });

    // Add keyword results (boost RRF but use lower similarity for keyword-only matches)
    keyword.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + rrfScore);
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, result);
        semanticScores.set(result.id, 0.3); // Keyword-only matches get lower score
      }
    });

    // Sort by RRF score, but return semantic similarity as final score
    const merged = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => {
        const result = resultMap.get(id)!;
        const displayScore = semanticScores.get(id) || 0;
        return { ...result, score: displayScore };
      });

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

export function getLocalSearchService(): LocalSearchService | null {
  if (!localSearchService) {
    try {
      localSearchService = new LocalSearchService();
    } catch (error) {
      console.error('[LocalSearch] Failed to initialize:', error);
      return null;
    }
  }
  return localSearchService;
}
