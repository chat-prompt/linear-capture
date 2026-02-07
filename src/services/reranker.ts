import { WORKER_BASE_URL } from './config';

export interface RerankResult {
  id: string;
  relevanceScore: number;
}

/**
 * Rerank documents via Worker /rerank endpoint (Cohere).
 * Falls back to original order on any failure.
 */
export async function rerank(
  query: string,
  documents: Array<{ id: string; text: string }>,
  topN = 20
): Promise<RerankResult[]> {
  if (!documents.length) return [];

  if (!query.trim()) {
    console.warn('[Reranker] Empty query, returning original order');
    return gracefulFallback(documents);
  }

  try {
    console.log(`[Reranker] Reranking ${documents.length} documents`);

    const response = await fetch(`${WORKER_BASE_URL}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents, topN }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[Reranker] Worker error (${response.status}): ${errorText}`
      );
      return gracefulFallback(documents);
    }

    const data = (await response.json()) as { results: RerankResult[] };
    console.log(`[Reranker] Success: ${data.results.length} results`);

    return data.results;
  } catch (error) {
    console.error('[Reranker] Failed:', error);
    return gracefulFallback(documents);
  }
}

function gracefulFallback(
  documents: Array<{ id: string; text: string }>
): RerankResult[] {
  console.log('[Reranker] Using fallback (preserving original scores)');
  return [];
}
