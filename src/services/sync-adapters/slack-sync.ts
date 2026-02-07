/**
 * SlackSyncAdapter - Sync Slack messages to local database
 *
 * Features:
 * - Incremental sync based on message timestamp
 * - Channel message history including thread replies
 * - Text preprocessing and embedding generation
 * - Change detection via content_hash
 * - Per-message error tracking (don't block entire sync)
 */

import { BaseSyncAdapter } from './base-sync-adapter';
import { createSlackService } from '../slack-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import type { SlackService, SlackChannel } from '../slack-client';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import { getDeviceId, getSelectedSlackChannels } from '../settings-store';
import { WORKER_BASE_URL } from '../config';
import type { SyncResult } from '../../types';
import { logger } from '../utils/logger';

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

interface SlackMessageHistoryResponse {
  success: boolean;
  messages?: Array<{
    ts: string;
    text: string;
    user: string;
    username?: string;
    thread_ts?: string;
    reply_count?: number;
    replies?: Array<{
      ts: string;
      text: string;
      user: string;
      username?: string;
    }>;
  }>;
  has_more?: boolean;
  error?: string;
}

export class SlackSyncAdapter extends BaseSyncAdapter {
  protected readonly sourceType = 'slack' as const;
  private slackService: SlackService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;
  private deviceId: string;

  constructor() {
    super();
    this.slackService = createSlackService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
    this.deviceId = getDeviceId();
  }

  /**
   * Full sync - fetch all messages (for initial sync)
   */
  async sync(): Promise<SyncResult> {
    logger.info('[SlackSync] Starting full sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');

      // Check connection status
      const status = await this.slackService.getConnectionStatus();
      if (!status.connected) {
        throw new Error('Slack not connected');
      }

      // Get all channels
      const channelsResult = await this.slackService.getChannels();
      if (!channelsResult.success || !channelsResult.channels) {
        throw new Error(channelsResult.error || 'Failed to fetch channels');
      }

      const publicChannels = channelsResult.channels.filter(ch => !ch.is_private);
      const selectedChannels = getSelectedSlackChannels();
      const selectedIds = new Set(selectedChannels.map(ch => ch.id));
      
      const channelsToSync = selectedIds.size > 0
        ? publicChannels.filter(ch => selectedIds.has(ch.id))
        : publicChannels;
      
      logger.info(`[SlackSync] Found ${channelsResult.channels.length} channels (${publicChannels.length} public, ${channelsToSync.length} selected)`);

      if (channelsToSync.length === 0) {
        logger.info('[SlackSync] No channels selected for sync');
        return result;
      }

      const syncPromises = channelsToSync.map(channel =>
        this.syncChannel(channel, null)
          .then(channelResult => ({ channel, channelResult, success: true as const }))
          .catch(error => ({ channel, error, success: false as const }))
      );

      const syncResults = await Promise.all(syncPromises);
      let latestTimestamp: string | null = null;

      for (const syncResult of syncResults) {
        if (syncResult.success) {
          const { channelResult } = syncResult;
          result.itemsSynced += channelResult.itemsSynced;
          result.itemsFailed += channelResult.itemsFailed;
          result.errors.push(...channelResult.errors);

          if (channelResult.lastCursor && (!latestTimestamp || channelResult.lastCursor > latestTimestamp)) {
            latestTimestamp = channelResult.lastCursor;
          }
        } else {
          logger.error(`[SlackSync] Failed to sync channel ${syncResult.channel.name}:`, syncResult.error);
          result.itemsFailed++;
          result.errors.push({
            id: syncResult.channel.id,
            error: syncResult.error instanceof Error ? syncResult.error.message : 'Unknown error',
          });
        }
      }

      if (latestTimestamp) {
        await this.updateSyncCursor(latestTimestamp, result.itemsSynced);
        result.lastCursor = latestTimestamp;
      }

      await this.updateSyncStatus('idle');

      logger.info(
        `[SlackSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      logger.error('[SlackSync] Full sync failed:', error);
      result.success = false;
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  /**
   * Incremental sync - fetch only messages after last sync
   */
  async syncIncremental(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    logger.info('[SlackSync] Starting incremental sync');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');
      onProgress?.({ source: 'slack', phase: 'discovering', current: 0, total: 0 });

      const lastCursor = await this.getLastSyncCursor();
      logger.info(`[SlackSync] Last sync cursor: ${lastCursor || 'none'}`);

      const status = await this.slackService.getConnectionStatus();
      logger.info('[SlackSync] Connection status:', JSON.stringify(status));
      if (!status.connected) {
        throw new Error('Slack not connected');
      }

      logger.info('[SlackSync] Fetching channels...');
      const channelsResult = await this.slackService.getChannels();
      logger.info('[SlackSync] Channels result:', JSON.stringify(channelsResult));
      
      if (!channelsResult.success || !channelsResult.channels) {
        throw new Error(channelsResult.error || 'Failed to fetch channels');
      }

      const publicChannels = channelsResult.channels.filter(ch => !ch.is_private);
      const selectedChannels = getSelectedSlackChannels();
      const selectedIds = new Set(selectedChannels.map(ch => ch.id));
      
      const channelsToSync = selectedIds.size > 0
        ? publicChannels.filter(ch => selectedIds.has(ch.id))
        : publicChannels;
      
      logger.info(`[SlackSync] Found ${channelsResult.channels.length} channels (${publicChannels.length} public, ${channelsToSync.length} selected)`);
      
      if (channelsToSync.length === 0) {
        logger.info('[SlackSync] No channels selected for sync');
        onProgress?.({ source: 'slack', phase: 'complete', current: 0, total: 0 });
        await this.updateSyncStatus('idle');
        return result;
      }

      let syncedChannels = 0;
      const totalChannels = channelsToSync.length;

      const syncPromises = channelsToSync.map(channel =>
        this.syncChannel(channel, lastCursor)
          .then(channelResult => {
            syncedChannels++;
            onProgress?.({ source: 'slack', phase: 'syncing', current: syncedChannels, total: totalChannels });
            return { channel, channelResult, success: true as const };
          })
          .catch(error => {
            syncedChannels++;
            onProgress?.({ source: 'slack', phase: 'syncing', current: syncedChannels, total: totalChannels });
            return { channel, error, success: false as const };
          })
      );

      const syncResults = await Promise.all(syncPromises);
      let latestTimestamp: string | null = lastCursor;

      for (const syncResult of syncResults) {
        if (syncResult.success) {
          const { channelResult } = syncResult;
          result.itemsSynced += channelResult.itemsSynced;
          result.itemsFailed += channelResult.itemsFailed;
          result.errors.push(...channelResult.errors);

          if (channelResult.lastCursor && (!latestTimestamp || channelResult.lastCursor > latestTimestamp)) {
            latestTimestamp = channelResult.lastCursor;
          }
        } else {
          logger.error(`[SlackSync] Failed to sync channel ${syncResult.channel.name}:`, syncResult.error);
          result.itemsFailed++;
          result.errors.push({
            id: syncResult.channel.id,
            error: syncResult.error instanceof Error ? syncResult.error.message : 'Unknown error',
          });
        }
      }

      if (latestTimestamp && latestTimestamp !== lastCursor) {
        await this.updateSyncCursor(latestTimestamp, result.itemsSynced);
        result.lastCursor = latestTimestamp;
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'slack', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      logger.info(
        `[SlackSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      logger.error('[SlackSync] Incremental sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'slack', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  /**
   * Sync a single channel's messages
   */
  private async syncChannel(channel: SlackChannel, oldest: string | null): Promise<SyncResult> {
    logger.info(`[SlackSync] Syncing channel: #${channel.name} (${channel.id})`);

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      const historyResult = await this.fetchChannelHistory(channel.id, oldest);

      if (!historyResult.success || !historyResult.messages) {
        throw new Error(historyResult.error || 'Failed to fetch channel history');
      }

      logger.info(`[SlackSync] Found ${historyResult.messages.length} messages in #${channel.name}`);

      let latestTimestamp: string | null = null;

      for (const message of historyResult.messages) {
        try {
          await this.syncMessage(message, channel);
          result.itemsSynced++;

          if (!latestTimestamp || message.ts > latestTimestamp) {
            latestTimestamp = message.ts;
          }

          // Sync thread replies if present
          if (message.replies && message.replies.length > 0) {
            for (const reply of message.replies) {
              try {
                await this.syncThreadReply(reply, message.ts, channel);
                result.itemsSynced++;

                if (!latestTimestamp || reply.ts > latestTimestamp) {
                  latestTimestamp = reply.ts;
                }
              } catch (error) {
                logger.error(`[SlackSync] Failed to sync reply ${reply.ts}:`, error);
                result.itemsFailed++;
                result.errors.push({
                  id: reply.ts,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }
          }
        } catch (error) {
          logger.error(`[SlackSync] Failed to sync message ${message.ts}:`, error);
          result.itemsFailed++;
          result.errors.push({
            id: message.ts,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (latestTimestamp) {
        result.lastCursor = latestTimestamp;
      }
    } catch (error) {
      logger.error(`[SlackSync] Failed to sync channel ${channel.name}:`, error);
      result.success = false;
      throw error;
    }

    return result;
  }

  /**
   * Fetch channel message history from Worker
   */
  private async fetchChannelHistory(
    channelId: string,
    oldest: string | null
  ): Promise<SlackMessageHistoryResponse> {
    try {
      const url = new URL(`${WORKER_BASE_URL}/slack/history`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('channel_id', channelId);
      if (oldest) {
        url.searchParams.set('oldest', oldest);
      }

      logger.info(`[SlackSync] Fetching history for channel ${channelId}, oldest: ${oldest || 'none'}`);
      const response = await fetch(url.toString());
      const data = await response.json() as SlackMessageHistoryResponse;
      logger.info(`[SlackSync] History response for ${channelId}: success=${data.success}, messages=${data.messages?.length || 0}, error=${data.error || 'none'}`);
      return data;
    } catch (error) {
      logger.error('[SlackSync] History fetch error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Sync a top-level message to database
   */
  private async syncMessage(
    message: { ts: string; text: string; user: string; username?: string },
    channel: SlackChannel
  ): Promise<void> {
    return this.upsertSlackContent(message, channel, null);
  }

  /**
   * Sync a thread reply to database
   */
  private async syncThreadReply(
    reply: { ts: string; text: string; user: string; username?: string },
    parentTs: string,
    channel: SlackChannel
  ): Promise<void> {
    return this.upsertSlackContent(reply, channel, parentTs);
  }

  /**
   * Upsert a Slack message or thread reply into the database.
   * When parentTs is provided, the content is treated as a thread reply.
   */
  private async upsertSlackContent(
    message: { ts: string; text: string; user: string; username?: string },
    channel: SlackChannel,
    parentTs: string | null
  ): Promise<void> {
    const isReply = parentTs !== null;
    const label = isReply ? `thread reply: ${message.ts} (parent: ${parentTs})` : `message: ${message.ts} in #${channel.name}`;
    logger.info(`[SlackSync] Syncing ${label}`);

    const preprocessedText = this.preprocessor.preprocess(message.text);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();
    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['slack', message.ts]
    );

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      logger.info(`[SlackSync] ${isReply ? 'Reply' : 'Message'} ${message.ts} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingClient.embedSingle(preprocessedText);

    const title = isReply
      ? `Reply in #${channel.name}`
      : `#${channel.name} - ${message.username || message.user}`;
    const metadata: Record<string, unknown> = {
      channelId: channel.id,
      channelName: channel.name,
      userId: message.user,
      username: message.username,
      isPrivate: channel.is_private,
    };
    if (parentTs) {
      metadata.parentMessageTs = parentTs;
    }

    await db.query(
      `
      INSERT INTO documents (
        source_type, source_id, parent_id, title, content, content_hash,
        embedding, metadata, source_created_at, source_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (source_type, source_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        source_updated_at = EXCLUDED.source_updated_at,
        indexed_at = NOW()
      WHERE documents.content_hash != EXCLUDED.content_hash
    `,
      [
        'slack',
        message.ts,
        parentTs,
        title,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        this.timestampToDate(message.ts),
        this.timestampToDate(message.ts),
      ]
    );

    logger.info(`[SlackSync] ${isReply ? 'Reply' : 'Message'} ${message.ts} synced successfully`);
  }

  /**
   * Convert Slack timestamp (e.g., "1234567890.123456") to Date
   */
  private timestampToDate(ts: string): Date {
    const seconds = parseFloat(ts);
    return new Date(seconds * 1000);
  }
}

/**
 * Factory function for creating SlackSyncAdapter instance
 */
export function createSlackSyncAdapter(): SlackSyncAdapter {
  return new SlackSyncAdapter();
}
