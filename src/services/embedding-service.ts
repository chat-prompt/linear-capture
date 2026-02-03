import OpenAI from 'openai';
import { encoding_for_model } from 'tiktoken';
import * as SettingsStore from './settings-store';

const MODEL = 'text-embedding-3-small';
const MAX_TOKENS_PER_TEXT = 8192;
const MAX_BATCH_SIZE = 2048;
const MAX_BATCH_TOKENS = 300000;

export class EmbeddingService {
  private client: OpenAI;
  private maxRetries = 3;
  private baseDelay = 1000;

  constructor() {
    const apiKey = SettingsStore.getOpenaiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required. Set it in Settings or OPENAI_API_KEY environment variable');
    }

    this.client = new OpenAI({ apiKey });
    console.log('🔮 EmbeddingService initialized (text-embedding-3-small)');
  }

  async embed(text: string): Promise<number[]> {
    const tokenCount = this.countTokens(text);
    if (tokenCount > MAX_TOKENS_PER_TEXT) {
      throw new Error(
        `Text exceeds maximum token limit: ${tokenCount} > ${MAX_TOKENS_PER_TEXT}`
      );
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Retry attempt ${attempt + 1} after ${delay}ms...`);
          await this.sleep(delay);
        }

        const response = await this.client.embeddings.create({
          model: MODEL,
          input: text,
          encoding_format: 'float'
        });

        return response.data[0].embedding;
      } catch (error) {
        console.error(`❌ Embedding attempt ${attempt + 1} failed:`, error);

        if (attempt < this.maxRetries - 1) {
          if (this.isRateLimitError(error)) {
            const retryAfter = this.getRetryAfter(error);
            if (retryAfter) {
              console.log(`⏳ Rate limited. Retrying after ${retryAfter}ms...`);
              await this.sleep(retryAfter);
            }
          }
          continue;
        }

        throw error;
      }
    }

    throw new Error('Embedding failed after all retries');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (texts.length > MAX_BATCH_SIZE) {
      throw new Error(
        `Batch size exceeds maximum: ${texts.length} > ${MAX_BATCH_SIZE}`
      );
    }

    const totalTokens = texts.reduce((sum, text) => sum + this.countTokens(text), 0);
    if (totalTokens > MAX_BATCH_TOKENS) {
      throw new Error(
        `Batch tokens exceed maximum: ${totalTokens} > ${MAX_BATCH_TOKENS}`
      );
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Retry attempt ${attempt + 1} after ${delay}ms...`);
          await this.sleep(delay);
        }

        const response = await this.client.embeddings.create({
          model: MODEL,
          input: texts,
          encoding_format: 'float'
        });

        return response.data.map(item => item.embedding);
      } catch (error) {
        console.error(`❌ Batch embedding attempt ${attempt + 1} failed:`, error);

        if (attempt < this.maxRetries - 1) {
          if (this.isRateLimitError(error)) {
            const retryAfter = this.getRetryAfter(error);
            if (retryAfter) {
              console.log(`⏳ Rate limited. Retrying after ${retryAfter}ms...`);
              await this.sleep(retryAfter);
            }
          }
          continue;
        }

        throw error;
      }
    }

    throw new Error('Batch embedding failed after all retries');
  }

  private countTokens(text: string): number {
    const encoding = encoding_for_model(MODEL);
    try {
      const tokens = encoding.encode(text);
      return tokens.length;
    } finally {
      encoding.free();
    }
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('rate_limit') || 
             error.message.includes('429');
    }
    return false;
  }

  private getRetryAfter(error: unknown): number | null {
    if (error && typeof error === 'object' && 'headers' in error) {
      const headers = error.headers as Record<string, string>;
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        return isNaN(seconds) ? null : seconds * 1000;
      }
    }
    return null;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createEmbeddingService(): EmbeddingService {
  return new EmbeddingService();
}
