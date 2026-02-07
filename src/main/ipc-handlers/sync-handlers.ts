import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { getLocalSearchService } from '../../services/local-search';
import {
  getSelectedSlackChannels,
  setSelectedSlackChannels,
  SlackChannelInfo,
} from '../../services/settings-store';
import { getState } from '../state';

export function registerSyncHandlers(): void {
  const state = getState();

  ipcMain.handle('sync:get-slack-channels', () => {
    try {
      return getSelectedSlackChannels();
    } catch (err) {
      logger.error('sync:get-slack-channels failed:', err);
      throw err;
    }
  });

  ipcMain.handle('sync:set-slack-channels', (_event, channels: SlackChannelInfo[]) => {
    try {
      setSelectedSlackChannels(channels);
      return { success: true };
    } catch (err) {
      logger.error('sync:set-slack-channels failed:', err);
      throw err;
    }
  });

  ipcMain.handle('sync:get-status', async () => {
    try {
      const localSearch = getLocalSearchService();
      if (!localSearch) {
        return { initialized: false };
      }
      return await localSearch.getSyncStatus();
    } catch (error) {
      logger.error('sync:get-status error:', error);
      return { initialized: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:trigger', async (_event, source: string) => {
    logger.log(`[IPC] sync:trigger called with source: ${source}`);
    try {
      const localSearch = getLocalSearchService();
      logger.log(`[IPC] localSearch: ${localSearch ? 'initialized' : 'null'}`);
      if (!localSearch) {
        return { success: false, error: 'LocalSearchService not initialized' };
      }
      logger.log(`[IPC] canSync: ${localSearch.canSync()}, isInitialized: ${localSearch.isInitialized()}`);

      const onProgress = (progress: { source: string; phase: string; current: number; total: number }) => {
        if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
          state.settingsWindow.webContents.send('sync:progress', progress);
        }
      };

      const result = await localSearch.syncSource(source, onProgress);
      logger.log(`[IPC] syncSource result: itemsSynced=${result.itemsSynced}, itemsFailed=${result.itemsFailed}`);
      return {
        success: result.success,
        itemsSynced: result.itemsSynced,
        itemsFailed: result.itemsFailed,
      };
    } catch (error) {
      logger.error('sync:trigger error:', error);
      return { success: false, error: String(error) };
    }
  });

  // Reset sync cursor for a source (for debugging)
  ipcMain.handle('sync:reset-cursor', async (_event, source: string) => {
    logger.log(`[IPC] sync:reset-cursor called for: ${source}`);
    try {
      const { getDatabaseService } = await import('../../services/database');
      const dbService = getDatabaseService();
      const db = dbService.getDb();

      await db.query(
        `DELETE FROM sync_cursors WHERE source_type = $1`,
        [source]
      );

      logger.log(`[IPC] Cursor reset for ${source}`);
      return { success: true };
    } catch (error) {
      logger.error('sync:reset-cursor error:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete all synced documents for a source (for debugging)
  ipcMain.handle('sync:delete-source', async (_event, source: string) => {
    logger.log(`[IPC] sync:delete-source called for: ${source}`);
    try {
      const { getDatabaseService } = await import('../../services/database');
      const dbService = getDatabaseService();
      const db = dbService.getDb();

      const docs = await db.query(
        `DELETE FROM documents WHERE source_type = $1`,
        [source]
      );
      await db.query(
        `DELETE FROM sync_cursors WHERE source_type = $1`,
        [source]
      );

      logger.log(`[IPC] Deleted source data for ${source}`);
      return { success: true };
    } catch (error) {
      logger.error('sync:delete-source error:', error);
      return { success: false, error: String(error) };
    }
  });
}
