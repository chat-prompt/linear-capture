import { app } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logger } from '../services/utils/logger';

app.disableHardwareAcceleration();

import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { createTray, destroyTray } from './tray';
import { initI18n } from './i18n';
import { createCaptureService } from '../services/capture';
import { createGeminiAnalyzer, createAnthropicAnalyzer } from '../services/ai-analyzer';
import { getCaptureHotkey, hasToken, getLanguage } from '../services/settings-store';
import { initAutoUpdater, checkForUpdates } from '../services/auto-updater';
import { createSlackService } from '../services/slack-client';
import { createNotionService } from '../services/notion-client';
import { closeNotionLocalReader } from '../services/notion-local-reader';
import { createGmailService } from '../services/gmail-client';
import { trackAppOpen } from '../services/analytics';
import { initDatabaseService, closeDatabaseService } from '../services/database';
import { getLocalSearchService } from '../services/local-search';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
let syncScheduler: NodeJS.Timeout | null = null;

import { getState, getStore } from './state';
import { handleDeepLink } from './oauth-handlers';
import { createOnboardingWindow, createSettingsWindow, createMainWindow } from './window-manager';
import { handleCapture } from './capture-session';
import { registerIpcHandlers, loadLinearData } from './ipc-handlers';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const state = getState();
    logger.log('Second instance detected, focusing existing window...');
    const windowToFocus = state.mainWindow || state.settingsWindow || state.onboardingWindow;
    if (windowToFocus) {
      if (windowToFocus.isMinimized()) windowToFocus.restore();
      windowToFocus.show();
      windowToFocus.focus();
    }
    
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('linear-capture://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

app.setAsDefaultProtocolClient('linear-capture');

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.whenReady().then(async () => {
  const state = getState();
  const store = getStore();
  
  await initI18n(getLanguage());
  
  state.captureService = createCaptureService();
  
  if (process.platform === 'darwin') {
    app.dock?.show();
  }

  const hasLaunched = store.get('hasLaunched', false);
  if (!hasLaunched) {
    store.set('hasLaunched', true);
    createOnboardingWindow();
  }

  registerIpcHandlers();

  // Initialize DatabaseService for local sync (PGlite + pgvector)
  try {
    await initDatabaseService();
    logger.log('[App] DatabaseService initialized successfully');

    syncScheduler = setInterval(async () => {
      const localSearch = getLocalSearchService();
      if (localSearch?.canSync()) {
        logger.log('[AutoSync] Starting scheduled sync');
        try {
          await localSearch.syncAll();
        } catch (error) {
          logger.error('[AutoSync] Scheduled sync failed:', error);
        }
      }
    }, SYNC_INTERVAL_MS);
    logger.log('[AutoSync] Scheduler started (5min interval)');
  } catch (error) {
    logger.error('[App] Failed to initialize DatabaseService:', error);
    // Continue app execution - sync features will be disabled
  }

  state.slackService = createSlackService();
  state.notionService = createNotionService();
  state.gmailService = createGmailService();

  state.geminiAnalyzer = createGeminiAnalyzer();
  if (state.geminiAnalyzer) {
    logger.log('Gemini AI analysis enabled (default)');
  }

  state.anthropicAnalyzer = createAnthropicAnalyzer();
  if (state.anthropicAnalyzer) {
    logger.log('Anthropic AI analysis enabled (fallback)');
  }

  await loadLinearData();

  trackAppOpen();

  createTray({
    onCapture: () => handleCapture(createMainWindow),
    onSettings: createSettingsWindow,
    onQuit: () => app.quit(),
  });

  const savedHotkey = getCaptureHotkey();
  registerHotkey(() => handleCapture(createMainWindow), savedHotkey);
  logger.log(`Using hotkey: ${savedHotkey}`);

  if (hasLaunched && !hasToken()) {
    logger.log('Existing user without token, opening settings...');
    createSettingsWindow();
  }

  createMainWindow();
  state.mainWindow?.show();

  if (app.isPackaged && state.mainWindow) {
    initAutoUpdater(state.mainWindow);

    setTimeout(() => {
      logger.log('Checking for updates...');
      checkForUpdates();
    }, 5000);

    setInterval(() => {
      logger.log('Periodic update check...');
      checkForUpdates();
    }, 4 * 60 * 60 * 1000);
  }

  logger.log('Linear Capture ready! Press ⌘+Shift+L to capture.');
});

app.on('will-quit', async () => {
  if (syncScheduler) {
    clearInterval(syncScheduler);
    syncScheduler = null;
  }
  unregisterAllHotkeys();
  destroyTray();
  closeNotionLocalReader();
  await closeDatabaseService();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
});

app.on('activate', () => {
  const state = getState();
  if (!state.mainWindow) {
    createMainWindow();
  }
  state.mainWindow?.show();
  state.mainWindow?.focus();
});
