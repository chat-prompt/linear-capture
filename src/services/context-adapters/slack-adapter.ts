import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { createSlackService, type SlackMessage } from '../slack-client';

export class SlackAdapter implements ContextAdapter {
  readonly source: ContextSource = 'slack';
  private slackService = createSlackService();

  async isConnected(): Promise<boolean> {
    const status = await this.slackService.getConnectionStatus();
    return status.connected;
  }

  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    if (!query) {
      return [];
    }

    const result = await this.slackService.searchMessages(query, undefined, limit);
    
    if (!result.success || !result.messages) {
      return [];
    }

    return result.messages.map(msg => this.toContextItem(msg));
  }

  private toContextItem(msg: SlackMessage): ContextItem {
    return {
      id: msg.ts,
      content: msg.text,
      title: `#${msg.channel.name} - ${msg.username || msg.user}`,
      url: msg.permalink,
      source: 'slack',
      timestamp: new Date(msg.timestamp).getTime(),
      metadata: {
        channelId: msg.channel.id,
        channelName: msg.channel.name,
        userId: msg.user,
        username: msg.username || '',
      },
    };
  }
}
