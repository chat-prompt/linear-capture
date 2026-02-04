import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVectorSearch = vi.fn();
const mockFtsSearch = vi.fn();
const mockEmbedSingle = vi.fn();

vi.mock('../local-vector-store', () => ({
  LocalVectorStore: class MockLocalVectorStore {
    vectorSearch = mockVectorSearch;
    ftsSearch = mockFtsSearch;
  },
}));

vi.mock('../embedding-client', () => ({
  getEmbeddingClient: () => ({
    embedSingle: mockEmbedSingle,
  }),
  EmbeddingClient: class MockEmbeddingClient {},
}));

import { HybridSearch } from '../hybrid-search';
import { LocalVectorStore } from '../local-vector-store';

describe('HybridSearch', () => {
  let hybridSearch: HybridSearch;
  let mockVectorStore: LocalVectorStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVectorStore = new LocalVectorStore();
    hybridSearch = new HybridSearch(mockVectorStore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for empty query', async () => {
    const results = await hybridSearch.search('');
    expect(results).toEqual([]);
    expect(mockEmbedSingle).not.toHaveBeenCalled();
  });

  it('should combine vector and FTS results with RRF', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    mockEmbedSingle.mockResolvedValue(embedding);

    const vectorResults = [
      { id: 'doc1', source: 'slack', workspaceId: 'W1', content: 'vector match', score: 0.9 },
      { id: 'doc2', source: 'slack', workspaceId: 'W1', content: 'vector only', score: 0.8 },
    ];
    const ftsResults = [
      { id: 'doc1', source: 'slack', workspaceId: 'W1', content: 'vector match', score: 1.0 },
      { id: 'doc3', source: 'slack', workspaceId: 'W1', content: 'fts only', score: 1.0 },
    ];

    mockVectorSearch.mockResolvedValue(vectorResults);
    mockFtsSearch.mockResolvedValue(ftsResults);

    const results = await hybridSearch.search('test query');

    expect(results.length).toBeGreaterThan(0);
    
    const doc1 = results.find(r => r.id === 'doc1');
    expect(doc1).toBeDefined();
    expect(doc1?.matchType).toBe('both');

    const doc2 = results.find(r => r.id === 'doc2');
    expect(doc2?.matchType).toBe('vector');

    const doc3 = results.find(r => r.id === 'doc3');
    expect(doc3?.matchType).toBe('fts');
  });

  it('should fallback to FTS when embedding fails', async () => {
    mockEmbedSingle.mockRejectedValue(new Error('API error'));

    const ftsResults = [
      { id: 'doc1', source: 'slack', workspaceId: 'W1', content: 'fts result', score: 1.0 },
    ];
    mockFtsSearch.mockResolvedValue(ftsResults);

    const results = await hybridSearch.search('test query');

    expect(results.length).toBe(1);
    expect(results[0].matchType).toBe('fts');
    expect(mockVectorSearch).not.toHaveBeenCalled();
  });

  it('should fallback to FTS when embedding returns empty array', async () => {
    mockEmbedSingle.mockResolvedValue(new Float32Array(0));

    const ftsResults = [
      { id: 'doc1', source: 'slack', workspaceId: 'W1', content: 'fts result', score: 1.0 },
    ];
    mockFtsSearch.mockResolvedValue(ftsResults);

    const results = await hybridSearch.search('test query');

    expect(results.length).toBe(1);
    expect(results[0].matchType).toBe('fts');
    expect(mockVectorSearch).not.toHaveBeenCalled();
  });

  it('should respect limit option', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    mockEmbedSingle.mockResolvedValue(embedding);

    const vectorResults = Array.from({ length: 20 }, (_, i) => ({
      id: `doc${i}`,
      source: 'slack' as const,
      workspaceId: 'W1',
      content: `content ${i}`,
      score: 0.9 - i * 0.01,
    }));
    mockVectorSearch.mockResolvedValue(vectorResults);
    mockFtsSearch.mockResolvedValue([]);

    const results = await hybridSearch.search('test', { limit: 5 });

    expect(results.length).toBe(5);
  });

  it('should filter by source option', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    mockEmbedSingle.mockResolvedValue(embedding);
    mockVectorSearch.mockResolvedValue([]);
    mockFtsSearch.mockResolvedValue([]);

    await hybridSearch.search('test', { source: 'slack' });

    expect(mockVectorSearch).toHaveBeenCalledWith(
      embedding,
      expect.objectContaining({ source: 'slack' })
    );
  });

  it('should handle FTS errors gracefully', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    mockEmbedSingle.mockResolvedValue(embedding);
    mockVectorSearch.mockResolvedValue([
      { id: 'doc1', source: 'slack', workspaceId: 'W1', content: 'vector result', score: 0.9 },
    ]);
    mockFtsSearch.mockRejectedValue(new Error('FTS syntax error'));

    const results = await hybridSearch.search('test AND OR query');

    expect(results.length).toBe(1);
    expect(results[0].matchType).toBe('vector');
  });

  it('should rank items appearing in both results higher', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    mockEmbedSingle.mockResolvedValue(embedding);

    const vectorResults = [
      { id: 'vector-only', source: 'slack', workspaceId: 'W1', content: 'only in vector', score: 0.95 },
      { id: 'both', source: 'slack', workspaceId: 'W1', content: 'in both', score: 0.8 },
    ];
    const ftsResults = [
      { id: 'fts-only', source: 'slack', workspaceId: 'W1', content: 'only in fts', score: 1.0 },
      { id: 'both', source: 'slack', workspaceId: 'W1', content: 'in both', score: 1.0 },
    ];

    mockVectorSearch.mockResolvedValue(vectorResults);
    mockFtsSearch.mockResolvedValue(ftsResults);

    const results = await hybridSearch.search('test query');

    const bothIndex = results.findIndex(r => r.id === 'both');
    expect(bothIndex).toBe(0);
  });
});
