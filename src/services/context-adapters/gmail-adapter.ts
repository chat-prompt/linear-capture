import type { ContextAdapter, ContextItem, ContextSource } from '../../types/context-search';
import { createGmailService, type GmailMessage } from '../gmail-client';

export class GmailAdapter implements ContextAdapter {
  readonly source: ContextSource = 'gmail';
  private gmailService = createGmailService();

  async isConnected(): Promise<boolean> {
    const status = await this.gmailService.getConnectionStatus();
    return status.connected;
  }

  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    if (!query) {
      return [];
    }

    const result = await this.gmailService.searchEmails(query, limit);

    if (!result.success || !result.messages) {
      return [];
    }

    return result.messages.map(msg => this.toContextItem(msg));
  }

  private toContextItem(msg: GmailMessage): ContextItem {
    return {
      id: msg.id,
      content: msg.snippet,
      title: msg.subject,
      url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
      source: 'gmail',
      timestamp: new Date(msg.date).getTime(),
      metadata: {
        from: msg.from.email,
        fromName: msg.from.name,
        threadId: msg.threadId,
      },
    };
  }
}
