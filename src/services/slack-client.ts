import { shell } from 'electron';
import { getDeviceId } from './settings-store';
import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';
const SLACK_REDIRECT_URI = 'https://linear-capture-ai.kangjun-f0f.workers.dev/slack/oauth-redirect';

export interface SlackConnectionStatus {
  connected: boolean;
  workspace?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    name: string;
  };
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members?: number;
}

export interface SlackChannelsResult {
  success: boolean;
  channels?: SlackChannel[];
  workspace?: {
    id: string;
    name: string;
  };
  error?: string;
}

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  username?: string;
  channel: {
    id: string;
    name: string;
  };
  permalink: string;
  timestamp: string;
}

export interface SlackSearchResult {
  success: boolean;
  messages?: SlackMessage[];
  total?: number;
  error?: string;
}

export interface SlackCallbackResult {
  success: boolean;
  workspace?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    name: string;
  };
  error?: string;
}

export class SlackService {
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  async startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/slack/auth`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);

      const response = await fetch(url.toString());
      const data = await response.json() as { success: boolean; auth_url?: string; error?: string };

      if (!data.success || !data.auth_url) {
        return { success: false, error: data.error || 'Failed to get auth URL' };
      }

      await shell.openExternal(data.auth_url);
      return { success: true };
    } catch (error) {
      logger.error('Slack OAuth start error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async handleCallback(code: string, state: string): Promise<SlackCallbackResult> {
    try {
      const response = await fetch(`${WORKER_URL}/slack/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          redirect_uri: SLACK_REDIRECT_URI,
          state,
        }),
      });

      const data = await response.json() as SlackCallbackResult;
      return data;
    } catch (error) {
      logger.error('Slack callback error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConnectionStatus(): Promise<SlackConnectionStatus> {
    try {
      const url = new URL(`${WORKER_URL}/slack/status`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString());
      const data = await response.json() as {
        success: boolean;
        connected?: boolean;
        workspace?: { id: string; name: string };
        user?: { id: string; name: string };
        error?: string;
      };

      if (!data.success) {
        logger.error('Slack status error:', data.error);
        return { connected: false };
      }

      return {
        connected: data.connected || false,
        workspace: data.workspace,
        user: data.user,
      };
    } catch (error) {
      logger.error('Slack status error:', error);
      return { connected: false };
    }
  }

  async getChannels(): Promise<SlackChannelsResult> {
    try {
      const url = new URL(`${WORKER_URL}/slack/channels`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString());
      const data = await response.json() as SlackChannelsResult;
      return data;
    } catch (error) {
      logger.error('Slack channels error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = new URL(`${WORKER_URL}/slack/disconnect`);
      url.searchParams.set('device_id', this.deviceId);

      const response = await fetch(url.toString(), { method: 'DELETE' });
      const data = await response.json() as { success: boolean; error?: string };
      return data;
    } catch (error) {
      logger.error('Slack disconnect error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async searchMessages(query: string, channels?: string[], count?: number): Promise<SlackSearchResult> {
    try {
      const url = new URL(`${WORKER_URL}/slack/search`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('query', query);
      if (channels && channels.length > 0) {
        url.searchParams.set('channels', channels.join(','));
      }
      if (count) {
        url.searchParams.set('count', count.toString());
      }

      const response = await fetch(url.toString());
      const data = await response.json() as SlackSearchResult;
      return data;
    } catch (error) {
      logger.error('Slack search error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

let slackService: SlackService | null = null;

export function createSlackService(): SlackService {
  if (!slackService) {
    slackService = new SlackService();
  }
  return slackService;
}
