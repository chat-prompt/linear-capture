/**
 * Reranker Service - Worker 프록시를 통한 Cohere Rerank 호출
 * 
 * Bi-encoder(임베딩) 결과를 Cross-encoder(Cohere)로 재정렬하여
 * 검색 정확도를 20~33% 향상시킵니다.
 */

import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';

export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  relevanceScore: number;
  index: number;
}

interface WorkerRerankResponse {
  success: boolean;
  results?: RerankResult[];
  error?: string;
}

/**
 * Worker를 통해 Cohere Rerank API 호출
 * 
 * @param query - 검색 쿼리
 * @param documents - 재정렬할 문서 목록 (id + text)
 * @param topN - 반환할 상위 N개 (기본: 20)
 * @returns 재정렬된 결과 (실패 시 원본 순서 반환)
 */
export async function rerank(
  query: string,
  documents: RerankDocument[],
  topN = 20
): Promise<RerankResult[]> {
  if (!query || documents.length === 0) {
    logger.log('[Reranker] Empty query or documents, returning original order');
    return documents.map((doc, i) => ({
      id: doc.id,
      relevanceScore: 1 - (i / documents.length),
      index: i,
    }));
  }

  if (documents.length === 1) {
    return [{ id: documents[0].id, relevanceScore: 1, index: 0 }];
  }

  // 문서가 topN보다 적으면 전체 반환
  const effectiveTopN = Math.min(topN, documents.length);

  try {
    logger.log(`[Reranker] Reranking ${documents.length} documents for query: "${query.slice(0, 50)}..."`);
    const startTime = Date.now();

    const response = await fetch(`${WORKER_URL}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents,
        topN: effectiveTopN,
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      logger.warn(`[Reranker] Worker returned ${response.status}, using original order`);
      return fallbackOrder(documents);
    }

    const data: WorkerRerankResponse = await response.json();

    if (!data.success || !data.results) {
      logger.warn(`[Reranker] Worker error: ${data.error}, using original order`);
      return fallbackOrder(documents);
    }

    logger.log(`[Reranker] Reranked ${data.results.length} documents in ${elapsed}ms`);
    return data.results;
  } catch (error) {
    logger.error('[Reranker] Failed:', error instanceof Error ? error.message : 'Unknown error');
    return fallbackOrder(documents);
  }
}

/**
 * Graceful degradation: 원본 순서 기반 fallback 점수 반환
 */
function fallbackOrder(documents: RerankDocument[]): RerankResult[] {
  return documents.map((doc, i) => ({
    id: doc.id,
    relevanceScore: 1 - (i / documents.length),
    index: i,
  }));
}
