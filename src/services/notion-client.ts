import { shell } from 'electron';
import { getDeviceId } from './settings-store';
import { 
   getNotionLocalReader, 
   isNotionDbAvailable, 
   closeNotionLocalReader,
   type LocalNotionPage 
 } from './notion-local-reader';
import { logger } from './utils/logger';

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
  /** Context snippet for content matches (local search only) */
  matchContext?: string;
  /** Whether this result is from content search vs title only */
  isContentMatch?: boolean;
}

export interface NotionSearchResult {
  success: boolean;
  pages?: NotionPage[];
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  error?: string;
  /** Search source: 'local' (full-text) or 'api' (title only) */
  source?: 'local' | 'api';
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
       logger.error('Notion OAuth start error:', error);
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
       logger.error('Notion callback error:', error);
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
         logger.error('Notion status error:', data.error);
         return { connected: false };
       }

       return {
         connected: data.connected || false,
         workspace: data.workspace,
         user: data.user,
       };
     } catch (error) {
       logger.error('Notion status error:', error);
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
       logger.error('Notion disconnect error:', error);
       return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
     }
   }

  async searchPages(query: string, pageSize?: number, cursor?: string): Promise<NotionSearchResult> {
    const limit = pageSize || 20;
    
    if (isNotionDbAvailable()) {
      try {
        const localReader = getNotionLocalReader();
        const localResult = await localReader.searchPages(query, limit);
        
         if (localResult.success && localResult.pages.length > 0) {
           logger.log(`[Notion] Local search returned ${localResult.pages.length} results`);
           return {
             success: true,
             pages: localResult.pages.map(this.convertLocalPage),
             total: localResult.total,
             source: 'local'
           };
         }
       } catch (error) {
         logger.warn('[Notion] Local search failed, falling back to API:', error);
       }
    }

    return this.searchPagesViaApi(query, limit, cursor);
  }

  private async searchPagesViaApi(query: string, pageSize: number, cursor?: string): Promise<NotionSearchResult> {
    try {
      const url = new URL(`${WORKER_URL}/notion/search`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('query', query);
      url.searchParams.set('filter', 'page');
      url.searchParams.set('page_size', pageSize.toString());
      if (cursor) {
        url.searchParams.set('start_cursor', cursor);
      }

       const response = await fetch(url.toString());
       const data = await response.json() as NotionSearchResult;
       return { ...data, source: 'api' };
     } catch (error) {
       logger.error('Notion search error:', error);
       return { success: false, error: error instanceof Error ? error.message : 'Unknown error', source: 'api' };
     }
   }

  private convertLocalPage(localPage: LocalNotionPage): NotionPage {
    return {
      id: localPage.id,
      title: localPage.title,
      url: localPage.url,
      lastEditedTime: localPage.lastEditedTime,
      parentType: 'page',
      matchContext: localPage.matchContext,
      isContentMatch: localPage.isContentMatch
    };
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
       logger.error('Notion get content error:', error);
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
