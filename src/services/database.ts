/**
 * DatabaseService - Local PostgreSQL database using PGlite + pgvector
 *
 * Provides local storage for documents with vector embeddings and full-text search.
 * Initializes in Electron main process only.
 */

import { PGlite } from '@electric-sql/pglite';
import { app } from 'electron';
import * as path from 'path';

// @ts-ignore - PGlite vector extension (moduleResolution issue)
import { vector } from '@electric-sql/pglite/vector';

export interface Document {
  id: string;
  source_type: 'notion' | 'slack' | 'linear';
  source_id: string;
  parent_id?: string;
  title?: string;
  content: string;
  content_hash?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  source_created_at?: Date;
  source_updated_at?: Date;
  indexed_at?: Date;
}

export interface SyncCursor {
  source_type: string;
  cursor_value?: string;
  cursor_type?: 'timestamp' | 'id' | 'page_token';
  last_synced_at?: Date;
  items_synced?: number;
  status?: 'idle' | 'syncing' | 'error';
}

export interface Source {
  source_type: string;
  connected: boolean;
  connection_info?: Record<string, any>;
  connected_at?: Date;
}

/**
 * DatabaseService - Singleton service for local PostgreSQL database
 */
export class DatabaseService {
  private db: PGlite | null = null;
  private initPromise: Promise<void> | null = null;
  private dbPath: string;

  constructor() {
    // Use app.getPath('userData') for cross-platform support
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'local.db');
  }

  /**
   * Initialize database with pgvector extension and schema
   */
  async init(): Promise<void> {
    // Prevent multiple initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      console.log('[DatabaseService] Initializing PGlite at:', this.dbPath);

      // Initialize PGlite with pgvector extension
      this.db = new PGlite(this.dbPath, {
        extensions: { vector },
      });

      // Wait for database to be ready
      await this.db.waitReady;

      console.log('[DatabaseService] PGlite ready, loading pgvector extension');

      // Enable pgvector extension
      await this.db.exec('CREATE EXTENSION IF NOT EXISTS vector');

      console.log('[DatabaseService] Running migrations');

      // Run schema migrations
      await this.runMigrations();

      console.log('[DatabaseService] Database initialized successfully');
    } catch (error) {
      console.error('[DatabaseService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Run database schema migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Check current schema version
    const versionResult = await this.db
      .query<{ version: number }>('SELECT version FROM schema_version LIMIT 1')
      .catch(() => ({ rows: [] as Array<{ version: number }> }));

    const currentVersion = versionResult.rows[0]?.version ?? 0;

    // Migration 1: Initial schema
    if (currentVersion < 1) {
      console.log('[DatabaseService] Running migration 1: Initial schema');

      await this.db.exec(`
        -- Schema version tracking
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
        );

        -- Documents table with vector embeddings and FTS
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          parent_id TEXT,
          title TEXT,
          content TEXT NOT NULL,
          content_hash TEXT,
          embedding vector(1536),
          tsv tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('simple', content), 'B')
          ) STORED,
          metadata JSONB,
          source_created_at TIMESTAMPTZ,
          source_updated_at TIMESTAMPTZ,
          indexed_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(source_type, source_id)
        );

        -- Vector index (HNSW for better performance)
        CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents 
          USING hnsw (embedding vector_cosine_ops);

        -- Full-text search index
        CREATE INDEX IF NOT EXISTS idx_documents_tsv ON documents USING gin(tsv);

        -- Source lookup index
        CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_type, source_updated_at);

        -- Sync cursors table
        CREATE TABLE IF NOT EXISTS sync_cursors (
          source_type TEXT PRIMARY KEY,
          cursor_value TEXT,
          cursor_type TEXT,
          last_synced_at TIMESTAMPTZ DEFAULT NOW(),
          items_synced INTEGER DEFAULT 0,
          status TEXT DEFAULT 'idle'
        );

        -- Sources table
        CREATE TABLE IF NOT EXISTS sources (
          source_type TEXT PRIMARY KEY,
          connected BOOLEAN DEFAULT FALSE,
          connection_info JSONB,
          connected_at TIMESTAMPTZ
        );

        -- Insert initial version
        INSERT INTO schema_version (version) VALUES (1)
          ON CONFLICT (version) DO NOTHING;
      `);

      console.log('[DatabaseService] Migration 1 complete');
    }

    // Future migrations go here
    // if (currentVersion < 2) { ... }
  }

  /**
   * Get the PGlite instance
   * @throws Error if database not initialized
   */
  getDb(): PGlite {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      console.log('[DatabaseService] Closing database');
      await this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Get database file path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

// Singleton instance
let databaseService: DatabaseService | null = null;

/**
 * Get singleton DatabaseService instance
 */
export function getDatabaseService(): DatabaseService {
  if (!databaseService) {
    databaseService = new DatabaseService();
  }
  return databaseService;
}

/**
 * Initialize database service
 * Should be called in app.on('ready') hook
 */
export async function initDatabaseService(): Promise<void> {
  const service = getDatabaseService();
  await service.init();
}

/**
 * Close database service
 * Should be called in app.on('before-quit') hook
 */
export async function closeDatabaseService(): Promise<void> {
  if (databaseService) {
    await databaseService.close();
    databaseService = null;
  }
}
