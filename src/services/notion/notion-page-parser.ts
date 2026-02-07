/**
 * Notion Page Parser
 *
 * Extracts page data and content from Notion's local SQLite cache.
 * Handles single page retrieval, content preview, and full-page content collection.
 */

import { Database } from 'sql.js';
import { logger } from '../utils/logger';
import { extractTitle, extractBlockText, formatNotionUrl, formatTimestamp } from './notion-block-utils';
import type { LocalNotionPage } from './types';

/**
 * Get a specific page by ID
 */
export function getPage(db: Database, pageId: string): LocalNotionPage | null {
  try {
    const stmt = db.prepare(`
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
    logger.error('[NotionPageParser] getPage error:', error);
    return null;
  }
}

/**
 * Get a short content preview for a page (first few child blocks)
 */
export function getPageContentPreview(db: Database, pageId: string, maxChars: number = 200): string | null {
  try {
    const stmt = db.prepare(`
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
    logger.error('[NotionPageParser] getPageContentPreview error:', error);
    return null;
  }
}

/**
 * Get full page content with optional character limit.
 * Recursively fetches child blocks.
 */
export function getFullPageContent(db: Database, pageId: string, maxChars: number = 2000): string {
  try {
    const texts: string[] = [];
    const charCount = { current: 0 };
    collectBlockTexts(db, pageId, texts, 0, maxChars, charCount);
    const result = texts.join('\n').trim();
    return result.length > maxChars ? result.substring(0, maxChars) : result;
  } catch (error) {
    logger.error('[NotionPageParser] getFullPageContent error:', error);
    return '';
  }
}

/**
 * Recursively collect text from blocks and their children
 */
function collectBlockTexts(
  db: Database,
  parentId: string,
  texts: string[],
  depth: number,
  maxChars: number = 2000,
  charCount: { current: number } = { current: 0 }
): void {
  if (depth > 10) return; // Max depth to prevent infinite loops
  if (charCount.current >= maxChars) return;

  try {
    const stmt = db.prepare(`
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
      if (charCount.current >= maxChars) break;

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
            charCount.current += blockText.length;
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
      if (charCount.current >= maxChars) break;
      collectBlockTexts(db, child.id, texts, depth + 1, maxChars, charCount);
    }
  } catch (error) {
    logger.error('[NotionPageParser] collectBlockTexts error:', error);
  }
}

/**
 * Get all pages with their full content for sync.
 * Returns pages sorted by last_edited_time (newest first).
 */
export function getAllPagesForSync(db: Database): Array<{
  id: string;
  title: string;
  content: string;
  lastEditedTime: string;
  url: string;
}> {
  const results: Array<{
    id: string;
    title: string;
    content: string;
    lastEditedTime: string;
    url: string;
  }> = [];

  try {
    const stmt = db.prepare(`
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

    logger.log(`[NotionPageParser] Found ${pages.length} pages for sync`);

    for (const page of pages) {
      const content = getFullPageContent(db, page.id);
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
    logger.error('[NotionPageParser] getAllPagesForSync error:', error);
    return [];
  }
}
