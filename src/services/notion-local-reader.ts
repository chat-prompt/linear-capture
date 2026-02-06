/**
 * Notion Local Database Reader
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
import * as electron from 'electron';
import initSqlJs, { Database } from 'sql.js';
import { logger } from './utils/logger';

export interface LocalNotionPage {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  spaceId: string;
  parentId?: string;
  /** Search match context (snippet of matched content) */
  matchContext?: string;
  /** Whether this result is from content search (vs title only) */
  isContentMatch?: boolean;
}

export interface LocalSearchResult {
  success: boolean;
  pages: LocalNotionPage[];
  /** Search source indicator */
  source: 'local' | 'api';
  /** Total count before limit */
  total?: number;
  error?: string;
}

export interface NotionLocalStatus {
  available: boolean;
  initialized: boolean;
  error?: string;
}

/**
 * Get the path to Notion's local SQLite database
 */
function getNotionDbPath(): string {
  const app = electron.app;
  if (!app || typeof app.getPath !== 'function') {
    return '';
  }
  if (process.platform === 'darwin') {
    return path.join(
      app.getPath('home'),
      'Library',
      'Application Support',
      'Notion',
      'notion.db'
    );
  } else if (process.platform === 'win32') {
    return path.join(
      app.getPath('appData'),
      'Notion',
      'notion.db'
    );
  }
  // Linux: Notion app not officially supported
  return '';
}

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

/**
 * Extract title from Notion's properties JSON format
 * Format: {"title": [["text"], ["more text", [["b"]]]]}
 */
function extractTitle(properties: unknown): string {
  if (!properties || typeof properties !== 'object') return '';
  
  const props = properties as Record<string, unknown>;
  const titleProp = props.title;
  
  if (!Array.isArray(titleProp)) return '';
  
  const texts: string[] = [];
  for (const item of titleProp) {
    if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
      texts.push(item[0]);
    }
  }
  
  return texts.join('');
}

/**
 * Extract plain text from block properties/content
 * Handles various Notion block formats
 */
function extractBlockText(properties: unknown): string {
  if (!properties || typeof properties !== 'object') return '';
  
  const props = properties as Record<string, unknown>;
  const texts: string[] = [];
  
  // Common text properties in Notion blocks
  const textKeys = ['title', 'caption', 'description'];
  
  for (const key of textKeys) {
    const prop = props[key];
    if (Array.isArray(prop)) {
      for (const item of prop) {
        if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
          texts.push(item[0]);
        }
      }
    }
  }
  
  return texts.join(' ');
}

/**
 * Convert Notion block ID to URL format
 */
function formatNotionUrl(id: string): string {
  // Remove dashes from UUID for URL format
  const cleanId = id.replace(/-/g, '');
  return `https://notion.so/${cleanId}`;
}

/**
 * Format timestamp to ISO string
 */
function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return new Date().toISOString();
  // Notion stores timestamps in milliseconds
  return new Date(timestamp).toISOString();
}

export class NotionLocalReader {
  private db: Database | null = null;
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private initPromise: Promise<boolean> | null = null;

  /**
   * Initialize sql.js and load the Notion database
   */
  async initialize(): Promise<boolean> {
    // Prevent multiple initialization attempts
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

       // Read database file
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

  /**
   * Search pages by title and content
   * @param query Search query string
   * @param limit Maximum number of results
   */
  async searchPages(query: string, limit: number = 20): Promise<LocalSearchResult> {
    const initialized = await this.initialize();
    
    if (!initialized || !this.db) {
      return {
        success: false,
        pages: [],
        source: 'local',
        error: 'Database not available'
      };
    }

    try {
      const queryLower = query.toLowerCase();
      const results: LocalNotionPage[] = [];
      
      // First, search page titles
      const titleMatches = this.searchByTitle(queryLower, limit);
      results.push(...titleMatches);

      // If we need more results, search block content
      if (results.length < limit) {
        const contentMatches = await this.searchByContent(
          queryLower, 
          limit - results.length,
          new Set(results.map(r => r.id))
        );
        results.push(...contentMatches);
      }

      // Sort by last edited time (most recent first)
      results.sort((a, b) => 
        new Date(b.lastEditedTime).getTime() - new Date(a.lastEditedTime).getTime()
      );

      return {
        success: true,
        pages: results.slice(0, limit),
        source: 'local',
        total: results.length
      };
    } catch (error) {
      logger.error('[NotionLocalReader] Search error:', error);
      return {
        success: false,
        pages: [],
        source: 'local',
        error: error instanceof Error ? error.message : 'Search failed'
      };
    }
  }

  /**
   * Search pages by title
   */
  private searchByTitle(queryLower: string, limit: number): LocalNotionPage[] {
    if (!this.db) return [];

    const results: LocalNotionPage[] = [];
    
    try {
      // Query all pages
      const stmt = this.db.prepare(`
        SELECT id, space_id, properties, last_edited_time, parent_id
        FROM block
        WHERE type = 'page' AND alive = 1
        ORDER BY last_edited_time DESC
      `);

      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          id: string;
          space_id: string;
          properties: string | null;
          last_edited_time: number | null;
          parent_id: string | null;
        };

        let properties: unknown = null;
        try {
          properties = row.properties ? JSON.parse(row.properties) : null;
        } catch {
          continue;
        }

        const title = extractTitle(properties);
        if (!title) continue;

        if (title.toLowerCase().includes(queryLower)) {
          const contentPreview = this.getPageContentPreview(row.id);
          
          results.push({
            id: row.id,
            title,
            url: formatNotionUrl(row.id),
            lastEditedTime: formatTimestamp(row.last_edited_time),
            spaceId: row.space_id,
            parentId: row.parent_id || undefined,
            matchContext: contentPreview || undefined,
            isContentMatch: false
          });

          if (results.length >= limit) break;
        }
      }

       stmt.free();
     } catch (error) {
       logger.error('[NotionLocalReader] Title search error:', error);
     }

     return results;
  }

  private getPageContentPreview(pageId: string, maxChars: number = 200): string | null {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT properties
        FROM block
        WHERE parent_id = ?
          AND parent_table = 'block'
          AND type IN ('text', 'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout', 'header', 'sub_header', 'sub_sub_header')
          AND alive = 1
        LIMIT 10
      `);
      stmt.bind([pageId]);

      const texts: string[] = [];
      let totalLength = 0;

      while (stmt.step() && totalLength < maxChars) {
        const row = stmt.getAsObject() as { properties: string | null };
        
        if (row.properties) {
          try {
            const properties = JSON.parse(row.properties);
            const blockText = extractBlockText(properties);
            if (blockText) {
              texts.push(blockText);
              totalLength += blockText.length;
            }
          } catch {
            continue;
          }
        }
      }

      stmt.free();

      if (texts.length === 0) return null;

      let preview = texts.join(' ').trim();
      if (preview.length > maxChars) {
        preview = preview.substring(0, maxChars).trim() + '...';
      }

       return preview || null;
     } catch (error) {
       logger.error('[NotionLocalReader] getPageContentPreview error:', error);
       return null;
     }
  }

  /**
   * Search block content for matches
   * Returns the parent page of matching blocks
   */
  private async searchByContent(
    queryLower: string, 
    limit: number,
    excludeIds: Set<string>
  ): Promise<LocalNotionPage[]> {
    if (!this.db) return [];

    const results: LocalNotionPage[] = [];
    const foundPageIds = new Set<string>();

    try {
      // Search text blocks for content matches
      const stmt = this.db.prepare(`
        SELECT id, parent_id, parent_table, properties, space_id
        FROM block
        WHERE type IN ('text', 'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout', 'code')
          AND alive = 1
          AND parent_table = 'block'
      `);

      while (stmt.step()) {
        if (results.length >= limit) break;

        const row = stmt.getAsObject() as {
          id: string;
          parent_id: string;
          parent_table: string;
          properties: string | null;
          space_id: string;
        };

        let properties: unknown = null;
        try {
          properties = row.properties ? JSON.parse(row.properties) : null;
        } catch {
          continue;
        }

        const blockText = extractBlockText(properties);
        if (!blockText.toLowerCase().includes(queryLower)) continue;

        // Find the parent page
        const pageInfo = this.findParentPage(row.parent_id);
        if (!pageInfo || excludeIds.has(pageInfo.id) || foundPageIds.has(pageInfo.id)) {
          continue;
        }

        foundPageIds.add(pageInfo.id);

        // Create snippet around match
        const matchIndex = blockText.toLowerCase().indexOf(queryLower);
        const snippetStart = Math.max(0, matchIndex - 30);
        const snippetEnd = Math.min(blockText.length, matchIndex + queryLower.length + 30);
        let snippet = blockText.slice(snippetStart, snippetEnd);
        if (snippetStart > 0) snippet = '...' + snippet;
        if (snippetEnd < blockText.length) snippet = snippet + '...';

        results.push({
          id: pageInfo.id,
          title: pageInfo.title,
          url: formatNotionUrl(pageInfo.id),
          lastEditedTime: formatTimestamp(pageInfo.lastEditedTime),
          spaceId: row.space_id,
          matchContext: snippet,
          isContentMatch: true
        });
      }

       stmt.free();
     } catch (error) {
       logger.error('[NotionLocalReader] Content search error:', error);
     }

     return results;
  }

  /**
   * Find the parent page of a block by traversing up the hierarchy
   */
  private findParentPage(blockId: string, maxDepth: number = 10): {
    id: string;
    title: string;
    lastEditedTime: number | null;
  } | null {
    if (!this.db) return null;

    let currentId = blockId;
    let depth = 0;

    while (depth < maxDepth) {
      try {
        const stmt = this.db.prepare(`
          SELECT id, type, properties, parent_id, parent_table, last_edited_time
          FROM block
          WHERE id = ? AND alive = 1
        `);
        stmt.bind([currentId]);

        if (!stmt.step()) {
          stmt.free();
          return null;
        }

        const row = stmt.getAsObject() as {
          id: string;
          type: string;
          properties: string | null;
          parent_id: string | null;
          parent_table: string;
          last_edited_time: number | null;
        };
        stmt.free();

        if (row.type === 'page') {
          let properties: unknown = null;
          try {
            properties = row.properties ? JSON.parse(row.properties) : null;
          } catch {
            // ignore
          }

          return {
            id: row.id,
            title: extractTitle(properties) || 'Untitled',
            lastEditedTime: row.last_edited_time
          };
        }

        if (!row.parent_id || row.parent_table !== 'block') {
          return null;
        }

        currentId = row.parent_id;
        depth++;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string): Promise<LocalNotionPage | null> {
    const initialized = await this.initialize();
    if (!initialized || !this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT id, space_id, properties, last_edited_time, parent_id
        FROM block
        WHERE id = ? AND type = 'page' AND alive = 1
      `);
      stmt.bind([pageId]);

      if (!stmt.step()) {
        stmt.free();
        return null;
      }

      const row = stmt.getAsObject() as {
        id: string;
        space_id: string;
        properties: string | null;
        last_edited_time: number | null;
        parent_id: string | null;
      };
      stmt.free();

      let properties: unknown = null;
      try {
        properties = row.properties ? JSON.parse(row.properties) : null;
      } catch {
        // ignore
      }

      return {
        id: row.id,
        title: extractTitle(properties) || 'Untitled',
        url: formatNotionUrl(row.id),
        lastEditedTime: formatTimestamp(row.last_edited_time),
        spaceId: row.space_id,
        parentId: row.parent_id || undefined
      };
     } catch (error) {
       logger.error('[NotionLocalReader] getPage error:', error);
       return null;
     }
   }

  /**
   * Get full page content without character limit (for sync)
   * Recursively fetches all child blocks
   */
  getFullPageContent(pageId: string): string {
    if (!this.db) return '';

    try {
      const texts: string[] = [];
      this.collectBlockTexts(pageId, texts, 0);
      return texts.join('\n').trim();
    } catch (error) {
      logger.error('[NotionLocalReader] getFullPageContent error:', error);
      return '';
    }
  }

  /**
   * Recursively collect text from blocks and their children
   */
  private collectBlockTexts(parentId: string, texts: string[], depth: number): void {
    if (!this.db || depth > 10) return; // Max depth to prevent infinite loops

    try {
      const stmt = this.db.prepare(`
        SELECT id, properties, type
        FROM block
        WHERE parent_id = ?
          AND parent_table = 'block'
          AND type IN ('text', 'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout', 'header', 'sub_header', 'sub_sub_header', 'code', 'page')
          AND alive = 1
        ORDER BY created_time ASC
      `);
      stmt.bind([parentId]);

      const childBlocks: Array<{ id: string; type: string }> = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          id: string;
          properties: string | null;
          type: string;
        };

        if (row.properties) {
          try {
            const properties = JSON.parse(row.properties);
            const blockText = extractBlockText(properties);
            if (blockText) {
              texts.push(blockText);
            }
          } catch {
            continue;
          }
        }

        if (row.type !== 'page') {
          childBlocks.push({ id: row.id, type: row.type });
        }
      }
      stmt.free();

      for (const child of childBlocks) {
        this.collectBlockTexts(child.id, texts, depth + 1);
      }
    } catch (error) {
      logger.error('[NotionLocalReader] collectBlockTexts error:', error);
    }
  }

  /**
   * Get all pages with their full content for sync
   * Returns pages sorted by last_edited_time (newest first)
   */
  async getAllPagesForSync(): Promise<Array<{
    id: string;
    title: string;
    content: string;
    lastEditedTime: string;
    url: string;
  }>> {
    const initialized = await this.initialize();
    if (!initialized || !this.db) return [];

    const results: Array<{
      id: string;
      title: string;
      content: string;
      lastEditedTime: string;
      url: string;
    }> = [];

    try {
      const stmt = this.db.prepare(`
        SELECT id, properties, last_edited_time
        FROM block
        WHERE type = 'page' AND alive = 1
        ORDER BY last_edited_time DESC
      `);

      const pages: Array<{
        id: string;
        title: string;
        lastEditedTime: number | null;
      }> = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          id: string;
          properties: string | null;
          last_edited_time: number | null;
        };

        let properties: unknown = null;
        try {
          properties = row.properties ? JSON.parse(row.properties) : null;
        } catch {
          continue;
        }

        const title = extractTitle(properties);
        if (!title) continue;

        pages.push({
          id: row.id,
          title,
          lastEditedTime: row.last_edited_time
        });
      }
      stmt.free();

      logger.log(`[NotionLocalReader] Found ${pages.length} pages for sync`);

      for (const page of pages) {
        const content = this.getFullPageContent(page.id);
        results.push({
          id: page.id,
          title: page.title,
          content,
          lastEditedTime: formatTimestamp(page.lastEditedTime),
          url: formatNotionUrl(page.id)
        });
      }

      return results;
    } catch (error) {
      logger.error('[NotionLocalReader] getAllPagesForSync error:', error);
      return [];
    }
  }

  /**
   * Close the database connection
   */
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

/**
 * Clean up resources on app quit
 */
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
