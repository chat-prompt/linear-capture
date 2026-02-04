import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackSync } from '../slack-sync';
import { LocalVectorStore } from '../local-vector-store';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/linear-capture-test'),
  },
}));

vi.mock('../settings-store', () => ({
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
}));

vi.mock('../slack-client', () => ({
  createSlackService: vi.fn().mockReturnValue({
    getConnectionStatus: vi.fn().mockResolvedValue({
      connected: true,
      workspace: { id: 'T123', name: 'Test Workspace' },
    }),
    getChannels: vi.fn().mockResolvedValue({
      success: true,
      channels: [
        { id: 'C001', name: 'general', is_private: false },
        { id: 'C002', name: 'random', is_private: false },
      ],
    }),
  }),
}));

vi.mock('../embedding-client', () => ({
  getEmbeddingClient: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue([new Float32Array(1536).fill(0.1)]),
  }),
}));

describe('SlackSync', () => {
  let vectorStore: LocalVectorStore;
  let sync: SlackSync;

  beforeEach(async () => {
    const testDir = '/tmp/linear-capture-test';
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    vectorStore = new LocalVectorStore('test-slack-sync.db');
    await vectorStore.initialize();
    sync = new SlackSync(vectorStore);

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        messages: [
          { ts: '1234567890.123456', text: 'Hello world', user: 'U001', type: 'message' },
        ],
        has_more: false,
      }),
    });
  });

  afterEach(() => {
    vectorStore.close();
    vi.restoreAllMocks();
    
    const dbPath = path.join('/tmp/linear-capture-test', 'test-slack-sync.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should sync messages from connected workspace', async () => {
    const result = await sync.sync({ maxChannels: 2, maxMessagesPerChannel: 10 });

    expect(result.synced).toBeGreaterThan(0);
    expect(result.workspaceId).toBe('T123');
    expect(result.channels).toBe(2);
  });

  it('should return empty result when not connected', async () => {
    const mockSlackService = {
      getConnectionStatus: vi.fn().mockResolvedValue({ connected: false }),
      getChannels: vi.fn(),
    };

    const { createSlackService } = await import('../slack-client');
    (createSlackService as any).mockReturnValueOnce(mockSlackService);

    const disconnectedSync = new SlackSync(vectorStore);
    const result = await disconnectedSync.sync();

    expect(result.synced).toBe(0);
    expect(result.errors).toContain('Not connected');
  });

  it('should use cursor for incremental sync', async () => {
    const result = await sync.sync({ maxChannels: 1, maxMessagesPerChannel: 10 });
    
    expect(result.synced).toBeGreaterThan(0);
    expect(result.workspaceId).toBe('T123');
    
    const cursor = await vectorStore.getSyncCursor('slack', 'T123', 'C001');
    expect(cursor).toBe('1234567890.123456');
  });
});
