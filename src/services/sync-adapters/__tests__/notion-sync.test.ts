import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/linear-capture-test'),
  },
}));

vi.mock('../../settings-store', () => ({
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
  getOpenaiApiKey: vi.fn().mockReturnValue('test-openai-key'),
}));

const mockSearchPages = vi.fn();
const mockGetPageContent = vi.fn();
const mockQuery = vi.fn();
const mockEmbed = vi.fn();
const mockEmbedSingle = vi.fn();
const mockPreprocess = vi.fn();

vi.mock('../../notion-client', () => ({
  createNotionService: () => ({
    searchPages: mockSearchPages,
    searchPagesForSync: mockSearchPages,
    getPageContent: mockGetPageContent,
  }),
}));

vi.mock('../../database', () => ({
  getDatabaseService: () => ({
    getDb: () => ({
      query: mockQuery,
    }),
    isInitialized: () => true,
  }),
}));

vi.mock('../../text-preprocessor', () => ({
  createTextPreprocessor: () => ({
    preprocess: mockPreprocess,
  }),
}));

// Mock embedding-client: syncFromApi uses deps.embeddingClient.embed(texts)
// NotionSyncAdapter.syncPage uses this.embeddingClient.embedSingle(text)
vi.mock('../../embedding-client', () => ({
  getEmbeddingClient: () => ({
    embed: mockEmbed,
    embedSingle: mockEmbedSingle,
  }),
}));

// Mock notion-local-reader: syncIncremental checks isNotionDbAvailable()
vi.mock('../../notion-local-reader', () => ({
  isNotionDbAvailable: vi.fn().mockReturnValue(false),
  getNotionLocalReader: vi.fn(),
}));

import { NotionSyncAdapter } from '../notion-sync';

function createMockPage(id: string, lastEdited: string) {
  return {
    id,
    title: `Test Page ${id}`,
    url: `https://notion.so/${id}`,
    lastEditedTime: lastEdited,
    icon: null,
    parent: null,
  };
}

describe('NotionSyncAdapter', () => {
  let adapter: NotionSyncAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockQuery.mockResolvedValue({ rows: [] });
    mockPreprocess.mockImplementation((text: string) => text);
    // embed returns Float32Array[] matching input length
    mockEmbed.mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => new Float32Array(new Array(1536).fill(0.1))))
    );
    mockEmbedSingle.mockResolvedValue(new Float32Array(new Array(1536).fill(0.1)));
    mockGetPageContent.mockResolvedValue({ success: true, content: 'Test page content', blockCount: 1 });

    adapter = new NotionSyncAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sync - pagination', () => {
    it('should pass cursor parameter to searchPages', async () => {
      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-1', '2024-01-01T00:00:00Z')],
        hasMore: false,
        nextCursor: null,
      });

      await adapter.sync();

      // First call should have undefined cursor
      expect(mockSearchPages).toHaveBeenNthCalledWith(1, 100, undefined);
    });

    it('should pass cursor to subsequent calls when hasMore is true', async () => {
      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-1', '2024-01-01T00:00:00Z')],
        hasMore: true,
        nextCursor: 'cursor-abc',
      });
      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-2', '2024-01-02T00:00:00Z')],
        hasMore: false,
        nextCursor: null,
      });

      await adapter.sync();

      expect(mockSearchPages).toHaveBeenNthCalledWith(1, 100, undefined);
      expect(mockSearchPages).toHaveBeenNthCalledWith(2, 100, 'cursor-abc');
    });

    it('should stop when hasMore is false', async () => {
      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-1', '2024-01-01T00:00:00Z')],
        hasMore: false,
        nextCursor: null,
      });

      await adapter.sync();

      expect(mockSearchPages).toHaveBeenCalledTimes(1);
    });

    it('should fetch all pages across multiple API calls', async () => {
      mockSearchPages
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-1', '2024-01-01T00:00:00Z')],
          hasMore: true,
          nextCursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-2', '2024-01-02T00:00:00Z')],
          hasMore: true,
          nextCursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-3', '2024-01-03T00:00:00Z')],
          hasMore: false,
          nextCursor: null,
        });

      const result = await adapter.sync();

      expect(mockSearchPages).toHaveBeenCalledTimes(3);
      expect(result.itemsSynced).toBe(3);
    });

    it('should accumulate itemsSynced across pages', async () => {
      mockSearchPages
        .mockResolvedValueOnce({
          success: true,
          pages: [
            createMockPage('page-1', '2024-01-01T00:00:00Z'),
            createMockPage('page-2', '2024-01-01T00:00:00Z'),
          ],
          hasMore: true,
          nextCursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          success: true,
          pages: [
            createMockPage('page-3', '2024-01-02T00:00:00Z'),
          ],
          hasMore: false,
          nextCursor: null,
        });

      const result = await adapter.sync();

      expect(result.itemsSynced).toBe(3);
    });
  });

  describe('syncIncremental - pagination', () => {
    it('should paginate when more pages exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cursor_value: '2024-01-01T00:00:00Z' }] });

      mockSearchPages
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-1', '2024-01-02T00:00:00Z')],
          hasMore: true,
          nextCursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-2', '2024-01-03T00:00:00Z')],
          hasMore: false,
          nextCursor: null,
        });

      await adapter.syncIncremental();

      expect(mockSearchPages).toHaveBeenCalledTimes(2);
      expect(mockSearchPages).toHaveBeenNthCalledWith(1, 100, undefined);
      expect(mockSearchPages).toHaveBeenNthCalledWith(2, 100, 'cursor-1');
    });

    it('should filter by lastCursor across all paginated results', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('sync_cursors') && sql.includes('SELECT')) {
          return Promise.resolve({ rows: [{ cursor_value: '2024-01-02T00:00:00Z' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockSearchPages
        .mockResolvedValueOnce({
          success: true,
          pages: [
            createMockPage('page-old', '2024-01-01T00:00:00Z'),
            createMockPage('page-new', '2024-01-03T00:00:00Z'),
          ],
          hasMore: true,
          nextCursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          success: true,
          pages: [
            createMockPage('page-old2', '2024-01-01T00:00:00Z'),
            createMockPage('page-new2', '2024-01-04T00:00:00Z'),
          ],
          hasMore: false,
          nextCursor: null,
        });

      const result = await adapter.syncIncremental();

      expect(result.itemsSynced).toBe(2);
    });
  });

  describe('syncFromApi - batch embedding', () => {
    it('should use embed for batch embedding in syncIncremental', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [
          createMockPage('page-1', '2024-01-01T00:00:00Z'),
          createMockPage('page-2', '2024-01-02T00:00:00Z'),
        ],
        hasMore: false,
        nextCursor: null,
      });

      await adapter.syncIncremental();

      // syncFromApi uses deps.embeddingClient.embed(texts) for batch embedding
      expect(mockEmbed).toHaveBeenCalled();
    });

    it('should truncate content to MAX_TEXT_CHARS (5000)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const longContent = 'x'.repeat(10000);
      mockGetPageContent.mockResolvedValue({ success: true, content: longContent, blockCount: 1 });

      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-long', '2024-01-01T00:00:00Z')],
        hasMore: false,
        nextCursor: null,
      });

      mockPreprocess.mockImplementation((text: string) => text);

      await adapter.syncIncremental();

      const embedCalls = mockEmbed.mock.calls;
      if (embedCalls.length > 0) {
        const texts = embedCalls[0][0] as string[];
        for (const text of texts) {
          expect(text.length).toBeLessThanOrEqual(5000);
        }
      }
    });

    it('should limit getPageContent concurrency to 3', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const pages = Array.from({ length: 10 }, (_, i) =>
        createMockPage(`page-${i}`, `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
      );

      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages,
        hasMore: false,
        nextCursor: null,
      });

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockGetPageContent.mockImplementation(async () => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) {
          maxConcurrent = currentConcurrent;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        currentConcurrent--;
        return { success: true, content: 'Test content', blockCount: 1 };
      });

      vi.useRealTimers();
      await adapter.syncIncremental();
      vi.useFakeTimers();

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('error handling', () => {
    it('should save pagination cursor on mid-sync failure', async () => {
      mockSearchPages
        .mockResolvedValueOnce({
          success: true,
          pages: [createMockPage('page-1', '2024-01-01T00:00:00Z')],
          hasMore: true,
          nextCursor: 'cursor-after-page-1',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'API rate limited',
        });

      await expect(adapter.sync()).rejects.toThrow('API rate limited');

      const saveCursorCalls = mockQuery.mock.calls.filter(
        (call) => call[0].includes('INSERT INTO sync_cursors') && call[0].includes('pagination_cursor')
      );
      expect(saveCursorCalls.length).toBeGreaterThan(0);
    });

    it('should resume from saved pagination cursor', async () => {
      mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('sync_cursors') && sql.includes('SELECT') &&
            params && (params as string[])[0] === 'notion_pagination_cursor') {
          return Promise.resolve({ rows: [{ cursor_value: 'saved-cursor-123' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockSearchPages.mockResolvedValueOnce({
        success: true,
        pages: [createMockPage('page-2', '2024-01-02T00:00:00Z')],
        hasMore: false,
        nextCursor: null,
      });

      await adapter.sync();

      expect(mockSearchPages).toHaveBeenCalledWith(100, 'saved-cursor-123');
    });
  });
});
