import { logger } from '../services/utils/logger';
import { getState } from './state';
import { getLocalSearchService } from '../services/local-search';
import { getDatabaseService } from '../services/database';
import { clearSelectedSlackChannels } from '../services/settings-store';

export async function handleDeepLink(url: string): Promise<void> {
  const state = getState();
  logger.log('Deep link received:', url);
  
  try {
    const parsed = new URL(url);
    
    if (parsed.hostname === 'slack' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const stateParam = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        logger.error('Slack OAuth error:', error);
        state.settingsWindow?.webContents.send('slack-oauth-error', { error });
        return;
      }
      
      if (code && stateParam) {
        logger.log('Slack OAuth callback received');
        state.pendingSlackCallback = { code, state: stateParam };
        
        if (state.slackService) {
          try {
            const result = await state.slackService.handleCallback(code, stateParam);
            if (result.success) {
              // Clear old Slack data before syncing new workspace
              try {
                const db = getDatabaseService().getDb();
                await db.query(`DELETE FROM documents WHERE source_type = 'slack'`);
                await db.query(`DELETE FROM sync_cursors WHERE source_type = 'slack'`);
                clearSelectedSlackChannels();
                logger.log('[OAuth] Cleared old Slack data for fresh workspace connection');
                const localSearchForClear = getLocalSearchService();
                localSearchForClear?.invalidateSyncStatusCache();
              } catch (dbErr) {
                logger.warn('[OAuth] Failed to clear old Slack data:', dbErr);
              }

              state.settingsWindow?.webContents.send('slack-connected', result);

              try {
                const localSearch = getLocalSearchService();
                if (localSearch) {
                  await localSearch.syncSource('slack');
                  logger.log('[OAuth] Slack sync triggered after connect');
                  state.settingsWindow?.webContents.send('settings-updated');
                }
              } catch (error) {
                logger.warn('[OAuth] Failed to trigger Slack sync:', error);
              }
            } else {
              state.settingsWindow?.webContents.send('slack-oauth-error', { error: result.error });
            }
          } catch (error) {
            logger.error('[OAuth] Slack callback failed:', error);
            if (state.settingsWindow) {
              state.settingsWindow.webContents.send('slack-oauth-error', {
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          } finally {
            state.pendingSlackCallback = null;
          }
        }
        
        if (state.settingsWindow) {
          state.settingsWindow.show();
          state.settingsWindow.focus();
        }
      }
    }
    
    if (parsed.hostname === 'notion' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const stateParam = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        logger.error('Notion OAuth error:', error);
        state.settingsWindow?.webContents.send('notion-oauth-error', { error });
        return;
      }
      
      if (code && stateParam) {
        logger.log('Notion OAuth callback received');
        state.pendingNotionCallback = { code, state: stateParam };
        
        if (state.notionService) {
          try {
            const result = await state.notionService.handleCallback(code, stateParam);
            if (result.success) {
              state.settingsWindow?.webContents.send('notion-connected', result);

              try {
                const localSearch = getLocalSearchService();
                if (localSearch) {
                  await localSearch.syncSource('notion');
                  logger.log('[OAuth] Notion sync triggered after connect');
                }
              } catch (error) {
                logger.warn('[OAuth] Failed to trigger Notion sync:', error);
              }
            } else {
              state.settingsWindow?.webContents.send('notion-oauth-error', { error: result.error });
            }
          } catch (error) {
            logger.error('[OAuth] Notion callback failed:', error);
            if (state.settingsWindow) {
              state.settingsWindow.webContents.send('notion-oauth-error', {
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          } finally {
            state.pendingNotionCallback = null;
          }
        }
        
        if (state.settingsWindow) {
          state.settingsWindow.show();
          state.settingsWindow.focus();
        }
      }
    }
    
    if (parsed.hostname === 'gmail' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const stateParam = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        logger.error('Gmail OAuth error:', error);
        state.settingsWindow?.webContents.send('gmail-oauth-error', { error });
        return;
      }
      
      if (code && stateParam) {
        logger.log('Gmail OAuth callback received');
        state.pendingGmailCallback = { code, state: stateParam };
        
        if (state.gmailService) {
          try {
            const result = await state.gmailService.handleCallback(code, stateParam);
            if (result.success) {
              state.settingsWindow?.webContents.send('gmail-connected', result);
            } else {
              state.settingsWindow?.webContents.send('gmail-oauth-error', { error: result.error });
            }
          } catch (error) {
            logger.error('[OAuth] Gmail callback failed:', error);
            if (state.settingsWindow) {
              state.settingsWindow.webContents.send('gmail-oauth-error', {
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          } finally {
            state.pendingGmailCallback = null;
          }
        }
        
        if (state.settingsWindow) {
          state.settingsWindow.show();
          state.settingsWindow.focus();
        }
      }
    }
  } catch (err) {
    logger.error('Failed to parse deep link URL:', err);
  }
}
