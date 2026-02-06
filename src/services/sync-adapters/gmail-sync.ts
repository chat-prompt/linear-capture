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
import { createEmbeddingService } from '../embedding-service';
import type { GmailService, GmailMessage } from '../gmail-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { EmbeddingService } from '../embedding-service';
import type { SyncProgressCallback } from '../local-search';

const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 500;
const MAX_BATCHES = 25;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ emailId: string; error: string }>;
  lastCursor?: string;
}

export class GmailSyncAdapter {
  private gmailService: GmailService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingService: EmbeddingService;

  constructor() {
    this.gmailService = createGmailService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingService = createEmbeddingService();
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

      while (batchCount < MAX_BATCHES) {
        const query = oldestDate
          ? `in:inbox before:${oldestDate}`
          : 'in:inbox';

        console.log(`[GmailSync] Batch ${batchCount + 1}: "${query}"`);

        const searchResult = await this.gmailService.searchEmails(query, BATCH_SIZE);

        if (!searchResult.success || !searchResult.messages) {
          throw new Error(searchResult.error || 'Failed to fetch emails');
        }

        if (searchResult.messages.length === 0) {
          console.log('[GmailSync] No more emails to fetch');
          break;
        }

        console.log(`[GmailSync] Batch ${batchCount + 1}: ${searchResult.messages.length} emails`);

        const batchResult = await this.processBatchWithEmbedding(searchResult.messages);
        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        for (const email of searchResult.messages) {
          if (!latestDateOverall || email.date > latestDateOverall) {
            latestDateOverall = email.date;
          }
        }

        const oldestInBatch = searchResult.messages.reduce((oldest, email) => {
          return email.date < oldest ? email.date : oldest;
        }, searchResult.messages[0].date);

        oldestDate = new Date(oldestInBatch).toISOString().split('T')[0].replace(/-/g, '/');

        batchCount++;

        if (searchResult.messages.length < BATCH_SIZE) {
          console.log('[GmailSync] Last batch (fewer than batch size)');
          break;
        }

        await delay(BATCH_DELAY_MS);
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
      console.log(`[GmailSync] Last sync cursor: ${lastCursor || 'none'}`);

      const afterDate = lastCursor
        ? new Date(lastCursor).toISOString().split('T')[0].replace(/-/g, '/')
        : null;

      let oldestDate: string | null = null;
      let batchCount = 0;
      let latestDateOverall: string | null = null;

      while (batchCount < MAX_BATCHES) {
        let query = 'in:inbox';
        if (afterDate) query += ` after:${afterDate}`;
        if (oldestDate) query += ` before:${oldestDate}`;

        console.log(`[GmailSync] Batch ${batchCount + 1}: "${query}"`);

        const searchResult = await this.gmailService.searchEmails(query, BATCH_SIZE);

        if (!searchResult.success || !searchResult.messages) {
          throw new Error(searchResult.error || 'Failed to fetch emails');
        }

        if (searchResult.messages.length === 0) {
          console.log('[GmailSync] No more emails to fetch');
          break;
        }

        console.log(`[GmailSync] Batch ${batchCount + 1}: ${searchResult.messages.length} emails`);
        onProgress?.({ source: 'gmail', phase: 'syncing', current: batchCount + 1, total: MAX_BATCHES });

        const batchResult = await this.processBatchWithEmbedding(searchResult.messages);
        result.itemsSynced += batchResult.synced;
        result.itemsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        for (const email of searchResult.messages) {
          if (!latestDateOverall || email.date > latestDateOverall) {
            latestDateOverall = email.date;
          }
        }

        const oldestInBatch = searchResult.messages.reduce((oldest, email) => {
          return email.date < oldest ? email.date : oldest;
        }, searchResult.messages[0].date);

        oldestDate = new Date(oldestInBatch).toISOString().split('T')[0].replace(/-/g, '/');

        batchCount++;

        if (searchResult.messages.length < BATCH_SIZE) {
          console.log('[GmailSync] Last batch (fewer than batch size)');
          break;
        }

        await delay(BATCH_DELAY_MS);
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
  ): Promise<{ synced: number; failed: number; errors: Array<{ emailId: string; error: string }> }> {
    const result = { synced: 0, failed: 0, errors: [] as Array<{ emailId: string; error: string }> };

    if (emails.length === 0) return result;

    const db = this.dbService.getDb();
    const emailsToProcess: Array<{ email: GmailMessage; text: string; hash: string }> = [];

    for (const email of emails) {
      const fullText = `${email.subject}\n\n${email.snippet}`;
      const preprocessedText = this.preprocessor.preprocess(fullText);
      const contentHash = this.calculateContentHash(preprocessedText);

      const existingDoc = await db.query<{ content_hash: string }>(
        `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
        ['gmail', email.id]
      );

      if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
        console.log(`[GmailSync] Email ${email.id} unchanged, skipping`);
        result.synced++;
        continue;
      }

      emailsToProcess.push({ email, text: preprocessedText, hash: contentHash });
    }

    if (emailsToProcess.length === 0) return result;

    console.log(`[GmailSync] Generating embeddings for ${emailsToProcess.length} emails in batch`);
    const texts = emailsToProcess.map(e => e.text);
    const embeddings = await this.embeddingService.embedBatch(texts);

    for (let i = 0; i < emailsToProcess.length; i++) {
      const { email, text, hash } = emailsToProcess[i];
      const embedding = embeddings[i];

      try {
        await this.saveEmailWithEmbedding(email, text, hash, embedding);
        result.synced++;
      } catch (error) {
        console.error(`[GmailSync] Failed to save email ${email.id}:`, error);
        result.failed++;
        result.errors.push({
          emailId: email.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  private async saveEmailWithEmbedding(
    email: GmailMessage,
    preprocessedText: string,
    contentHash: string,
    embedding: number[]
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
        JSON.stringify(embedding),
        JSON.stringify(metadata),
        emailDate,
        emailDate,
      ]
    );

    console.log(`[GmailSync] Email ${email.id} saved successfully`);
  }

  private async syncEmail(email: GmailMessage): Promise<void> {
    console.log(`[GmailSync] Syncing email: ${email.subject} (${email.id})`);

    const fullText = `${email.subject}\n\n${email.snippet}`;
    const preprocessedText = this.preprocessor.preprocess(fullText);
    const contentHash = this.calculateContentHash(preprocessedText);

    const db = this.dbService.getDb();

    const existingDoc = await db.query<{ content_hash: string }>(
      `SELECT content_hash FROM documents WHERE source_type = $1 AND source_id = $2`,
      ['gmail', email.id]
    );

    if (existingDoc.rows.length > 0 && existingDoc.rows[0].content_hash === contentHash) {
      console.log(`[GmailSync] Email ${email.id} unchanged, skipping`);
      return;
    }

    const embedding = await this.embeddingService.embed(preprocessedText);

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
        JSON.stringify(embedding),
        JSON.stringify(metadata),
        emailDate,
        emailDate,
      ]
    );

    console.log(`[GmailSync] Email ${email.id} synced successfully`);
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
