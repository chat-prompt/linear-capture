/**
 * Notion Local Database Reader (Facade)
 *
 * Reads from Notion Desktop App's local SQLite cache for full-text search.
 * Falls back gracefully when Notion app is not installed.
 *
 * Database location:
 * - macOS: ~/Library/Application Support/Notion/notion.db
 * - Windows: %AppData%\Notion\notion.db
 */

import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import { logger } from './utils/logger';
import { getNotionDbPath } from './notion/notion-block-utils';
import { searchByTitle, searchByContent, findParentPage } from './notion/notion-search';
import { getPage as getPageFromDb, getPageContentPreview, getFullPageContent, getAllPagesForSync as getAllPagesFromDb } from './notion/notion-page-parser';

// Re-export types for backwards compatibility
export type { LocalNotionPage, LocalSearchResult, NotionLocalStatus } from './notion/types';
import type { LocalNotionPage, LocalSearchResult, NotionLocalStatus } from './notion/types';

/**
 * Check if Notion's local database exists and is accessible
 */
export function isNotionDbAvailable(): boolean {
  const dbPath = getNotionDbPath();
  if (!dbPath) return false;

  try {
    fs.accessSync(dbPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export class NotionLocalReader {
  private db: Database | null = null;
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private initPromise: Promise<boolean> | null = null;

  async initialize(): Promise<boolean> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    if (this.db) return true;

    const dbPath = getNotionDbPath();
    if (!dbPath) {
      logger.log('[NotionLocalReader] Platform not supported');
      return false;
    }

    if (!fs.existsSync(dbPath)) {
      logger.log('[NotionLocalReader] Notion database not found at:', dbPath);
      return false;
    }

    try {
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

      const buffer = fs.readFileSync(dbPath);
      this.db = new this.SQL.Database(new Uint8Array(buffer));

      logger.log('[NotionLocalReader] Database loaded successfully');
      return true;
    } catch (error) {
      logger.error('[NotionLocalReader] Failed to initialize:', error);
      this.db = null;
      return false;
    }
  }

  async searchPages(query: string, limit: number = 20): Promise<LocalSearchResult> {
    const initialized = await this.initialize();

    if (!initialized || !this.db) {
      return { success: false, pages: [], source: 'local', error: 'Database not available' };
    }

    try {
      const queryLower = query.toLowerCase();
      const results: LocalNotionPage[] = [];

      const titleMatches = searchByTitle(
        this.db, queryLower, limit,
        (pageId) => this.db ? getPageContentPreview(this.db, pageId) : null
      );
      results.push(...titleMatches);

      if (results.length < limit) {
        const contentMatches = searchByContent(
          this.db, queryLower, limit - results.length,
          new Set(results.map(r => r.id)),
          (blockId) => this.db ? findParentPage(this.db, blockId) : null
        );
        results.push(...contentMatches);
      }

      results.sort((a, b) =>
        new Date(b.lastEditedTime).getTime() - new Date(a.lastEditedTime).getTime()
      );

      return { success: true, pages: results.slice(0, limit), source: 'local', total: results.length };
    } catch (error) {
      logger.error('[NotionLocalReader] Search error:', error);
      return {
        success: false, pages: [], source: 'local',
        error: error instanceof Error ? error.message : 'Search failed'
      };
    }
  }

  async getPage(pageId: string): Promise<LocalNotionPage | null> {
    const initialized = await this.initialize();
    if (!initialized || !this.db) return null;
    return getPageFromDb(this.db, pageId);
  }

  getFullPageContent(pageId: string, maxChars: number = 2000): string {
    if (!this.db) return '';
    return getFullPageContent(this.db, pageId, maxChars);
  }

  async getAllPagesForSync(): Promise<Array<{
    id: string;
    title: string;
    content: string;
    lastEditedTime: string;
    url: string;
  }>> {
    const initialized = await this.initialize();
    if (!initialized || !this.db) return [];
    return getAllPagesFromDb(this.db);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
  }
}

// Singleton instance
let readerInstance: NotionLocalReader | null = null;

export function getNotionLocalReader(): NotionLocalReader {
  if (!readerInstance) {
    readerInstance = new NotionLocalReader();
  }
  return readerInstance;
}

export function closeNotionLocalReader(): void {
  if (readerInstance) {
    readerInstance.close();
    readerInstance = null;
  }
}

export async function getNotionLocalStatus(): Promise<NotionLocalStatus> {
  const available = isNotionDbAvailable();
  if (!available) {
    return { available: false, initialized: false, error: 'Database not accessible' };
  }

  try {
    const reader = getNotionLocalReader();
    const initialized = await reader.initialize();
    return {
      available: true,
      initialized,
      error: initialized ? undefined : 'Failed to initialize local reader'
    };
  } catch (error) {
    return {
      available: true,
      initialized: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
