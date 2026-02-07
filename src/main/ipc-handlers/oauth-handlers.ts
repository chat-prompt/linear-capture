import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { getState } from '../state';

export function registerOAuthHandlers(): void {
  const state = getState();

  // Slack OAuth
  ipcMain.handle('slack-connect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    try {
      return await state.slackService.startOAuthFlow();
    } catch (error) {
      logger.error('slack-connect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('slack-disconnect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    try {
      return await state.slackService.disconnect();
    } catch (error) {
      logger.error('slack-disconnect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('slack-status', async () => {
    if (!state.slackService) {
      return { connected: false };
    }
    try {
      return await state.slackService.getConnectionStatus();
    } catch (error) {
      logger.error('slack-status error:', error);
      return { connected: false };
    }
  });

  ipcMain.handle('slack-channels', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    try {
      return await state.slackService.getChannels();
    } catch (error) {
      logger.error('slack-channels error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('slack-search', async (_event, { query, channels, count }: { query: string; channels?: string[]; count?: number }) => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    try {
      return await state.slackService.searchMessages(query, channels, count);
    } catch (error) {
      logger.error('slack-search error:', error);
      return { success: false, error: String(error) };
    }
  });

  // Notion OAuth
  ipcMain.handle('notion-connect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    try {
      return await state.notionService.startOAuthFlow();
    } catch (error) {
      logger.error('notion-connect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('notion-disconnect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    try {
      return await state.notionService.disconnect();
    } catch (error) {
      logger.error('notion-disconnect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('notion-status', async () => {
    if (!state.notionService) {
      return { connected: false };
    }
    try {
      return await state.notionService.getConnectionStatus();
    } catch (error) {
      logger.error('notion-status error:', error);
      return { connected: false };
    }
  });

  ipcMain.handle('notion-search', async (_event, { query, pageSize }: { query: string; pageSize?: number }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    try {
      return await state.notionService.searchPages(query, pageSize);
    } catch (error) {
      logger.error('notion-search error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('notion-get-content', async (_event, { pageId }: { pageId: string }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    try {
      return await state.notionService.getPageContent(pageId);
    } catch (error) {
      logger.error('notion-get-content error:', error);
      return { success: false, error: String(error) };
    }
  });

  // Gmail OAuth
  ipcMain.handle('gmail-connect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    try {
      return await state.gmailService.startOAuthFlow();
    } catch (error) {
      logger.error('gmail-connect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('gmail-disconnect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    try {
      return await state.gmailService.disconnect();
    } catch (error) {
      logger.error('gmail-disconnect error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('gmail-status', async () => {
    if (!state.gmailService) {
      return { connected: false };
    }
    try {
      return await state.gmailService.getConnectionStatus();
    } catch (error) {
      logger.error('gmail-status error:', error);
      return { connected: false };
    }
  });

  ipcMain.handle('gmail-search', async (_event, { query, maxResults }: { query: string; maxResults?: number }) => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    try {
      return await state.gmailService.searchEmails(query, maxResults);
    } catch (error) {
      logger.error('gmail-search error:', error);
      return { success: false, error: String(error) };
    }
  });
}
