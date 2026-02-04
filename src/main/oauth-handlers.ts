import { logger } from '../services/utils/logger';
import { getState } from './state';

export function handleDeepLink(url: string): void {
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
          state.slackService.handleCallback(code, stateParam).then(result => {
            if (result.success) {
              state.settingsWindow?.webContents.send('slack-connected', result);
            } else {
              state.settingsWindow?.webContents.send('slack-oauth-error', { error: result.error });
            }
            state.pendingSlackCallback = null;
          });
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
          state.notionService.handleCallback(code, stateParam).then(result => {
            if (result.success) {
              state.settingsWindow?.webContents.send('notion-connected', result);
            } else {
              state.settingsWindow?.webContents.send('notion-oauth-error', { error: result.error });
            }
            state.pendingNotionCallback = null;
          });
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
          state.gmailService.handleCallback(code, stateParam).then(result => {
            if (result.success) {
              state.settingsWindow?.webContents.send('gmail-connected', result);
            } else {
              state.settingsWindow?.webContents.send('gmail-oauth-error', { error: result.error });
            }
            state.pendingGmailCallback = null;
          });
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
