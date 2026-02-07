import { ipcMain } from 'electron';
import { getState } from '../state';

export function registerOAuthHandlers(): void {
  const state = getState();

  // Slack OAuth
  ipcMain.handle('slack-connect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.startOAuthFlow();
  });

  ipcMain.handle('slack-disconnect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.disconnect();
  });

  ipcMain.handle('slack-status', async () => {
    if (!state.slackService) {
      return { connected: false };
    }
    return await state.slackService.getConnectionStatus();
  });

  ipcMain.handle('slack-channels', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.getChannels();
  });

  ipcMain.handle('slack-search', async (_event, { query, channels, count }: { query: string; channels?: string[]; count?: number }) => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.searchMessages(query, channels, count);
  });

  // Notion OAuth
  ipcMain.handle('notion-connect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.startOAuthFlow();
  });

  ipcMain.handle('notion-disconnect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.disconnect();
  });

  ipcMain.handle('notion-status', async () => {
    if (!state.notionService) {
      return { connected: false };
    }
    return await state.notionService.getConnectionStatus();
  });

  ipcMain.handle('notion-search', async (_event, { query, pageSize }: { query: string; pageSize?: number }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.searchPages(query, pageSize);
  });

  ipcMain.handle('notion-get-content', async (_event, { pageId }: { pageId: string }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.getPageContent(pageId);
  });

  // Gmail OAuth
  ipcMain.handle('gmail-connect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.startOAuthFlow();
  });

  ipcMain.handle('gmail-disconnect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.disconnect();
  });

  ipcMain.handle('gmail-status', async () => {
    if (!state.gmailService) {
      return { connected: false };
    }
    return await state.gmailService.getConnectionStatus();
  });

  ipcMain.handle('gmail-search', async (_event, { query, maxResults }: { query: string; maxResults?: number }) => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.searchEmails(query, maxResults);
  });
}
