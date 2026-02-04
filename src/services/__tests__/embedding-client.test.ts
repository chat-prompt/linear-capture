import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingClient } from '../embedding-client';

describe('EmbeddingClient', () => {
  let client: EmbeddingClient;

  beforeEach(() => {
    client = new EmbeddingClient();
  });

  it('should return empty array for empty input', async () => {
    const results = await client.embed([]);
    expect(results).toEqual([]);
  });

  it('should batch large inputs', async () => {
    const mockEmbedding = Array(1536).fill(0.1);
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const batchSize = callCount === 1 ? 100 : 50;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          embeddings: Array(batchSize).fill(mockEmbedding),
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: batchSize, total_tokens: batchSize }
        })
      });
    });

    const texts = Array(150).fill('test');
    const results = await client.embed(texts);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(results.length).toBe(150);
  });

  it('should handle rate limit with backoff', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 429 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          embeddings: [Array(1536).fill(0.1)],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 1, total_tokens: 1 }
        })
      });
    });

    const results = await client.embed(['test']);
    expect(results.length).toBe(1);
    expect(results[0].length).toBe(1536);
    expect(callCount).toBe(2);
  });

  it('should return empty arrays on persistent failure (graceful degradation)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const results = await client.embed(['test']);
    expect(results.length).toBe(1);
    expect(results[0].length).toBe(0);
  });

  it('should handle embedSingle', async () => {
    const mockEmbedding = Array(1536).fill(0.2);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        embeddings: [mockEmbedding],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 1, total_tokens: 1 }
      })
    });

    const result = await client.embedSingle('test');
    expect(result.length).toBe(1536);
    expect(result[0]).toBeCloseTo(0.2, 5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
