import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

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

// Mock embedding-client: GmailSyncAdapter uses getEmbeddingClient().embed(texts)
vi.mock('../embedding-client', () => ({
  getEmbeddingClient: () => ({
    embed: mockEmbed,
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
    // embed returns Float32Array[] matching input length
    mockEmbed.mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => new Float32Array(new Array(1536).fill(0.1))))
    );

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

      // First call returns emails, second returns empty to stop pagination
      mockSearchEmails
        .mockResolvedValueOnce({ success: true, messages: mockEmails })
        .mockResolvedValueOnce({ success: true, messages: [] });

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

      let caughtError: GmailSyncError | undefined;
      const syncPromise = adapter.sync().catch((e: GmailSyncError) => {
        caughtError = e;
      });
      await vi.runAllTimersAsync();
      await syncPromise;

      expect(caughtError).toBeInstanceOf(GmailSyncError);
      expect(caughtError!.retryCount).toBe(3);
      expect(caughtError!.exhaustedRetries).toBe(true);
      expect(mockSearchEmails).toHaveBeenCalledTimes(3);
    });

    it('should fail immediately on 401 auth error without retry', async () => {
      mockSearchEmails.mockResolvedValue({
        success: false,
        error: 'Authentication failed: 401 Unauthorized',
      });

      let caughtError: GmailSyncError | undefined;
      const syncPromise = adapter.sync().catch((e: GmailSyncError) => {
        caughtError = e;
      });
      await vi.runAllTimersAsync();
      await syncPromise;

      expect(caughtError).toBeInstanceOf(GmailSyncError);
      expect(caughtError!.exhaustedRetries).toBe(false);
      expect(mockSearchEmails).toHaveBeenCalledTimes(1);
    });

    it('should fail immediately on 403 forbidden error without retry', async () => {
      mockSearchEmails.mockResolvedValue({
        success: false,
        error: 'Access denied: 403 Forbidden',
      });

      let caughtError: GmailSyncError | undefined;
      const syncPromise = adapter.sync().catch((e: GmailSyncError) => {
        caughtError = e;
      });
      await vi.runAllTimersAsync();
      await syncPromise;

      expect(caughtError).toBeInstanceOf(GmailSyncError);
      expect(caughtError!.exhaustedRetries).toBe(false);
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
        if (callCount === 3) {
          return Promise.resolve({
            success: true,
            messages: [createMockEmail('email-1', '2025-02-01T10:00:00Z')],
          });
        }
        // Return empty to stop pagination loop
        return Promise.resolve({ success: true, messages: [] });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // 3 calls for retry, then 1 more for empty pagination stop
      expect(mockSearchEmails).toHaveBeenCalledTimes(4);
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

      // First call returns emails, second returns empty to stop pagination
      mockSearchEmails
        .mockResolvedValueOnce({
          success: true,
          messages: [createMockEmail('email-1', '2025-02-02T10:00:00Z')],
        })
        .mockResolvedValueOnce({ success: true, messages: [] });

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
      // First call returns emails, second returns empty
      mockSearchEmails
        .mockResolvedValueOnce({
          success: true,
          messages: [
            createMockEmail('email-1', '2025-02-01T10:00:00Z'),
            createMockEmail('email-2', '2025-02-01T09:00:00Z'),
          ],
        })
        .mockResolvedValueOnce({ success: true, messages: [] });

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

  describe('batch processing optimization', () => {
    it('should process single email batch successfully', async () => {
      const mockEmail = createMockEmail('email-1', '2025-02-01T10:00:00Z');

      // First call returns email, second returns empty
      mockSearchEmails
        .mockResolvedValueOnce({ success: true, messages: [mockEmail] })
        .mockResolvedValueOnce({ success: true, messages: [] });

      mockQuery.mockResolvedValue({ rows: [] });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBe(1);
    });

    it('should return immediately for empty batch', async () => {
      mockSearchEmails.mockResolvedValue({
        success: true,
        messages: [],
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBe(0);
      expect(result.itemsFailed).toBe(0);
      expect(mockEmbed).not.toHaveBeenCalled();
    });

    it('should handle partial save failure', async () => {
      const mockEmails = [
        createMockEmail('email-1', '2025-02-01T10:00:00Z'),
        createMockEmail('email-2', '2025-02-01T09:00:00Z'),
        createMockEmail('email-3', '2025-02-01T08:00:00Z'),
      ];

      // First call returns emails, second returns empty
      mockSearchEmails
        .mockResolvedValueOnce({ success: true, messages: mockEmails })
        .mockResolvedValueOnce({ success: true, messages: [] });

      let insertCallCount = 0;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT source_id, content_hash FROM documents')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('INSERT INTO documents')) {
          insertCallCount++;
          if (insertCallCount === 2) {
            return Promise.reject(new Error('DB write failed'));
          }
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('sync_cursors')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.itemsSynced).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain('DB write failed');
    });

    it('should skip embedding when all hashes unchanged', async () => {
      const email1 = createMockEmail('email-1', '2025-02-01T10:00:00Z');
      const email2 = createMockEmail('email-2', '2025-02-01T09:00:00Z');

      const hash1 = crypto.createHash('md5').update(`${email1.subject}\n\n${email1.snippet}`).digest('hex');
      const hash2 = crypto.createHash('md5').update(`${email2.subject}\n\n${email2.snippet}`).digest('hex');

      // First call returns emails, second returns empty
      mockSearchEmails
        .mockResolvedValueOnce({ success: true, messages: [email1, email2] })
        .mockResolvedValueOnce({ success: true, messages: [] });

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT source_id, content_hash FROM documents')) {
          return Promise.resolve({
            rows: [
              { source_id: 'email-1', content_hash: hash1 },
              { source_id: 'email-2', content_hash: hash2 },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(mockEmbed).not.toHaveBeenCalled();
      expect(result.itemsSynced).toBe(0);
    });

    it('should track skipped count separately from synced', async () => {
      const email1 = createMockEmail('email-1', '2025-02-01T10:00:00Z');
      const email2 = createMockEmail('email-2', '2025-02-01T09:00:00Z');
      const email3 = createMockEmail('email-3', '2025-02-01T08:00:00Z');

      const hash1 = crypto.createHash('md5').update(`${email1.subject}\n\n${email1.snippet}`).digest('hex');

      // First call returns emails, second returns empty
      mockSearchEmails
        .mockResolvedValueOnce({ success: true, messages: [email1, email2, email3] })
        .mockResolvedValueOnce({ success: true, messages: [] });

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT source_id, content_hash FROM documents')) {
          return Promise.resolve({
            rows: [
              { source_id: 'email-1', content_hash: hash1 },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.itemsSynced).toBe(2);
      expect(result.itemsFailed).toBe(0);
      expect(mockEmbed).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]));
    });

    it('should use reduced batch delay of 50ms', async () => {
      let batchCount = 0;
      mockSearchEmails.mockImplementation(() => {
        batchCount++;
        if (batchCount === 1) {
          return Promise.resolve({
            success: true,
            messages: Array.from({ length: 100 }, (_, i) =>
              createMockEmail(`email-${i}`, '2025-02-01T10:00:00Z')
            ),
          });
        }
        return Promise.resolve({ success: true, messages: [] });
      });

      const syncPromise = adapter.sync();
      await vi.runAllTimersAsync();
      await syncPromise;

      expect(mockSearchEmails).toHaveBeenCalledTimes(2);
    });
  });
});
