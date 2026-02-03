import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { createNotionService, type NotionPage } from '../notion-client';

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

    const result = await this.notionService.searchPages(query, limit);

    if (!result.success || !result.pages) {
      return [];
    }

    return result.pages.map(page => this.toContextItem(page));
  }

  private toContextItem(page: NotionPage): ContextItem {
    return {
      id: page.id,
      content: page.matchContext || page.title,
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
