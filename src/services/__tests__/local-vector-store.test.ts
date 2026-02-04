import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalVectorStore, VectorItem } from '../local-vector-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return path.join(os.tmpdir(), 'linear-capture-test');
      }
      return os.tmpdir();
    }
  }
}));

describe('LocalVectorStore', () => {
  let store: LocalVectorStore;
  const testDbName = 'test-vector-store.db';
  const testDir = path.join(os.tmpdir(), 'linear-capture-test');

  beforeEach(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    store = new LocalVectorStore(testDbName);
    await store.initialize();
  });

  afterEach(() => {
    store.close();
    const dbPath = path.join(testDir, testDbName);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should initialize SQLite database with FTS4', async () => {
    expect(store).toBeDefined();
    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(0);
    expect(stats.totalEmbeddings).toBe(0);
  });

  it('should upsert items with embeddings', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    const items: VectorItem[] = [{
      id: 'test-1',
      source: 'slack',
      workspaceId: 'T123',
      content: 'test message',
      embedding
    }];
    
    const count = await store.upsert(items);
    expect(count).toBe(1);

    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(1);
    expect(stats.totalEmbeddings).toBe(1);
  });

  it('should deduplicate by content hash', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    const item: VectorItem = {
      id: 'test-1',
      source: 'slack',
      workspaceId: 'T123',
      content: 'duplicate content',
      embedding
    };

    await store.upsert([item]);
    await store.upsert([{ ...item, id: 'test-2' }]);

    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(1);
  });

  it('should separate by workspace', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'workspace 1 message',
        embedding
      },
      {
        id: 'test-2',
        source: 'slack',
        workspaceId: 'T456',
        content: 'workspace 2 message',
        embedding
      }
    ];

    await store.upsert(items);

    const stats = await store.getStats();
    expect(stats.byWorkspace['T123']).toBe(1);
    expect(stats.byWorkspace['T456']).toBe(1);
  });

  it('should perform vector search', async () => {
    const embedding1 = new Float32Array(1536).fill(0.1);
    const embedding2 = new Float32Array(1536).fill(0.9);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'first message',
        embedding: embedding1
      },
      {
        id: 'test-2',
        source: 'slack',
        workspaceId: 'T123',
        content: 'second message',
        embedding: embedding2
      }
    ];

    await store.upsert(items);

    const queryEmbedding = new Float32Array(1536).fill(0.9);
    const results = await store.vectorSearch(queryEmbedding, { limit: 2 });

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('test-2');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('should filter vector search by workspace', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'workspace 1',
        embedding
      },
      {
        id: 'test-2',
        source: 'slack',
        workspaceId: 'T456',
        content: 'workspace 2',
        embedding
      }
    ];

    await store.upsert(items);

    const results = await store.vectorSearch(embedding, { workspaceId: 'T123' });

    expect(results.length).toBe(1);
    expect(results[0].workspaceId).toBe('T123');
  });

  it('should perform FTS search', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'hello world from slack',
        title: 'Greeting',
        embedding
      },
      {
        id: 'test-2',
        source: 'slack',
        workspaceId: 'T123',
        content: 'goodbye world',
        embedding
      }
    ];

    await store.upsert(items);

    const results = await store.ftsSearch('hello');

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('test-1');
    expect(results[0].content).toContain('hello');
  });

  it('should manage sync cursors', async () => {
    await store.setSyncCursor('slack', 'T123', 'cursor-value-1', 'C123');

    const cursor = await store.getSyncCursor('slack', 'T123', 'C123');
    expect(cursor).toBe('cursor-value-1');

    await store.setSyncCursor('slack', 'T123', 'cursor-value-2', 'C123');
    const updatedCursor = await store.getSyncCursor('slack', 'T123', 'C123');
    expect(updatedCursor).toBe('cursor-value-2');
  });

  it('should delete by source', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'slack message',
        embedding
      },
      {
        id: 'test-2',
        source: 'notion',
        workspaceId: 'T123',
        content: 'notion page',
        embedding
      }
    ];

    await store.upsert(items);

    const deleted = await store.deleteBySource('slack');
    expect(deleted).toBe(1);

    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(1);
    expect(stats.bySource['notion']).toBe(1);
    expect(stats.bySource['slack']).toBeUndefined();
  });

  it('should delete by source and workspace', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'workspace 1',
        embedding
      },
      {
        id: 'test-2',
        source: 'slack',
        workspaceId: 'T456',
        content: 'workspace 2',
        embedding
      }
    ];

    await store.upsert(items);

    const deleted = await store.deleteBySource('slack', 'T123');
    expect(deleted).toBe(1);

    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(1);
    expect(stats.byWorkspace['T456']).toBe(1);
  });

  it('should provide accurate stats', async () => {
    const embedding = new Float32Array(1536).fill(0.1);
    
    const items: VectorItem[] = [
      {
        id: 'test-1',
        source: 'slack',
        workspaceId: 'T123',
        content: 'slack message',
        embedding
      },
      {
        id: 'test-2',
        source: 'notion',
        workspaceId: 'T123',
        content: 'notion page',
        embedding
      },
      {
        id: 'test-3',
        source: 'slack',
        workspaceId: 'T456',
        content: 'another slack',
        embedding
      }
    ];

    await store.upsert(items);

    const stats = await store.getStats();
    expect(stats.totalDocuments).toBe(3);
    expect(stats.totalEmbeddings).toBe(3);
    expect(stats.bySource['slack']).toBe(2);
    expect(stats.bySource['notion']).toBe(1);
    expect(stats.byWorkspace['T123']).toBe(2);
    expect(stats.byWorkspace['T456']).toBe(1);
  });
});
