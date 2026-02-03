import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { getDatabaseService } from '../database';

export class SlackAdapter implements ContextAdapter {
  readonly source: ContextSource = 'slack';

  async isConnected(): Promise<boolean> {
    try {
      const db = getDatabaseService();
      if (!db.isInitialized()) {
        return false;
      }

      const result = await db.getDb().query<{ connected: boolean }>(
        'SELECT connected FROM sources WHERE source_type = $1',
        ['slack']
      );

      return result.rows.length > 0 && result.rows[0].connected;
    } catch (error) {
      console.error('[SlackAdapter] isConnected failed:', error);
      return false;
    }
  }

  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    try {
      const db = getDatabaseService();
      if (!db.isInitialized()) {
        return [];
      }

      const result = await db.getDb().query<{
        source_id: string;
        title: string;
        content: string;
        metadata: any;
        source_created_at: Date;
      }>(
        `
        SELECT source_id, title, content, metadata, source_created_at
        FROM documents
        WHERE source_type = $1
        ORDER BY source_updated_at DESC
        LIMIT $2
        `,
        ['slack', limit]
      );

      return result.rows.map(row => ({
        id: row.source_id,
        content: row.content,
        title: row.title || 'Untitled',
        url: row.metadata?.url,
        source: 'slack' as ContextSource,
        timestamp: row.source_created_at?.getTime(),
        metadata: row.metadata,
      }));
    } catch (error) {
      console.error('[SlackAdapter] fetchItems failed:', error);
      return [];
    }
  }

  // OLD: Slack API-based implementation (removed)
  /*
  import { createSlackService, type SlackMessage } from '../slack-client';
  
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
  */
}
