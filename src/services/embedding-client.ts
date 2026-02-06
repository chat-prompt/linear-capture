import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';

interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class EmbeddingClient {
  private maxRetries = 3;
  private batchSize = 100;
  private baseDelay = 1000;

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const results: Float32Array[] = [];

    // Batch processing
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResult = await this.embedBatch(batch);
      results.push(...batchResult);
    }

    return results;
  }

  private async embedBatch(texts: string[]): Promise<Float32Array[]> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
       try {
         if (attempt > 0) {
           const delay = this.baseDelay * Math.pow(2, attempt - 1);
           logger.log(`[EmbeddingClient] Retry ${attempt}, waiting ${delay}ms`);
           await this.sleep(delay);
         }

         const response = await fetch(`${WORKER_URL}/embeddings`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ texts })
         });

         if (response.status === 429) {
           logger.warn('[EmbeddingClient] Rate limited, retrying...');
           continue;
         }

         if (!response.ok) {
           throw new Error(`HTTP ${response.status}`);
         }

         const data = await response.json() as EmbeddingResponse;
         return data.embeddings.map(e => new Float32Array(e));

       } catch (error) {
         logger.error(`[EmbeddingClient] Attempt ${attempt + 1} failed:`, error);
         if (attempt === this.maxRetries - 1) {
           logger.error('[EmbeddingClient] All retries failed, returning empty');
           return texts.map(() => new Float32Array(0));
         }
       }
    }

    return texts.map(() => new Float32Array(0));
  }

  async embedSingle(text: string): Promise<Float32Array> {
    const results = await this.embed([text]);
    return results[0] || new Float32Array(0);
  }
}

// Singleton
let embeddingClient: EmbeddingClient | null = null;

export function getEmbeddingClient(): EmbeddingClient {
  if (!embeddingClient) {
    embeddingClient = new EmbeddingClient();
  }
  return embeddingClient;
}
