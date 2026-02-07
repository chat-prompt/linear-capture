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
import { getEmbeddingClient, EmbeddingClient } from './embedding-client';
import { TextPreprocessor } from './text-preprocessor';
import { getSelectedSlackChannels } from './settings-store';
import { createSlackSyncAdapter } from './sync-adapters/slack-sync';
import { createNotionSyncAdapter } from './sync-adapters/notion-sync';
import { createLinearSyncAdapter } from './sync-adapters/linear-sync';
import { createGmailSyncAdapter } from './sync-adapters/gmail-sync';
import { rerank } from './reranker';
import { applyRecencyBoost } from './recency-boost';

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ id: string; error: string }>;
  lastCursor?: string;
}

export interface SyncProgress {
  source: 'notion' | 'slack' | 'linear' | 'gmail';
  phase: 'discovering' | 'syncing' | 'embedding' | 'complete';
  current: number;
  total: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

const RRF_K = 60; // Standard RRF constant
const RETRIEVAL_LIMIT = 100; // Retrieve top 100 from each channel before RRF

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

export interface SyncStatus {
  initialized: boolean;
  sources?: {
    slack?: { lastSync?: number; documentCount?: number };
    notion?: { lastSync?: number; documentCount?: number };
    linear?: { lastSync?: number; documentCount?: number };
    gmail?: { lastSync?: number; documentCount?: number };
  };
}

export class LocalSearchService {
  private dbService = getDatabaseService();
  private embeddingClient: EmbeddingClient;
  private preprocessor = new TextPreprocessor();

  constructor() {
    this.embeddingClient = getEmbeddingClient();
    console.log('[LocalSearch] EmbeddingClient initialized (Worker-based)');
  }

  reinitializeEmbedding(): void {
  }

  canSync(): boolean {
    return this.isInitialized();
  }

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
      // JOIN sync_cursors to get last_synced_at for each source
      const result = await db.query<{ source_type: string; count: string; last_synced_at: string | null }>(`
        SELECT d.source_type, COUNT(*) as count, sc.last_synced_at
        FROM documents d
        LEFT JOIN sync_cursors sc ON d.source_type = sc.source_type
        GROUP BY d.source_type, sc.last_synced_at
      `);

      // Build sources object that UI expects: syncStatus.sources.slack.lastSync
      const sources: Record<string, { lastSync?: number; documentCount?: number }> = {};

      for (const row of result.rows) {
        const sourceKey = row.source_type as 'slack' | 'notion' | 'linear' | 'gmail';
        sources[sourceKey] = {
          documentCount: parseInt(row.count, 10),
          lastSync: row.last_synced_at ? new Date(row.last_synced_at).getTime() : undefined,
        };
      }

      // Return with sources wrapper to match UI contract: syncStatus?.sources?.slack?.lastSync
      return {
        initialized: true,
        sources,
      } as SyncStatus;
    } catch (error) {
      console.error('[LocalSearch] getSyncStatus error:', error);
      return { initialized: true };
    }
  }

  async syncSource(source: string, onProgress?: SyncProgressCallback): Promise<SyncResult> {
    console.log(`[LocalSearch] Starting sync for: ${source}`);

    if (!this.canSync()) {
      const reason = !this.isInitialized()
        ? 'Database not initialized'
        : 'OpenAI API key not set';
      console.error(`[LocalSearch] Cannot sync: ${reason}`);
      throw new Error(`Sync unavailable: ${reason}. Please check Settings.`);
    }

    try {
      switch (source) {
        case 'slack': {
          const adapter = createSlackSyncAdapter();
          const adapterResult = await adapter.syncIncremental(onProgress);
          console.log(`[LocalSearch] Slack sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
          return {
            success: adapterResult.success,
            itemsSynced: adapterResult.itemsSynced,
            itemsFailed: adapterResult.itemsFailed,
            errors: adapterResult.errors,
            lastCursor: adapterResult.lastCursor,
          };
        }
        case 'notion': {
          const adapter = createNotionSyncAdapter();
          const adapterResult = await adapter.syncIncremental(onProgress);
          console.log(`[LocalSearch] Notion sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
          return {
            success: adapterResult.success,
            itemsSynced: adapterResult.itemsSynced,
            itemsFailed: adapterResult.itemsFailed,
            errors: adapterResult.errors,
            lastCursor: adapterResult.lastCursor,
          };
        }
        case 'linear': {
          const adapter = createLinearSyncAdapter();
          const adapterResult = await adapter.syncIncremental(onProgress);
          console.log(`[LocalSearch] Linear sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
          return {
            success: adapterResult.success,
            itemsSynced: adapterResult.itemsSynced,
            itemsFailed: adapterResult.itemsFailed,
            errors: adapterResult.errors,
            lastCursor: adapterResult.lastCursor,
          };
        }
        case 'gmail': {
          const adapter = createGmailSyncAdapter();
          const adapterResult = await adapter.syncIncremental(onProgress);
          console.log(`[LocalSearch] Gmail sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
          return {
            success: adapterResult.success,
            itemsSynced: adapterResult.itemsSynced,
            itemsFailed: adapterResult.itemsFailed,
            errors: adapterResult.errors,
            lastCursor: adapterResult.lastCursor,
          };
        }
        default:
          console.warn(`[LocalSearch] Unknown source: ${source}`);
          return { success: false, itemsSynced: 0, itemsFailed: 0, errors: [] };
      }
    } catch (error) {
      console.error(`[LocalSearch] Sync failed for ${source}:`, error);
      throw error;
    }
  }

  async syncAll(): Promise<void> {
    console.log('[LocalSearch] Starting syncAll');

    if (!this.canSync()) {
      console.warn('[LocalSearch] syncAll skipped - not ready');
      return;
    }

    const sources = ['slack', 'notion', 'linear', 'gmail'];
    const results = await Promise.allSettled(
      sources.map(source => this.syncSource(source))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[LocalSearch] ${sources[index]} sync failed:`, result.reason);
      }
    });

    console.log('[LocalSearch] syncAll complete');
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

    if (!this.isInitialized()) {
      console.warn('[LocalSearch] Search skipped - DB not initialized');
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
        `[LocalSearch] Semantic: ${semanticResults.length}, Keyword: ${keywordResults.length}${source ? `, source: ${source}` : ''}`
      );

      const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

      const reranked = await this.applyRerank(query, merged.slice(0, 30));
      const boosted = applyRecencyBoost(reranked);
      const sorted = [...boosted].sort((a, b) => b.score - a.score);

      return sorted.slice(0, limit);
    } catch (error) {
      console.error('[LocalSearch] Search failed:', error);
      return [];
    }
  }

  private async semanticSearch(
    queryEmbedding: Float32Array,
    limit: number,
    source?: string
  ): Promise<SearchResult[]> {
    if (!this.isInitialized()) {
      console.warn('[LocalSearch] semanticSearch skipped - DB not initialized');
      return [];
    }

    const db = this.dbService.getDb();

    const conditions = ['embedding IS NOT NULL'];
    const params: any[] = [JSON.stringify(Array.from(queryEmbedding)), limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    // Filter by selected Slack channels
    const allChannelsSemantic = getSelectedSlackChannels();
    const selectedIdsSemantic = allChannelsSemantic.filter(ch => ch.selected).map(ch => ch.id);

    if (allChannelsSemantic.length === 0) {
      // No config = include all Slack (opt-out model)
    } else if (selectedIdsSemantic.length > 0) {
      // Some selected = include only selected channels
      params.push(JSON.stringify(selectedIdsSemantic));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      // All deselected = exclude all Slack
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
    if (!this.isInitialized()) {
      console.warn('[LocalSearch] keywordSearch skipped - DB not initialized');
      return [];
    }

    // PostgreSQL websearch_to_tsquery ignores short tokens (≤3 chars) like "cto", "kr"
    if (query.length <= 3) {
      console.log(`[LocalSearch] Short query "${query}" - using LIKE search`);
      return this.likeSearch(query, limit, source);
    }

    const ftsResults = await this.ftsSearch(query, limit, source);

    if (ftsResults.length === 0) {
      console.log(`[LocalSearch] FTS returned 0 results for "${query}", falling back to LIKE`);
      return this.likeSearch(query, limit, source);
    }

    return ftsResults;
  }

  /**
   * Full-Text Search using tsvector
   */
  private async ftsSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    const db = this.dbService.getDb();

    const conditions = ['tsv @@ query'];
    const params: any[] = [query, limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    // Filter by selected Slack channels
    const allChannelsFts = getSelectedSlackChannels();
    const selectedIdsFts = allChannelsFts.filter(ch => ch.selected).map(ch => ch.id);

    if (allChannelsFts.length === 0) {
      // No config = include all Slack (opt-out model)
    } else if (selectedIdsFts.length > 0) {
      // Some selected = include only selected channels
      params.push(JSON.stringify(selectedIdsFts));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      // All deselected = exclude all Slack
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

  /**
   * LIKE search fallback for short keywords that FTS may miss
   */
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

    // Filter by selected Slack channels
    const allChannelsLike = getSelectedSlackChannels();
    const selectedIdsLike = allChannelsLike.filter(ch => ch.selected).map(ch => ch.id);

    if (allChannelsLike.length === 0) {
      // No config = include all Slack (opt-out model)
    } else if (selectedIdsLike.length > 0) {
      // Some selected = include only selected channels
      params.push(JSON.stringify(selectedIdsLike));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      // All deselected = exclude all Slack
      conditions.push(`source_type != 'slack'`);
    }

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
      console.error('[LocalSearch] Rerank failed, using original scores:', error);
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
