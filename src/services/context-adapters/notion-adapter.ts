import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { createNotionService, type NotionPage } from '../notion-client';
import { isNotionDbAvailable, getNotionLocalReader, type LocalNotionPage } from '../notion-local-reader';
import { logger } from '../utils/logger';

export class NotionAdapter implements ContextAdapter {
  readonly source: ContextSource = 'notion';
  private notionService = createNotionService();

  async isConnected(): Promise<boolean> {
    const status = await this.notionService.getConnectionStatus();
    return status.connected;
  }

  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    if (!query) {
      return [];
    }

    // 로컬 캐시 우선 (Notion Desktop App의 SQLite DB)
    if (isNotionDbAvailable()) {
      try {
         const localReader = getNotionLocalReader();
         const localResult = await localReader.searchPages(query, limit);
         if (localResult.success && localResult.pages.length > 0) {
           logger.log('[NotionAdapter] Using local cache:', localResult.pages.length, 'results');
           return localResult.pages.map(page => this.localPageToContextItem(page));
         }
       } catch (error) {
         logger.error('[NotionAdapter] Local cache error, falling back to API:', error);
       }
    }

    // API 폴백
    const result = await this.notionService.searchPages(query, limit);

    if (!result.success || !result.pages) {
      return [];
    }

    return result.pages.map(page => this.toContextItem(page));
  }

  private localPageToContextItem(page: LocalNotionPage): ContextItem {
    return {
      id: page.id,
      content: page.matchContext || page.title || '',
      title: page.title,
      url: page.url,
      source: 'notion',
      timestamp: new Date(page.lastEditedTime).getTime(),
      metadata: {
        isContentMatch: page.isContentMatch || false,
      },
    };
  }

  private toContextItem(page: NotionPage): ContextItem {
    return {
      id: page.id,
      content: page.matchContext || page.title || '',
      title: page.title,
      url: page.url,
      source: 'notion',
      timestamp: new Date(page.lastEditedTime).getTime(),
      metadata: {
        isContentMatch: page.isContentMatch || false,
      },
    };
  }
}
