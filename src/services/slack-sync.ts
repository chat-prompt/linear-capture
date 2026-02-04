import { createSlackService, SlackChannel, SlackConnectionStatus } from './slack-client';
import { LocalVectorStore, VectorItem } from './local-vector-store';
import { EmbeddingClient, getEmbeddingClient } from './embedding-client';
import { getDeviceId } from './settings-store';
import { logger } from './utils/logger';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

interface SlackHistoryMessage {
  ts: string;
  text: string;
  user?: string;
  type: string;
}

interface SlackHistoryResult {
  success: boolean;
  messages?: SlackHistoryMessage[];
  has_more?: boolean;
  error?: string;
}

export interface SlackSyncOptions {
  maxChannels?: number;
  maxMessagesPerChannel?: number;
}

export interface SlackSyncResult {
  synced: number;
  channels: number;
  workspaceId: string;
  errors: string[];
}

export class SlackSync {
  private slackService = createSlackService();
  private embeddingClient: EmbeddingClient;
  private deviceId: string;

  constructor(private vectorStore: LocalVectorStore) {
    this.embeddingClient = getEmbeddingClient();
    this.deviceId = getDeviceId();
  }

  async sync(options: SlackSyncOptions = {}): Promise<SlackSyncResult> {
    const { maxChannels = 50, maxMessagesPerChannel = 100 } = options;
    const errors: string[] = [];

     const status = await this.slackService.getConnectionStatus();
     if (!status.connected || !status.workspace?.id) {
       logger.log('[SlackSync] Not connected to Slack');
       return { synced: 0, channels: 0, workspaceId: '', errors: ['Not connected'] };
     }

     const workspaceId = status.workspace.id;
     logger.log(`[SlackSync] Starting sync for workspace: ${status.workspace.name} (${workspaceId})`);

    const channelsResult = await this.slackService.getChannels();
    if (!channelsResult.success || !channelsResult.channels) {
      logger.error('[SlackSync] Failed to get channels:', channelsResult.error);
      return { synced: 0, channels: 0, workspaceId, errors: [channelsResult.error || 'Failed to get channels'] };
    }

    const channels = channelsResult.channels.slice(0, maxChannels);
    let totalSynced = 0;

    for (const channel of channels) {
       try {
         const synced = await this.syncChannel(channel, workspaceId, maxMessagesPerChannel);
         totalSynced += synced;
         logger.log(`[SlackSync] Channel #${channel.name}: ${synced} messages`);
       } catch (error) {
         const errorMsg = `Channel #${channel.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
         logger.error(`[SlackSync] ${errorMsg}`);
         errors.push(errorMsg);
       }
     }

     logger.log(`[SlackSync] Sync complete: ${totalSynced} messages from ${channels.length} channels`);
    return { synced: totalSynced, channels: channels.length, workspaceId, errors };
  }

  private async syncChannel(
    channel: SlackChannel,
    workspaceId: string,
    limit: number
  ): Promise<number> {
    const cursor = await this.vectorStore.getSyncCursor('slack', workspaceId, channel.id);

    const messages = await this.fetchChannelHistory(channel.id, cursor, limit);
    if (messages.length === 0) return 0;

    const validMessages = messages.filter(m => m.text && m.text.trim());
    if (validMessages.length === 0) return 0;

    const texts = validMessages.map(m => m.text);
    const embeddings = await this.embeddingClient.embed(texts);

    const items: VectorItem[] = validMessages.map((msg, i) => ({
      id: `slack:${workspaceId}:${channel.id}:${msg.ts}`,
      source: 'slack' as const,
      workspaceId,
      content: msg.text,
      title: `#${channel.name}`,
      url: `https://slack.com/archives/${channel.id}/p${msg.ts.replace('.', '')}`,
      timestamp: parseFloat(msg.ts) * 1000,
      embedding: embeddings[i],
    }));

    const count = await this.vectorStore.upsert(items);

    if (validMessages.length > 0) {
      const latestTs = validMessages[0].ts;
      await this.vectorStore.setSyncCursor('slack', workspaceId, latestTs, channel.id);
    }

    return count;
  }

  private async fetchChannelHistory(
    channelId: string,
    oldest: string | null,
    limit: number
  ): Promise<SlackHistoryMessage[]> {
    const url = new URL(`${WORKER_URL}/slack/history`);
    url.searchParams.set('device_id', this.deviceId);
    url.searchParams.set('channel_id', channelId);
    url.searchParams.set('limit', limit.toString());
    
    if (oldest) {
      url.searchParams.set('oldest', oldest);
    }

    const response = await fetch(url.toString());
    const data: SlackHistoryResult = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch history');
    }

    return data.messages || [];
  }
}

let slackSync: SlackSync | null = null;

export function getSlackSync(vectorStore: LocalVectorStore): SlackSync {
  if (!slackSync) {
    slackSync = new SlackSync(vectorStore);
  }
  return slackSync;
}
