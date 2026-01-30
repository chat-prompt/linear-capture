import { shell } from 'electron';
import { getDeviceId } from './settings-store';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';
const NOTION_REDIRECT_URI = 'https://linear-capture-ai.ny-4f1.workers.dev/notion/oauth-redirect';

export interface NotionConnectionStatus {
  connected: boolean;
  workspace?: {
    id: string;
    name: string;
    icon?: string;
  };
  user?: {
    id: string;
    name: string;
  };
}

export interface NotionCallbackResult {
  success: boolean;
  workspace?: {
    id: string;
    name: string;
    icon?: string;
  };
  user?: {
    id: string;
    name: string;
  };
  error?: string;
}

export interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  url: string;
  lastEditedTime: string;
  parentType: string;
}

export interface NotionSearchResult {
  success: boolean;
  pages?: NotionPage[];
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  error?: string;
}

export interface NotionPageContent {
  success: boolean;
  pageId?: string;
  content?: string;
  blockCount?: number;
  truncated?: boolean;
  error?: string;
}

export class NotionService {
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  async startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/notion/auth`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('redirect_uri', NOTION_REDIRECT_URI);

      const response = await fetch(url.toString());
      const data = await response.json() as { success: boolean; auth_url?: string; error?: string };

      if (!data.success || !data.auth_url) {
        return { success: false, error: data.error || 'Failed to get auth URL' };
      }

      await shell.openExternal(data.auth_url);
      return { success: true };
    } catch (error) {
      console.error('Notion OAuth start error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async handleCallback(code: string, state: string): Promise<NotionCallbackResult> {
    try {
      const response = await fetch(`${WORKER_URL}/notion/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          redirect_uri: NOTION_REDIRECT_URI,
          state,
        }),
      });

      const data = await response.json() as NotionCallbackResult;
      return data;
    } catch (error) {
      console.error('Notion callback error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConnectionStatus(): Promise<NotionConnectionStatus> {
    try {
      const url = new URL(`${WORKER_URL}/notion/status`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString());
      const data = await response.json() as {
        success: boolean;
        connected?: boolean;
        workspace?: { id: string; name: string; icon?: string };
        user?: { id: string; name: string };
        error?: string;
      };

      if (!data.success) {
        console.error('Notion status error:', data.error);
        return { connected: false };
      }

      return {
        connected: data.connected || false,
        workspace: data.workspace,
        user: data.user,
      };
    } catch (error) {
      console.error('Notion status error:', error);
      return { connected: false };
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/notion/disconnect`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString(), { method: 'DELETE' });
      const data = await response.json() as { success: boolean; error?: string };
      return data;
    } catch (error) {
      console.error('Notion disconnect error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async searchPages(query: string, pageSize?: number): Promise<NotionSearchResult> {
    try {
      const url = new URL(`${WORKER_URL}/notion/search`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('query', query);
      url.searchParams.set('filter', 'page');
      if (pageSize) {
        url.searchParams.set('page_size', pageSize.toString());
      }

      const response = await fetch(url.toString());
      const data = await response.json() as NotionSearchResult;
      return data;
    } catch (error) {
      console.error('Notion search error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getPageContent(pageId: string): Promise<NotionPageContent> {
    try {
      const url = new URL(`${WORKER_URL}/notion/blocks`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('page_id', pageId);

      const response = await fetch(url.toString());
      const data = await response.json() as NotionPageContent;
      return data;
    } catch (error) {
      console.error('Notion get content error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

let notionService: NotionService | null = null;

export function createNotionService(): NotionService {
  if (!notionService) {
    notionService = new NotionService();
  }
  return notionService;
}
