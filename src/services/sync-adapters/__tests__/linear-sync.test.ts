import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/linear-capture-test'),
  },
}));

vi.mock('../../settings-store', () => ({
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
  getOpenaiApiKey: vi.fn().mockReturnValue('test-openai-key'),
}));

const mockQuery = vi.fn();
const mockEmbed = vi.fn();
const mockPreprocess = vi.fn();
const mockIssues = vi.fn();

vi.mock('../../linear-client', () => ({
  createLinearServiceFromEnv: () => ({
    getClient: () => ({
      issues: mockIssues,
    }),
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

vi.mock('../../embedding-client', () => ({
  getEmbeddingClient: () => ({
    embed: mockEmbed,
    embedSingle: async (text: string) => {
      const result = await mockEmbed([text]);
      return result[0];
    },
  }),
  EmbeddingClient: class {},
}));

import { LinearSyncAdapter } from '../linear-sync';

function createMockConnection(nodes: any[]) {
  return {
    nodes,
    pageInfo: { hasNextPage: false, hasPreviousPage: false },
    fetchNext: vi.fn(),
  };
}

function createMockIssue(id: string, identifier: string, updatedAt: Date) {
  return {
    id,
    identifier,
    title: `Test Issue ${identifier}`,
    description: 'Test description',
    url: `https://linear.app/team/${identifier}`,
    priority: 2,
    createdAt: new Date('2024-01-01'),
    updatedAt,
    team: Promise.resolve({ id: 'team-1', name: 'Team A' }),
    project: Promise.resolve({ id: 'proj-1', name: 'Project A' }),
    state: Promise.resolve({ name: 'In Progress' }),
    assignee: Promise.resolve({ id: 'user-1', name: 'John Doe' }),
    labels: () => Promise.resolve({ nodes: [{ name: 'bug' }] }),
  };
}

describe('LinearSyncAdapter', () => {
  let adapter: LinearSyncAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuery.mockResolvedValue({ rows: [] });
    mockPreprocess.mockImplementation((text: string) => text);
    mockEmbed.mockImplementation((texts: string[]) => 
      Promise.resolve(texts.map(() => new Float32Array(1536).fill(0.1)))
    );

    adapter = new LinearSyncAdapter();
  });

  describe('batch processing', () => {
    it('should process issues in batches of 10', async () => {
      const issues = Array.from({ length: 15 }, (_, i) =>
        createMockIssue(`issue-${i}`, `TEST-${i}`, new Date('2024-01-15'))
      );

      mockIssues.mockResolvedValue(createMockConnection(issues));

      const result = await adapter.sync();

      expect(result.itemsSynced).toBe(15);
      expect(mockEmbed).toHaveBeenCalledTimes(1);
      expect(mockEmbed).toHaveBeenNthCalledWith(1, expect.arrayContaining([expect.any(String)]));
    });

    it('should handle empty issue list', async () => {
      mockIssues.mockResolvedValue(createMockConnection([]));

      const result = await adapter.sync();

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBe(0);
      expect(result.itemsFailed).toBe(0);
    });
  });

  describe('parallel relation loading', () => {
    it('should load all relations in parallel', async () => {
      const issue = createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15'));
      mockIssues.mockResolvedValue(createMockConnection([issue]));

      await adapter.sync();

      expect(mockEmbed).toHaveBeenCalledWith([
        expect.stringContaining('TEST-1'),
      ]);
    });
  });

  describe('batch embedding', () => {
    it('should call embed() with array of texts instead of embedSingle()', async () => {
      const issues = [
        createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15')),
        createMockIssue('issue-2', 'TEST-2', new Date('2024-01-16')),
      ];
      mockIssues.mockResolvedValue(createMockConnection(issues));

      mockEmbed.mockResolvedValue([
        new Float32Array(1536).fill(0.1),
        new Float32Array(1536).fill(0.2),
      ]);

      await adapter.sync();

      expect(mockEmbed).toHaveBeenCalledTimes(1);
      expect(mockEmbed).toHaveBeenCalledWith([
        expect.stringContaining('TEST-1'),
        expect.stringContaining('TEST-2'),
      ]);
    });
  });

  describe('partial failure handling', () => {
    it('should handle embedding failure gracefully', async () => {
      const issues = [
        createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15')),
        createMockIssue('issue-2', 'TEST-2', new Date('2024-01-16')),
      ];
      mockIssues.mockResolvedValue(createMockConnection(issues));

      mockEmbed.mockRejectedValue(new Error('Embedding API error'));

      const result = await adapter.sync();

      expect(result.itemsFailed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should track errors correctly', async () => {
      const issue = createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15'));
      mockIssues.mockResolvedValue(createMockConnection([issue]));

      mockEmbed.mockRejectedValue(new Error('Custom error message'));

      const result = await adapter.sync();

      expect(result.itemsFailed).toBe(1);
      expect(result.errors[0].error).toBe('Embedding failed');
    });
  });

  describe('content hash change detection', () => {
    it('should skip unchanged issues', async () => {
      const issue = createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15'));
      mockIssues.mockResolvedValue(createMockConnection([issue]));

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT content_hash')) {
          return { rows: [{ content_hash: 'existing-hash' }] };
        }
        return { rows: [] };
      });

      mockPreprocess.mockReturnValue('different-text');

      await adapter.sync();

      expect(mockEmbed).toHaveBeenCalled();
    });

    it('should process new issues', async () => {
      const issue = createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15'));
      mockIssues.mockResolvedValue(createMockConnection([issue]));

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.sync();

      expect(mockEmbed).toHaveBeenCalledTimes(1);
    });
  });

  describe('cursor management', () => {
    it('should update cursor with latest updatedAt from successful syncs', async () => {
      const issues = [
        createMockIssue('issue-1', 'TEST-1', new Date('2024-01-10')),
        createMockIssue('issue-2', 'TEST-2', new Date('2024-01-20')),
        createMockIssue('issue-3', 'TEST-3', new Date('2024-01-15')),
      ];
      mockIssues.mockResolvedValue(createMockConnection(issues));

      const result = await adapter.sync();

      expect(result.lastCursor).toBe('2024-01-20T00:00:00.000Z');
    });
  });

  describe('incremental sync', () => {
    it('should filter issues by last cursor', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT cursor_value')) {
          return { rows: [{ cursor_value: '2024-01-10T00:00:00.000Z' }] };
        }
        return { rows: [] };
      });

      mockIssues.mockResolvedValue(createMockConnection([]));

      await adapter.syncIncremental();

      expect(mockIssues).toHaveBeenCalledWith({
        first: 100,
        filter: { updatedAt: { gt: expect.any(Date) } },
      });
    });

    it('should report progress via callback', async () => {
      const issues = [
        createMockIssue('issue-1', 'TEST-1', new Date('2024-01-15')),
        createMockIssue('issue-2', 'TEST-2', new Date('2024-01-16')),
      ];
      mockIssues.mockResolvedValue(createMockConnection(issues));

      const progressCallback = vi.fn();
      await adapter.syncIncremental(progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'linear', phase: 'discovering' })
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'linear', phase: 'syncing' })
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'linear', phase: 'complete' })
      );
    });
  });
});
