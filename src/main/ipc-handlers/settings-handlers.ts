import { app, ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../services/utils/logger';
import { validateLinearToken } from '../../services/linear-client';
import {
  setLinearToken,
  clearLinearToken,
  getUserInfo,
  setUserInfo,
  getAllSettings,
  getCaptureHotkey,
  setCaptureHotkey,
  resetCaptureHotkey,
  getDefaultHotkey,
  getDeviceId,
  getLanguage,
  setLanguage,
  getSupportedLanguages,
  UserInfo as SettingsUserInfo,
} from '../../services/settings-store';
import { checkForUpdates } from '../../services/auto-updater';
import { updateHotkey, validateHotkey, formatHotkeyForDisplay } from '../hotkey';
import { changeLanguage, t, i18next } from '../i18n';
import { getState } from '../state';
import { createSettingsWindow } from '../window-manager';
import { loadLinearData } from './linear-handlers';

export function registerSettingsHandlers(): void {
  const state = getState();

  ipcMain.handle('get-settings', async () => {
    return getAllSettings();
  });

  ipcMain.handle('validate-token', async (_event, token: string) => {
    try {
      const result = await validateLinearToken(token);
      return result;
    } catch (error) {
      logger.error('Token validation error:', error);
      return { valid: false, error: String(error) };
    }
  });

  ipcMain.handle('save-settings', async (_event, data: { linearApiToken: string; userInfo: SettingsUserInfo }) => {
    try {
      setLinearToken(data.linearApiToken);
      setUserInfo(data.userInfo);
      await loadLinearData();
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('settings-updated');
        state.mainWindow.webContents.send('linear-data-updated', {
          teams: state.teamsCache,
          projects: state.projectsCache,
          users: state.usersCache,
          states: state.statesCache,
          cycles: state.cyclesCache,
          labels: state.labelsCache,
          defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
        });
      }
      return { success: true };
    } catch (error) {
      logger.error('Save settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('clear-settings', async () => {
    try {
      clearLinearToken();
      return { success: true };
    } catch (error) {
      logger.error('Clear settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('close-settings', () => {
    state.settingsWindow?.close();
  });

  ipcMain.handle('check-for-updates', async () => {
    if (app.isPackaged) {
      await checkForUpdates(false);
      return { success: true };
    } else {
      return { success: false, error: 'Updates only work in packaged app' };
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-hotkey', () => {
    return {
      hotkey: getCaptureHotkey(),
      displayHotkey: formatHotkeyForDisplay(getCaptureHotkey()),
      defaultHotkey: getDefaultHotkey(),
      defaultDisplayHotkey: formatHotkeyForDisplay(getDefaultHotkey()),
    };
  });

  ipcMain.handle('validate-hotkey', (_event, hotkey: string) => {
    return validateHotkey(hotkey);
  });

  ipcMain.handle('save-hotkey', async (_event, hotkey: string) => {
    const validation = validateHotkey(hotkey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const success = updateHotkey(hotkey);
    if (success) {
      setCaptureHotkey(hotkey);
      const displayHotkey = formatHotkeyForDisplay(hotkey);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('hotkey-changed', { hotkey, displayHotkey });
      }
      return {
        success: true,
        hotkey: hotkey,
        displayHotkey: displayHotkey,
      };
    } else {
      return {
        success: false,
        error: 'Failed to register hotkey. It may be in use by another application.',
      };
    }
  });

  ipcMain.handle('reset-hotkey', async () => {
    const defaultHotkey = getDefaultHotkey();
    const success = updateHotkey(defaultHotkey);
    if (success) {
      resetCaptureHotkey();
      const displayHotkey = formatHotkeyForDisplay(defaultHotkey);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('hotkey-changed', { hotkey: defaultHotkey, displayHotkey });
      }
      return {
        success: true,
        hotkey: defaultHotkey,
        displayHotkey: displayHotkey,
      };
    } else {
      return {
        success: false,
        error: 'Failed to reset hotkey',
      };
    }
  });

  ipcMain.handle('set-traffic-lights-visible', (_event, visible: boolean) => {
    if (state.mainWindow && process.platform === 'darwin') {
      state.mainWindow.setWindowButtonVisibility(visible);
    }
  });

  ipcMain.handle('get-device-id', () => {
    return getDeviceId();
  });

  ipcMain.handle('get-language', () => {
    return getLanguage();
  });

  ipcMain.handle('set-language', async (_event, lang: string) => {
    setLanguage(lang);
    await changeLanguage(lang);
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(win => {
      win.webContents.send('language-changed', lang);
    });
    return { success: true };
  });

  ipcMain.handle('get-supported-languages', () => {
    return getSupportedLanguages();
  });

  ipcMain.handle('translate', (_event, key: string, options?: Record<string, unknown>) => {
    return t(key, options as Record<string, any>);
  });

  ipcMain.handle('get-reverse-translation-map', () => {
    const translations = i18next.getResourceBundle('en', 'translation');
    const reverseMap: Record<string, string> = {};

    function flatten(obj: any, prefix = '') {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          flatten(obj[key], fullKey);
        } else if (typeof obj[key] === 'string') {
          reverseMap[obj[key]] = fullKey;
        }
      }
    }
    flatten(translations);
    return reverseMap;
  });
}
