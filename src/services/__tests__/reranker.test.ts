import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rerank } from '../reranker';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('reranker', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rerank', () => {
    it('returns fallback order for empty query', async () => {
      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('', docs);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1');
      expect(results[0].relevanceScore).toBeCloseTo(1, 1);
    });

    it('returns fallback order for empty documents', async () => {
      const results = await rerank('test query', []);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });

    it('calls Worker and returns reranked results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          results: [
            { id: 'doc2', relevanceScore: 0.95, index: 1 },
            { id: 'doc1', relevanceScore: 0.75, index: 0 },
          ],
        }),
      });

      const docs = [
        { id: 'doc1', text: 'First document' },
        { id: 'doc2', text: 'Second document' },
      ];

      const results = await rerank('test query', docs, 2);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rerank'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc2');
      expect(results[0].relevanceScore).toBe(0.95);
    });

    it('returns fallback order on Worker error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('test query', docs);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1');
    });

    it('returns fallback order on Worker success=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'COHERE_API_KEY not configured',
        }),
      });

      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('test query', docs);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1');
    });

    it('returns fallback order on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const docs = [
        { id: 'doc1', text: 'Document 1' },
      ];

      const results = await rerank('test query', docs);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc1');
    });

    it('limits topN to document count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          results: [
            { id: 'doc1', relevanceScore: 0.9, index: 0 },
            { id: 'doc2', relevanceScore: 0.8, index: 1 },
          ],
        }),
      });

      const docs = [
        { id: 'doc1', text: 'First doc' },
        { id: 'doc2', text: 'Second doc' },
      ];

      await rerank('test query', docs, 100);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.topN).toBe(2);
    });

    it('returns single document without calling Worker', async () => {
      const docs = [{ id: 'doc1', text: 'Single doc' }];

      const results = await rerank('test query', docs);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });
});
