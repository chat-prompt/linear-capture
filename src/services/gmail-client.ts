import { shell } from 'electron';
import { getDeviceId } from './settings-store';
import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';
const GMAIL_REDIRECT_URI = 'https://linear-capture-ai.kangjun-f0f.workers.dev/gmail/oauth-redirect';

export interface GmailConnectionStatus {
  connected: boolean;
  user?: {
    email: string;
    name?: string;
  };
}

export interface GmailCallbackResult {
  success: boolean;
  user?: {
    email: string;
    name?: string;
  };
  error?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: {
    name: string;
    email: string;
  };
  date: string;
  snippet: string;
}

export interface GmailSearchResult {
  success: boolean;
  messages?: GmailMessage[];
  total?: number;
  error?: string;
}

export class GmailService {
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  async startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/gmail/auth`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('redirect_uri', GMAIL_REDIRECT_URI);

      const response = await fetch(url.toString());
      const data = await response.json() as { success: boolean; auth_url?: string; error?: string };

      if (!data.success || !data.auth_url) {
        return { success: false, error: data.error || 'Failed to get auth URL' };
      }

      await shell.openExternal(data.auth_url);
      return { success: true };
    } catch (error) {
      logger.error('Gmail OAuth start error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async handleCallback(code: string, state: string): Promise<GmailCallbackResult> {
    try {
      const response = await fetch(`${WORKER_URL}/gmail/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          redirect_uri: GMAIL_REDIRECT_URI,
          state,
        }),
      });

      const data = await response.json() as GmailCallbackResult;
      return data;
    } catch (error) {
      logger.error('Gmail callback error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConnectionStatus(): Promise<GmailConnectionStatus> {
    try {
      const url = new URL(`${WORKER_URL}/gmail/status`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString());
      const data = await response.json() as {
        success: boolean;
        connected?: boolean;
        user?: { email: string; name?: string };
        error?: string;
      };

      if (!data.success) {
        logger.error('Gmail status error:', data.error);
        return { connected: false };
      }

      return {
        connected: data.connected || false,
        user: data.user,
      };
    } catch (error) {
      logger.error('Gmail status error:', error);
      return { connected: false };
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/gmail/disconnect`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString(), { method: 'DELETE' });
      const data = await response.json() as { success: boolean; error?: string };
      return data;
    } catch (error) {
      logger.error('Gmail disconnect error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async searchEmails(query: string, maxResults?: number): Promise<GmailSearchResult> {
    try {
      const url = new URL(`${WORKER_URL}/gmail/search`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('query', query);
      if (maxResults) {
        url.searchParams.set('maxResults', maxResults.toString());
      }

      const response = await fetch(url.toString());
      const data = await response.json() as GmailSearchResult;
      return data;
    } catch (error) {
      logger.error('Gmail search error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

let gmailService: GmailService | null = null;

export function createGmailService(): GmailService {
  if (!gmailService) {
    gmailService = new GmailService();
  }
  return gmailService;
}
