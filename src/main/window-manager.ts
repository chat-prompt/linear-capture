import { BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { logger } from '../services/utils/logger';
import { t } from './i18n';
import { getState } from './state';

export function openScreenCaptureSettings(): void {
  const state = getState();
  state.captureService?.openPermissionSettings();
}

export async function showPermissionNotification(): Promise<void> {
  const state = getState();
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: t('dialogs.permissionTitle'),
    message: t('dialogs.permissionMessage'),
    detail: t('dialogs.permissionDetail'),
    buttons: [t('dialogs.permissionButton'), t('common.cancel')],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    logger.log('Triggering capture to register app in permission list...');
    await state.captureService?.captureSelection();
    openScreenCaptureSettings();
  }
}

export function createOnboardingWindow(): void {
  const state = getState();

  state.onboardingWindow = new BrowserWindow({
    width: 380,
    height: 414,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  });

  state.onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));

  state.onboardingWindow.once('ready-to-show', async () => {
    state.onboardingWindow?.show();
    logger.log('Triggering capture to register in permission list...');
    await state.captureService?.captureSelection();
  });

  state.onboardingWindow.on('closed', () => {
    state.onboardingWindow = null;
  });
}

export function createSettingsWindow(): void {
  const state = getState();

  if (state.settingsWindow) {
    state.settingsWindow.focus();
    return;
  }

  state.settingsWindow = new BrowserWindow({
    width: 620,
    height: 1000,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    title: 'Settings - Linear Capture',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  state.settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  state.settingsWindow.once('ready-to-show', () => {
    state.settingsWindow?.show();
  });

  state.settingsWindow.on('closed', () => {
    state.settingsWindow = null;
  });
}

export function createMainWindow(): void {
  const state = getState();

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    logger.log('Main window already exists, skipping creation');
    return;
  }

  state.mainWindow = new BrowserWindow({
    width: 728,
    height: 720,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  });

  state.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  state.mainWindow.on('closed', async () => {
    state.mainWindow = null;
    const { cleanupSession } = await import('./capture-session');
    cleanupSession();
  });
}
