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
    it('returns empty array for empty query (graceful fallback)', async () => {
      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('', docs);

      expect(mockFetch).not.toHaveBeenCalled();
      // gracefulFallback returns [] per current implementation
      expect(results).toHaveLength(0);
    });

    it('returns empty array for empty documents', async () => {
      const results = await rerank('test query', []);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });

    it('calls Worker and returns reranked results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

    it('returns empty fallback on Worker error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('test query', docs);

      // gracefulFallback returns []
      expect(results).toHaveLength(0);
    });

    it('returns results from Worker even when success field is missing', async () => {
      // The source code reads data.results directly, not checking data.success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 'doc1', relevanceScore: 0.9 },
          ],
        }),
      });

      const docs = [
        { id: 'doc1', text: 'Document 1' },
        { id: 'doc2', text: 'Document 2' },
      ];

      const results = await rerank('test query', docs);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc1');
    });

    it('returns empty fallback on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const docs = [
        { id: 'doc1', text: 'Document 1' },
      ];

      const results = await rerank('test query', docs);

      // gracefulFallback returns []
      expect(results).toHaveLength(0);
    });
  });
});
