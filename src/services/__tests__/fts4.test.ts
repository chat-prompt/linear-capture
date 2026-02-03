import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

describe('FTS4 Availability', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  let db: Database;

  beforeAll(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  it('should initialize sql.js successfully', () => {
    expect(SQL).toBeDefined();
    expect(db).toBeDefined();
  });

  it('should create FTS4 virtual table', () => {
    expect(() => {
      db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS test_fts USING fts4(
          content,
          title
        )
      `);
    }).not.toThrow();

    const result = db.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='test_fts'
    `);
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('test_fts');
  });

  it('should insert and search with FTS4 MATCH', () => {
    db.run(`INSERT INTO test_fts (content, title) VALUES (?, ?)`, [
      'This is a test message about authentication errors',
      'Auth Bug Report'
    ]);
    db.run(`INSERT INTO test_fts (content, title) VALUES (?, ?)`, [
      'User login flow needs improvement',
      'Login Feature Request'
    ]);
    db.run(`INSERT INTO test_fts (content, title) VALUES (?, ?)`, [
      'Database connection timeout issues',
      'DB Performance'
    ]);

    const searchResult = db.exec(`
      SELECT title, content FROM test_fts 
      WHERE test_fts MATCH 'authentication'
    `);

    expect(searchResult.length).toBe(1);
    expect(searchResult[0].values.length).toBe(1);
    expect(searchResult[0].values[0][0]).toBe('Auth Bug Report');
  });

  it('should support FTS4 OR queries', () => {
    const orResult = db.exec(`
      SELECT title FROM test_fts 
      WHERE test_fts MATCH 'login OR authentication'
      ORDER BY title
    `);

    expect(orResult.length).toBe(1);
    expect(orResult[0].values.length).toBe(2);
  });

  it('should support FTS4 with external content table', () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        content TEXT,
        title TEXT
      )
    `);

    expect(() => {
      db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts4(
          content,
          title,
          content='documents'
        )
      `);
    }).not.toThrow();

    db.run(`INSERT INTO documents (id, content, title) VALUES (1, 'test content', 'test title')`);
    db.run(`INSERT INTO documents_fts (docid, content, title) VALUES (1, 'test content', 'test title')`);

    const result = db.exec(`
      SELECT docid, title FROM documents_fts WHERE documents_fts MATCH 'test'
    `);
    expect(result[0].values.length).toBe(1);
  });

  it('should support FTS4 triggers for auto-sync', () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS sync_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        title TEXT
      )
    `);

    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS sync_docs_fts USING fts4(
        content,
        title,
        content='sync_docs'
      )
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS sync_docs_ai AFTER INSERT ON sync_docs BEGIN
        INSERT INTO sync_docs_fts (docid, content, title) 
        VALUES (new.id, new.content, new.title);
      END
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS sync_docs_ad AFTER DELETE ON sync_docs BEGIN
        DELETE FROM sync_docs_fts WHERE docid = old.id;
      END
    `);

    db.run(`INSERT INTO sync_docs (content, title) VALUES ('auto synced content', 'Auto Title')`);

    const result = db.exec(`
      SELECT title FROM sync_docs_fts WHERE sync_docs_fts MATCH 'synced'
    `);
    expect(result[0].values.length).toBe(1);
    expect(result[0].values[0][0]).toBe('Auto Title');
  });
});
