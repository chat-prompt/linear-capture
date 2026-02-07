/**
 * Notion Block Utility Functions
 *
 * Handles text extraction from Notion block properties,
 * URL formatting, and timestamp conversion.
 */

import * as path from 'path';
import * as electron from 'electron';

/**
 * Get the path to Notion's local SQLite database
 */
export function getNotionDbPath(): string {
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
 * Extract title from Notion's properties JSON format
 * Format: {"title": [["text"], ["more text", [["b"]]]]}
 */
export function extractTitle(properties: unknown): string {
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
export function extractBlockText(properties: unknown): string {
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
export function formatNotionUrl(id: string): string {
  const cleanId = id.replace(/-/g, '');
  return `https://notion.so/${cleanId}`;
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return new Date().toISOString();
  return new Date(timestamp).toISOString();
}
