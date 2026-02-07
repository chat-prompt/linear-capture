/**
 * GmailSyncAdapter - Sync Gmail messages to local database
 *
 * Features:
 * - Incremental sync based on email date (after:YYYY/MM/DD query)
 * - Text preprocessing and embedding generation
 * - Change detection via content_hash
 * - Per-email error tracking (don't block entire sync)
 */

import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import { createGmailService } from '../gmail-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { getEmbeddingClient, EmbeddingClient } from '../embedding-client';
import type { GmailService, GmailMessage, GmailSearchResult } from '../gmail-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { SyncProgressCallback } from '../local-search';
import type { SyncResult } from '../../types';

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 50;
const MAX_BATCHES = 100;  // 10,000 emails max (100 batches × 100 per batch)

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY_MS = 1000;
const RETRY_BACKOFF_MULTIPLIER = 2;
const NON_RETRYABLE_STATUS_CODES = ['401', '403'];
const RETRYABLE_ERROR_PATTERNS = ['network', 'timeout', 'ECONNREFUSED', 'ENOTFOUND', '429', '500', '502', '503', '504'];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: string): boolean {
  const errorLower = error.toLowerCase();
  
  if (NON_RETRYABLE_STATUS_CODES.some(code => error.includes(code))) {
    return false;
  }
  
  return RETRYABLE_ERROR_PATTERNS.some(pattern => errorLower.includes(pattern.toLowerCase()));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  validateResult: (result: T) => { valid: boolean; error?: string },
  context: string
): Promise<{ result: T; retryCount: number }> {
  let lastError = '';
  
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      const validation = validateResult(result);
      
      if (validation.valid) {
        return { result, retryCount: attempt };
      }
      
      lastError = validation.error || 'Unknown error';
      
      if (!isRetryableError(lastError)) {
        console.log(`[GmailSync] ${context}: Non-retryable error (${lastError}), failing immediately`);
        throw new GmailSyncError(lastError, attempt + 1, false);
      }
      
      if (attempt < RETRY_MAX_ATTEMPTS - 1) {
        const delayMs = RETRY_INITIAL_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
        console.log(`[GmailSync] ${context}: Attempt ${attempt + 1} failed (${lastError}), retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    } catch (error) {
      if (error instanceof GmailSyncError) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : 'Unknown error';
      
      if (!isRetryableError(lastError)) {
        throw new GmailSyncError(lastError, attempt + 1, false);
      }
      
      if (attempt < RETRY_MAX_ATTEMPTS - 1) {
        const delayMs = RETRY_INITIAL_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
        console.log(`[GmailSync] ${context}: Attempt ${attempt + 1} threw error (${lastError}), retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }
  
  throw new GmailSyncError(lastError, RETRY_MAX_ATTEMPTS, true);
}

export class GmailSyncError extends Error {
  constructor(
    message: string,
    public readonly retryCount: number,
    public readonly exhaustedRetries: boolean
  ) {
    super(exhaustedRetries 
      ? `${message} (failed after ${retryCount} attempts)`
      : message
    );
    this.name = 'GmailSyncError';
  }
}

// Re-export for backwards compatibility
export type { SyncResult } from '../../types';

export class GmailSyncAdapter {
  private gmailService: GmailService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingClient: EmbeddingClient;

  constructor() {
    this.gmailService = createGmailService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingClient = getEmbeddingClient();
  }

  async sync(): Promise<SyncResult> {
    console.log('[GmailSync] Starting full sync with batched requests');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');

      let oldestDate: string | null = null;
      let batchCount = 0;
      let latestDateOverall: string | null = null;
      let totalFetched = 0;

      while (batchCount < MAX_BATCHES) {
        const query: string = oldestDate
          ? `in:inbox before:${oldestDate}`
          : 'in:inbox';

        console.log(`[GmailSync] ── Batch ${batchCount + 1}/${MAX_BATCHES} ──`);
        console.log(`[GmailSync]   query: "${query}"`);

        const { result: searchResult } = await retryWithBackoff<GmailSearchResult>(
          () => this.gmailService.searchEmails(query, BATCH_SIZE),
          (res) => ({
            valid: res.success && !!res.messages,
            error: res.error || 'Failed to fetch emails',
          }),
          `Full sync batch ${batchCount + 1}`
        );

        const messages = searchResult.messages!;

        // Log debug info from Worker
        if (searchResult.estimatedTotal !== undefined || searchResult._debug) {
          console.log(`[GmailSync]   estimatedTotal: ${searchResult.estimatedTotal ?? 'N/A'}, worker debug: ${JSON.stringify(searchResult._debug)}`);
        }

        if (messages.length === 0) {
          console.log(`[GmailSync]   ⛔ 0 messages returned → STOPPING (totalFetched: ${totalFetched})`);
          break;
        }

        totalFetched += messages.length;

        // Show date range of this batch (use timestamps for correct comparison)
        const timestamps = messages.map(m => new Date(m.date).getTime());
        const newestTs = Math.max(...timestamps);
        const oldestTs = Math.min(...timestamps);
        console.log(`[GmailSync]   returned: ${messages.length}, totalFetched: ${totalFetched}`);
        console.log(`[GmailSync]   dateRange: ${new Date(oldestTs).toISOString()} → ${new Date(newestTs).toISOString()}`);

        const batchResult = await this.processBatchWithEmbedding(messages);
        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);
        console.log(`[GmailSync]   processed: synced=${batchResult.synced}, skipped=${batchResult.skipped}, failed=${batchResult.failed}`);

        for (const email of messages) {
          const emailTs = new Date(email.date).getTime();
          if (!latestDateOverall || emailTs > new Date(latestDateOverall).getTime()) {
            latestDateOverall = email.date;
          }
        }

        // Find oldest email using timestamp comparison (NOT string comparison)
        const oldestEpoch = Math.floor(oldestTs / 1000);
        const prevOldestDate: string | null = oldestDate;
        oldestDate = String(oldestEpoch);
        console.log(`[GmailSync]   nextCursor: before:${oldestDate} (${new Date(oldestEpoch * 1000).toISOString()})`);

        // Detect stuck cursor: if before: timestamp didn't change, we're in an infinite loop
        if (prevOldestDate === oldestDate) {
          console.log(`[GmailSync]   ⚠️ Cursor stuck at ${oldestDate}, subtracting 1 second to advance`);
          oldestDate = String(oldestEpoch - 1);
        }

        batchCount++;

        await delay(BATCH_DELAY_MS);
      }

      if (batchCount >= MAX_BATCHES) {
        console.log(`[GmailSync] Reached MAX_BATCHES limit (${MAX_BATCHES}). Some older emails may not be synced.`);
      }

      if (latestDateOverall) {
        await this.updateSyncCursor(latestDateOverall, result.itemsSynced);
        result.lastCursor = latestDateOverall;
      }

      await this.updateSyncStatus('idle');

      console.log(
        `[GmailSync] Full sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed (${batchCount} batches)`
      );
    } catch (error) {
      console.error('[GmailSync] Full sync failed:', error);
      result.success = false;
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  async syncIncremental(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    console.log('[GmailSync] Starting incremental sync with batched requests');

    const result: SyncResult = {
      success: true,
      itemsSynced: 0,
      itemsFailed: 0,
      errors: [],
    };

    try {
      await this.updateSyncStatus('syncing');
      onProgress?.({ source: 'gmail', phase: 'discovering', current: 0, total: 0 });

      const lastCursor = await this.getLastSyncCursor();
      console.log(`[GmailSync] Last sync cursor: ${lastCursor || 'none (full sync)'}`);

      const afterEpoch = lastCursor
        ? Math.floor(new Date(lastCursor).getTime() / 1000)
        : null;

      let oldestDate: string | null = null;
      let batchCount = 0;
      let latestDateOverall: string | null = null;
      let totalNew = 0;
      let totalSkipped = 0;
      let totalFetched = 0;

      while (batchCount < MAX_BATCHES) {
        let query: string = 'in:inbox';
        if (afterEpoch) query += ` after:${afterEpoch}`;
        if (oldestDate) query += ` before:${oldestDate}`;

        console.log(`[GmailSync] ── Batch ${batchCount + 1}/${MAX_BATCHES} ──`);
        console.log(`[GmailSync]   query: "${query}"`);

        const { result: searchResult } = await retryWithBackoff<GmailSearchResult>(
          () => this.gmailService.searchEmails(query, BATCH_SIZE),
          (res) => ({
            valid: res.success && !!res.messages,
            error: res.error || 'Failed to fetch emails',
          }),
          `Incremental sync batch ${batchCount + 1}`
        );

        const messages = searchResult.messages!;

        // Log debug info from Worker
        if (searchResult.estimatedTotal !== undefined || searchResult._debug) {
          console.log(`[GmailSync]   estimatedTotal: ${searchResult.estimatedTotal ?? 'N/A'}, worker debug: ${JSON.stringify(searchResult._debug)}`);
        }

        if (messages.length === 0) {
          console.log(`[GmailSync]   ⛔ 0 messages returned → STOPPING (totalFetched: ${totalFetched})`);
          break;
        }

        totalFetched += messages.length;

        // Show date range of this batch (use timestamps for correct comparison)
        const timestamps = messages.map(m => new Date(m.date).getTime());
        const newestTs = Math.max(...timestamps);
        const oldestTs = Math.min(...timestamps);
        console.log(`[GmailSync]   returned: ${messages.length}, totalFetched: ${totalFetched}`);
        console.log(`[GmailSync]   dateRange: ${new Date(oldestTs).toISOString()} → ${new Date(newestTs).toISOString()}`);

        const batchResult = await this.processBatchWithEmbedding(messages);
        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);
        totalNew += batchResult.synced;
        totalSkipped += batchResult.skipped;
        console.log(`[GmailSync]   processed: synced=${batchResult.synced}, skipped=${batchResult.skipped}, failed=${batchResult.failed}`);
        onProgress?.({ source: 'gmail', phase: 'syncing', current: totalNew, total: totalNew + totalSkipped });

        for (const email of messages) {
          const emailTs = new Date(email.date).getTime();
          if (!latestDateOverall || emailTs > new Date(latestDateOverall).getTime()) {
            latestDateOverall = email.date;
          }
        }

        // Find oldest email using timestamp comparison (NOT string comparison)
        const oldestEpoch = Math.floor(oldestTs / 1000);
        const prevOldestDate: string | null = oldestDate;
        oldestDate = String(oldestEpoch);
        console.log(`[GmailSync]   nextCursor: before:${oldestDate} (${new Date(oldestEpoch * 1000).toISOString()})`);

        // Detect stuck cursor: if before: timestamp didn't change, we're in an infinite loop
        if (prevOldestDate === oldestDate) {
          console.log(`[GmailSync]   ⚠️ Cursor stuck at ${oldestDate}, subtracting 1 second to advance`);
          oldestDate = String(oldestEpoch - 1);
        }

        batchCount++;

        await delay(BATCH_DELAY_MS);
      }

      if (batchCount >= MAX_BATCHES) {
        console.log(`[GmailSync] Reached MAX_BATCHES limit (${MAX_BATCHES}). Some older emails may not be synced.`);
      }

      if (latestDateOverall) {
        await this.updateSyncCursor(latestDateOverall, result.itemsSynced);
        result.lastCursor = latestDateOverall;
      }

      await this.updateSyncStatus('idle');
      onProgress?.({ source: 'gmail', phase: 'complete', current: result.itemsSynced, total: result.itemsSynced });

      console.log(
        `[GmailSync] Incremental sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed (${batchCount} batches)`
      );
    } catch (error) {
      console.error('[GmailSync] Incremental sync failed:', error);
      result.success = false;
      onProgress?.({ source: 'gmail', phase: 'complete', current: 0, total: 0 });
      await this.updateSyncStatus('error');
      throw error;
    }

    return result;
  }

  private async processBatchWithEmbedding(
    emails: GmailMessage[]
  ): Promise<{ synced: number; skipped: number; failed: number; errors: Array<{ id: string; error: string }> }> {
    const result = { synced: 0, skipped: 0, failed: 0, errors: [] as Array<{ id: string; error: string }> };

    if (emails.length === 0) return result;

    const db = this.dbService.getDb();
    const emailsToProcess: Array<{ email: GmailMessage; text: string; hash: string }> = [];

    // Step 1: Batch hash check - single query to get ALL gmail document hashes
    const existingHashes = await db.query<{ source_id: string; content_hash: string }>(
      `SELECT source_id, content_hash FROM documents WHERE source_type = $1`,
      ['gmail']
    );
    const hashMap = new Map(existingHashes.rows.map(r => [r.source_id, r.content_hash]));

    // Step 2: Filter changed emails - pure CPU comparison using the map
    for (const email of emails) {
      const fullText = `${email.subject}\n\n${email.snippet}`;
      const preprocessedText = this.preprocessor.preprocess(fullText);
      const contentHash = this.calculateContentHash(preprocessedText);

      if (hashMap.get(email.id) === contentHash) {
        result.skipped++;
        continue;
      }

      emailsToProcess.push({ email, text: preprocessedText, hash: contentHash });
    }

    if (emailsToProcess.length === 0) return result;

    // Step 3: Embedding generation
    console.log(`[GmailSync] Generating embeddings for ${emailsToProcess.length} emails in batch`);
    const texts = emailsToProcess.map(e => e.text);
    const embeddings = await this.embeddingClient.embed(texts);

    // Step 4: Parallel saves
    const savePromises = emailsToProcess.map(async ({ email, text, hash }, i) => {
      try {
        await this.saveEmailWithEmbedding(email, text, hash, embeddings[i]);
        result.synced++;
      } catch (error) {
        console.error(`[GmailSync] Failed to save email ${email.id}:`, error);
        result.failed++;
        result.errors.push({
          id: email.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
    await Promise.all(savePromises);

    return result;
  }

  private async saveEmailWithEmbedding(
    email: GmailMessage,
    preprocessedText: string,
    contentHash: string,
    embedding: Float32Array
  ): Promise<void> {
    const db = this.dbService.getDb();
    const metadata = {
      threadId: email.threadId,
      from: email.from.email,
      fromName: email.from.name,
      url: `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`,
    };

    const emailDate = new Date(email.date);
    await db.query(
      `
      INSERT INTO documents (
        source_type, source_id, title, content, content_hash,
        embedding, metadata, source_created_at, source_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        'gmail',
        email.id,
        email.subject,
        preprocessedText,
        contentHash,
        JSON.stringify(Array.from(embedding)),
        JSON.stringify(metadata),
        emailDate,
        emailDate,
      ]
    );

    console.log(`[GmailSync] Email ${email.id} saved successfully`);
  }

  private async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      ['gmail']
    );

    return result.rows[0]?.cursor_value || null;
  }

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
      ['gmail', cursor, itemCount]
    );
  }

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
        ['gmail', status]
      );
    } else {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status)
        VALUES ($1, $2)
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status
      `,
        ['gmail', status]
      );
    }
  }

  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

export function createGmailSyncAdapter(): GmailSyncAdapter {
  return new GmailSyncAdapter();
}
