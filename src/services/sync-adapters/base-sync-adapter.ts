/**
 * BaseSyncAdapter - Abstract base class for all sync adapters
 *
 * Provides shared infrastructure:
 * - Database service access
 * - Sync cursor management (get/update)
 * - Sync status tracking
 * - Content hash calculation for change detection
 */

import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import type { DatabaseService } from '../database';

export type SourceType = 'notion' | 'slack' | 'gmail' | 'linear';

export abstract class BaseSyncAdapter {
  protected dbService: DatabaseService;
  protected abstract readonly sourceType: SourceType;

  constructor() {
    this.dbService = getDatabaseService();
  }

  protected async getLastSyncCursor(): Promise<string | null> {
    const db = this.dbService.getDb();
    const result = await db.query<{ cursor_value: string }>(
      `SELECT cursor_value FROM sync_cursors WHERE source_type = $1`,
      [this.sourceType]
    );

    return result.rows[0]?.cursor_value || null;
  }

  protected async updateSyncCursor(cursor: string, itemCount: number): Promise<void> {
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
      [this.sourceType, cursor, itemCount]
    );
  }

  protected async updateSyncStatus(status: 'idle' | 'syncing' | 'error'): Promise<void> {
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
        [this.sourceType, status]
      );
    } else {
      await db.query(
        `
        INSERT INTO sync_cursors (source_type, status)
        VALUES ($1, $2)
        ON CONFLICT (source_type) DO UPDATE SET
          status = EXCLUDED.status
      `,
        [this.sourceType, status]
      );
    }
  }

  protected calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}
