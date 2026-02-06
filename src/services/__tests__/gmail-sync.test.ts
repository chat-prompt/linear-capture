import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/linear-capture-test'),
  },
}));

vi.mock('../settings-store', () => ({
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
  getOpenaiApiKey: vi.fn().mockReturnValue('test-openai-key'),
}));

const mockSearchEmails = vi.fn();
const mockGetConnectionStatus = vi.fn();
const mockQuery = vi.fn();
const mockEmbed = vi.fn();
const mockEmbedBatch = vi.fn();
const mockPreprocess = vi.fn();

vi.mock('../gmail-client', () => ({
  createGmailService: () => ({
    searchEmails: mockSearchEmails,
    getConnectionStatus: mockGetConnectionStatus,
  }),
}));

vi.mock('../database', () => ({
  getDatabaseService: () => ({
    getDb: () => ({
      query: mockQuery,
    }),
    isInitialized: () => true,
  }),
}));

vi.mock('../text-preprocessor', () => ({
  createTextPreprocessor: () => ({
    preprocess: mockPreprocess,
  }),
}));

vi.mock('../embedding-service', () => ({
  createEmbeddingService: () => ({
    embed: mockEmbed,
    embedBatch: mockEmbedBatch,
  }),
}));

import { GmailSyncAdapter, GmailSyncError } from '../sync-adapters/gmail-sync';

function createMockEmail(id: string, date: string) {
  return {
    id,
    threadId: `thread-${id}`,
    subject: `Test Email ${id}`,
    snippet: `This is a test email snippet for ${id}`,
    date,
    from: { name: 'Test Sender', email: 'test@example.com' },
  };
}

describe('GmailSyncAdapter', () => {
  let adapter: GmailSyncAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    mockQuery.mockResolvedValue({ rows: [] });
    mockPreprocess.mockImplementation((text: string) => text);
    mockEmbed.mockResolvedValue(new Array(1536).fill(0.1));
    mockEmbedBatch.mockResolvedValue([new Array(1536).fill(0.1)]);
    
    adapter = new GmailSyncAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sync success', () => {
    it('should sync emails successfully', async () => {
      const mockEmails = [
        createMockEmail('email-1', '2025-02-01T10:00:00Z'),
        createMockEmail('email-2', '2025-02-01T09:00:00Z'),
      ];

      mockSearchEmails.mockResolvedValue({
        success: true,
        messages: mockEmails,
      });

      const syncPromise = adapter.sync();
      
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBeGreaterThan(0);
      expect(mockSearchEmails).toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('should retry on network error and fail after 3 attempts', async () => {
      mockSearchEmails.mockResolvedValue({
        success: false,
        error: 'Network error: ECONNREFUSED',
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      
      try {
        await syncPromise;
        expect.fail('Should have thrown GmailSyncError');
      } catch (error) {
        expect(error).toBeInstanceOf(GmailSyncError);
        expect((error as GmailSyncError).retryCount).toBe(3);
        expect((error as GmailSyncError).exhaustedRetries).toBe(true);
      }
      
      expect(mockSearchEmails).toHaveBeenCalledTimes(3);
    });

    it('should fail immediately on 401 auth error without retry', async () => {
      mockSearchEmails.mockResolvedValue({
        success: false,
        error: 'Authentication failed: 401 Unauthorized',
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      
      try {
        await syncPromise;
        expect.fail('Should have thrown GmailSyncError');
      } catch (error) {
        expect(error).toBeInstanceOf(GmailSyncError);
        expect((error as GmailSyncError).exhaustedRetries).toBe(false);
      }
      
      expect(mockSearchEmails).toHaveBeenCalledTimes(1);
    });

    it('should fail immediately on 403 forbidden error without retry', async () => {
      mockSearchEmails.mockResolvedValue({
        success: false,
        error: 'Access denied: 403 Forbidden',
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      
      try {
        await syncPromise;
        expect.fail('Should have thrown GmailSyncError');
      } catch (error) {
        expect(error).toBeInstanceOf(GmailSyncError);
        expect((error as GmailSyncError).exhaustedRetries).toBe(false);
      }
      
      expect(mockSearchEmails).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit error with backoff', async () => {
      let callCount = 0;
      mockSearchEmails.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            success: false,
            error: 'Rate limited: 429 Too Many Requests',
          });
        }
        return Promise.resolve({
          success: true,
          messages: [createMockEmail('email-1', '2025-02-01T10:00:00Z')],
        });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(mockSearchEmails).toHaveBeenCalledTimes(3);
    });
  });

  describe('incremental sync', () => {
    it('should use cursor for incremental sync', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('sync_cursors') && sql.includes('SELECT')) {
          return Promise.resolve({ rows: [{ cursor_value: '2025-02-01T00:00:00Z' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      mockSearchEmails.mockResolvedValue({
        success: true,
        messages: [createMockEmail('email-1', '2025-02-02T10:00:00Z')],
      });

      const syncPromise = adapter.syncIncremental();
      
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(mockSearchEmails).toHaveBeenCalledWith(
        expect.stringContaining('after:'),
        expect.any(Number)
      );
    });

    it('should save cursor after successful partial sync', async () => {
      let batchCount = 0;
      mockSearchEmails.mockImplementation(() => {
        batchCount++;
        if (batchCount === 1) {
          return Promise.resolve({
            success: true,
            messages: [
              createMockEmail('email-1', '2025-02-01T10:00:00Z'),
              createMockEmail('email-2', '2025-02-01T09:00:00Z'),
            ],
          });
        }
        return Promise.resolve({
          success: true,
          messages: [],
        });
      });

      const syncPromise = adapter.syncIncremental();
      
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBeGreaterThan(0);
      
      const cursorUpdateCalls = mockQuery.mock.calls.filter(
        (call) => call[0].includes('sync_cursors') && call[0].includes('INSERT')
      );
      expect(cursorUpdateCalls.length).toBeGreaterThan(0);
    });
  });
});
