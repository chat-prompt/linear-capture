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

import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import { createSlackService } from '../slack-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import type { SlackService, SlackChannel } from '../slack-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import { getDeviceId, getSelectedSlackChannels } from '../settings-store';
import type { SyncResult } from '../../types';

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

const WORKER_URL = 'https://linear-capture-ai.kangjun-f0f.workers.dev';

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

export class SlackSyncAdapter {
  private slackService: SlackService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;
  private deviceId: string;

  constructor() {
    this.slackService = createSlackService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
    this.deviceId = getDeviceId();
  }

  /**
   * Full sync - fetch all messages (for initial sync)
   */
  async sync(): Promise<SyncResult> {
    console.log('[SlackSync] Starting full sync');

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
      
      console.log(`[SlackSync] Found ${channelsResult.channels.length} channels (${publicChannels.length} public, ${channelsToSync.length} selected)`);

      if (channelsToSync.length === 0) {
        console.log('[SlackSync] No channels selected for sync');
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
          console.error(`[SlackSync] Failed to sync channel ${syncResult.channel.name}:`, syncResult.error);
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

      console.log(
        `[SlackSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[SlackSync] Full sync failed:', error);
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
    console.log('[SlackSync] Starting incremental sync');

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
      console.log(`[SlackSync] Last sync cursor: ${lastCursor || 'none'}`);

      const status = await this.slackService.getConnectionStatus();
      console.log('[SlackSync] Connection status:', JSON.stringify(status));
      if (!status.connected) {
        throw new Error('Slack not connected');
      }

      console.log('[SlackSync] Fetching channels...');
      const channelsResult = await this.slackService.getChannels();
      console.log('[SlackSync] Channels result:', JSON.stringify(channelsResult));
      
      if (!channelsResult.success || !channelsResult.channels) {
        throw new Error(channelsResult.error || 'Failed to fetch channels');
      }

      const publicChannels = channelsResult.channels.filter(ch => !ch.is_private);
      const selectedChannels = getSelectedSlackChannels();
      const selectedIds = new Set(selectedChannels.map(ch => ch.id));
      
      const channelsToSync = selectedIds.size > 0
        ? publicChannels.filter(ch => selectedIds.has(ch.id))
        : publicChannels;
      
      console.log(`[SlackSync] Found ${channelsResult.channels.length} channels (${publicChannels.length} public, ${channelsToSync.length} selected)`);
      
      if (channelsToSync.length === 0) {
        console.log('[SlackSync] No channels selected for sync');
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
          console.error(`[SlackSync] Failed to sync channel ${syncResult.channel.name}:`, syncResult.error);
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

      console.log(
        `[SlackSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`
      );
    } catch (error) {
      console.error('[SlackSync] Incremental sync failed:', error);
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
    console.log(`[SlackSync] Syncing channel: #${channel.name} (${channel.id})`);

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

      console.log(`[SlackSync] Found ${historyResult.messages.length} messages in #${channel.name}`);

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
                console.error(`[SlackSync] Failed to sync reply ${reply.ts}:`, error);
                result.itemsFailed++;
                result.errors.push({
                  id: reply.ts,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }
          }
        } catch (error) {
          console.error(`[SlackSync] Failed to sync message ${message.ts}:`, error);
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
      console.error(`[SlackSync] Failed to sync channel ${channel.name}:`, error);
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
      const url = new URL(`${WORKER_URL}/slack/history`);
      url.searchParams.set('device_id', this.deviceId);
      url.searchParams.set('channel_id', channelId);
      if (oldest) {
        url.searchParams.set('oldest', oldest);
      }

      console.log(`[SlackSync] Fetching history for channel ${channelId}, oldest: ${oldest || 'none'}`);
      const response = await fetch(url.toString());
      const data = await response.json() as SlackMessageHistoryResponse;
      console.log(`[SlackSync] History response for ${channelId}: success=${data.success}, messages=${data.messages?.length || 0}, error=${data.error || 'none'}`);
      return data;
    } catch (error) {
      console.error('[SlackSync] History fetch error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Sync a single message to database
   */
  private async syncMessage(
    message: {
      ts: string;
      text: string;
      user: string;
      username?: string;
    },
    channel: SlackChannel
  ): Promise<void> {
    console.log(`[SlackSync] Syncing message: ${message.ts} in #${channel.name}`);

    const fullText = message.text;
    const preprocessedText = this.preprocessor.preprocess(fullText);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();
    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['slack', message.ts]
    );

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      console.log(`[SlackSync] Message ${message.ts} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingClient.embedSingle(preprocessedText);

    const title = `#${channel.name} - ${message.username || message.user}`;
    const metadata = {
      channelId: channel.id,
      channelName: channel.name,
      userId: message.user,
      username: message.username,
      isPrivate: channel.is_private,
    };

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
        null, // parent_id is null for top-level messages
        title,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        this.timestampToDate(message.ts),
        this.timestampToDate(message.ts),
      ]
    );

    console.log(`[SlackSync] Message ${message.ts} synced successfully`);
  }

  /**
   * Sync a thread reply to database
   */
  private async syncThreadReply(
    reply: {
      ts: string;
      text: string;
      user: string;
      username?: string;
    },
    parentTs: string,
    channel: SlackChannel
  ): Promise<void> {
    console.log(`[SlackSync] Syncing thread reply: ${reply.ts} (parent: ${parentTs})`);

    const fullText = reply.text;
    const preprocessedText = this.preprocessor.preprocess(fullText);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();
    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['slack', reply.ts]
    );

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      console.log(`[SlackSync] Reply ${reply.ts} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingClient.embedSingle(preprocessedText);

    const title = `Reply in #${channel.name}`;
    const metadata = {
      channelId: channel.id,
      channelName: channel.name,
      userId: reply.user,
      username: reply.username,
      isPrivate: channel.is_private,
      parentMessageTs: parentTs,
    };

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
        reply.ts,
        parentTs, // Link to parent message
        title,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        this.timestampToDate(reply.ts),
        this.timestampToDate(reply.ts),
      ]
    );

    console.log(`[SlackSync] Reply ${reply.ts} synced successfully`);
  }

  /**
   * Get last sync cursor from database
   */
  private async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['slack']
    );

    return result.rows[0]?.cursor_value || null;
  }

  /**
   * Update sync cursor in database
   */
  private async updateSyncCursor(cursor: string, itemCount: number): Promise<void> {
    const db = this.dbService.getDb();
    await db.query(
      `
      INSERT INTO sync_cursors (source_type, cursor_value, cursor_type, items_synced)
      VALUES ($1, $2, 'timestamp', $3)
      ON CONFLICT (source_type) DO UPDATE SET
        cursor_value = EXCLUDED.cursor_value,
        last_synced_at = NOW(),
        items_synced = sync_cursors.items_synced + EXCLUDED.items_synced,
        status = 'idle'
    `,
      ['slack', cursor, itemCount]
    );
  }

  /**
   * Update sync status in database
   */
  private async updateSyncStatus(status: 'idle' | 'syncing' | 'error'): Promise<void> {
    const db = this.dbService.getDb();
    if (status === 'idle') {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status, last_synced_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status,
          last_synced_at = NOW()
      `,
        ['slack', status]
      );
    } else {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status)
        VALUES ($1, $2)
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status
      `,
        ['slack', status]
      );
    }
  }

  /**
   * Calculate MD5 hash of content for change detection
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
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
