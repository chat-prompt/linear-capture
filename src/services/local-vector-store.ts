import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app } from 'electron';
import initSqlJs, { Database } from 'sql.js';
import type { ContextSource } from '../types/context-search';
import { logger } from './utils/logger';

export interface VectorDocument {
  id: string;
  source: ContextSource;
  workspaceId: string;
  content: string;
  title?: string;
  url?: string;
  timestamp?: number;
  contentHash?: string;
}

export interface VectorItem extends VectorDocument {
  embedding: Float32Array;  // 1536 dims
}

export interface SearchResult extends VectorDocument {
  score: number;
}

export interface SearchOptions {
  source?: ContextSource;
  workspaceId?: string;
  limit?: number;
  minScore?: number;
}

export interface VectorStoreStats {
  totalDocuments: number;
  totalEmbeddings: number;
  bySource: Record<string, number>;
  byWorkspace: Record<string, number>;
}

export class LocalVectorStore {
  private db: Database | null = null;
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private initPromise: Promise<boolean> | null = null;
  private dbPath: string;

  constructor(dbName = 'vector-store.db') {
    this.dbPath = path.join(app.getPath('userData'), dbName);
  }

  async initialize(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

   private async _doInitialize(): Promise<boolean> {
     try {
       logger.log('[LocalVectorStore] Initializing database at:', this.dbPath);

      // Copy locateFile pattern from notion-local-reader.ts
      this.SQL = await initSqlJs({
        locateFile: (file: string) => {
          const basePath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file);
          
          if (fs.existsSync(basePath)) {
            return basePath;
          }
          
          const unpackedPath = basePath.replace('app.asar', 'app.asar.unpacked');
          if (fs.existsSync(unpackedPath)) {
            return unpackedPath;
          }
          
          return file;
        }
      });

       // Load or create database
       if (fs.existsSync(this.dbPath)) {
         const buffer = fs.readFileSync(this.dbPath);
         this.db = new this.SQL.Database(new Uint8Array(buffer));
         logger.log('[LocalVectorStore] Existing database loaded');
       } else {
         this.db = new this.SQL.Database();
         logger.log('[LocalVectorStore] New database created');
       }

      // Create schema
      this.db.run(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          content_hash TEXT,
          content TEXT NOT NULL,
          title TEXT,
          url TEXT,
          timestamp INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(source, workspace_id, content_hash)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS embeddings (
          doc_id TEXT PRIMARY KEY REFERENCES documents(id),
          vector BLOB NOT NULL,
          model_id TEXT DEFAULT 'openai-3-small',
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS sync_cursors (
          source TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          channel_id TEXT,
          cursor_value TEXT,
          last_sync INTEGER,
          PRIMARY KEY (source, workspace_id, channel_id)
        )
      `);

      // Create indexes
      this.db.run('CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_documents_timestamp ON documents(timestamp DESC)');

      // Create FTS4 virtual table
      this.db.run('CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts4(content, title, content="documents")');

      // Create triggers for FTS4 sync
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
          INSERT INTO documents_fts(docid, content, title) VALUES (new.rowid, new.content, new.title);
        END
      `);

      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
          DELETE FROM documents_fts WHERE docid = old.rowid;
        END
      `);

       // Persist to disk
       this._saveToDisk();

       logger.log('[LocalVectorStore] Database initialized successfully');
       return true;
     } catch (error) {
       logger.error('[LocalVectorStore] Failed to initialize:', error);
       this.db = null;
       return false;
     }
  }

  private _saveToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, data);
  }

  private _computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  async upsert(items: VectorItem[]): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    let count = 0;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, source, workspace_id, content_hash, content, title, url, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const embStmt = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (doc_id, vector, model_id)
      VALUES (?, ?, ?)
    `);

    try {
      for (const item of items) {
        const contentHash = item.contentHash || this._computeContentHash(item.content);
        
        stmt.run([
          item.id,
          item.source,
          item.workspaceId,
          contentHash,
          item.content,
          item.title || null,
          item.url || null,
          item.timestamp || null
        ]);

        // Store embedding as BLOB
        const buffer = Buffer.from(item.embedding.buffer);
        embStmt.run([item.id, buffer, 'openai-3-small']);
        
        count++;
      }

       this._saveToDisk();
       logger.log(`[LocalVectorStore] Upserted ${count} items`);
       return count;
    } finally {
      stmt.free();
      embStmt.free();
    }
  }

  async vectorSearch(embedding: Float32Array, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const { source, workspaceId, limit = 10, minScore = 0.0 } = options;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (source) {
      conditions.push('d.source = ?');
      params.push(source);
    }
    if (workspaceId) {
      conditions.push('d.workspace_id = ?');
      params.push(workspaceId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Load all embeddings for the filtered documents
    const query = `
      SELECT d.*, e.vector
      FROM documents d
      JOIN embeddings e ON d.id = e.doc_id
      ${whereClause}
    `;

    const stmt = this.db.prepare(query);
    stmt.bind(params);

    const results: SearchResult[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const vectorBlob = row.vector as Uint8Array;
      const docEmbedding = new Float32Array(vectorBlob.buffer, vectorBlob.byteOffset, vectorBlob.byteLength / 4);

      const score = this._cosineSimilarity(embedding, docEmbedding);

      if (score >= minScore) {
        results.push({
          id: row.id as string,
          source: row.source as ContextSource,
          workspaceId: row.workspace_id as string,
          content: row.content as string,
          title: row.title as string | undefined,
          url: row.url as string | undefined,
          timestamp: row.timestamp as number | undefined,
          contentHash: row.content_hash as string | undefined,
          score
        });
      }
    }

    stmt.free();

    // Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async ftsSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const { source, workspaceId, limit = 10 } = options;

    // Build WHERE clause
    const conditions: string[] = ['documents_fts MATCH ?'];
    const params: any[] = [query];

    if (source) {
      conditions.push('d.source = ?');
      params.push(source);
    }
    if (workspaceId) {
      conditions.push('d.workspace_id = ?');
      params.push(workspaceId);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT d.*
      FROM documents_fts
      JOIN documents d ON documents_fts.docid = d.rowid
      WHERE ${whereClause}
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    stmt.bind([...params, limit]);

    const results: SearchResult[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        source: row.source as ContextSource,
        workspaceId: row.workspace_id as string,
        content: row.content as string,
        title: row.title as string | undefined,
        url: row.url as string | undefined,
        timestamp: row.timestamp as number | undefined,
        contentHash: row.content_hash as string | undefined,
        score: 1.0 // FTS4 doesn't provide normalized scores
      });
    }

    stmt.free();
    return results;
  }

  async getSyncCursor(source: ContextSource, workspaceId: string, channelId?: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT cursor_value FROM sync_cursors
      WHERE source = ? AND workspace_id = ? AND channel_id IS ?
    `);

    stmt.bind([source, workspaceId, channelId || null]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row.cursor_value as string;
    }

    stmt.free();
    return null;
  }

  async setSyncCursor(source: ContextSource, workspaceId: string, cursorValue: string, channelId?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sync_cursors (source, workspace_id, channel_id, cursor_value, last_sync)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run([source, workspaceId, channelId || null, cursorValue]);
    stmt.free();

    this._saveToDisk();
  }

  async deleteBySource(source: ContextSource, workspaceId?: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const conditions = ['source = ?'];
    const params: any[] = [source];

    if (workspaceId) {
      conditions.push('workspace_id = ?');
      params.push(workspaceId);
    }

    const whereClause = conditions.join(' AND ');

    this.db.run(`
      DELETE FROM embeddings WHERE doc_id IN (
        SELECT id FROM documents WHERE ${whereClause}
      )
    `, params);

    const stmt = this.db.prepare(`DELETE FROM documents WHERE ${whereClause}`);
    stmt.run(params);
    const changes = this.db.getRowsModified();
    stmt.free();

     this._saveToDisk();
     logger.log(`[LocalVectorStore] Deleted ${changes} documents from ${source}`);
     return changes;
  }

  async getStats(): Promise<VectorStoreStats> {
    if (!this.db) throw new Error('Database not initialized');

    const totalDocs = this.db.exec('SELECT COUNT(*) as count FROM documents')[0]?.values[0][0] as number || 0;
    const totalEmbs = this.db.exec('SELECT COUNT(*) as count FROM embeddings')[0]?.values[0][0] as number || 0;

    const bySourceRows = this.db.exec('SELECT source, COUNT(*) as count FROM documents GROUP BY source');
    const bySource: Record<string, number> = {};
    if (bySourceRows.length > 0) {
      for (const row of bySourceRows[0].values) {
        bySource[row[0] as string] = row[1] as number;
      }
    }

    const byWorkspaceRows = this.db.exec('SELECT workspace_id, COUNT(*) as count FROM documents GROUP BY workspace_id');
    const byWorkspace: Record<string, number> = {};
    if (byWorkspaceRows.length > 0) {
      for (const row of byWorkspaceRows[0].values) {
        byWorkspace[row[0] as string] = row[1] as number;
      }
    }

    return {
      totalDocuments: totalDocs,
      totalEmbeddings: totalEmbs,
      bySource,
      byWorkspace
    };
  }

   close(): void {
     if (this.db) {
       this._saveToDisk();
       this.db.close();
       this.db = null;
       logger.log('[LocalVectorStore] Database closed');
     }
   }

  private _cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}
