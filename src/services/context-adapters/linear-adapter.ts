import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { createLinearServiceFromEnv } from '../linear-client';

export class LinearAdapter implements ContextAdapter {
  readonly source: ContextSource = 'linear';

  async isConnected(): Promise<boolean> {
    const service = createLinearServiceFromEnv();
    return service !== null;
  }

  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    if (!query) {
      return [];
    }

    const service = createLinearServiceFromEnv();
    if (!service) {
      return [];
    }

    const result = await service.searchIssues(query, limit);

    if (!result.success || !result.issues) {
      return [];
    }

    return result.issues.map(issue => this.toContextItem(issue));
  }

  private toContextItem(issue: { id: string; identifier: string; title: string; url: string; description?: string }): ContextItem {
    return {
      id: issue.id,
      content: issue.description || issue.title,
      title: `${issue.identifier}: ${issue.title}`,
      url: issue.url,
      source: 'linear',
      metadata: {
        identifier: issue.identifier,
      },
    };
  }
}
