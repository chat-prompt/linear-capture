/**
 * Notion Search Functions
 *
 * Title and content search against the local SQLite cache.
 * Used by NotionLocalReader as search delegates.
 */

import { Database } from 'sql.js';
import { logger } from '../utils/logger';
import { extractTitle, extractBlockText, formatNotionUrl, formatTimestamp } from './notion-block-utils';
import type { LocalNotionPage } from './types';

/**
 * Search pages by title match
 */
export function searchByTitle(
  db: Database,
  queryLower: string,
  limit: number,
  getPageContentPreview: (pageId: string) => string | null
): LocalNotionPage[] {
  const results: LocalNotionPage[] = [];

  try {
    const stmt = db.prepare(`
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
        const contentPreview = getPageContentPreview(row.id);

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
    logger.error('[NotionSearch] Title search error:', error);
  }

  return results;
}

/**
 * Search block content for matches, returning parent pages
 */
export function searchByContent(
  db: Database,
  queryLower: string,
  limit: number,
  excludeIds: Set<string>,
  findParentPage: (blockId: string) => { id: string; title: string; lastEditedTime: number | null } | null
): LocalNotionPage[] {
  const results: LocalNotionPage[] = [];
  const foundPageIds = new Set<string>();

  try {
    const stmt = db.prepare(`
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

      const pageInfo = findParentPage(row.parent_id);
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
    logger.error('[NotionSearch] Content search error:', error);
  }

  return results;
}

/**
 * Find the parent page of a block by traversing up the hierarchy
 */
export function findParentPage(db: Database, blockId: string, maxDepth: number = 10): {
  id: string;
  title: string;
  lastEditedTime: number | null;
} | null {
  let currentId = blockId;
  let depth = 0;

  while (depth < maxDepth) {
    try {
      const stmt = db.prepare(`
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
