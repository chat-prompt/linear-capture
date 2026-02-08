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
    try {
      return getAllSettings();
    } catch (err) {
      logger.error('get-settings failed:', err);
      throw err;
    }
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
    try {
      createSettingsWindow();
    } catch (err) {
      logger.error('open-settings failed:', err);
      throw err;
    }
  });

  ipcMain.handle('close-settings', () => {
    try {
      state.settingsWindow?.close();
    } catch (err) {
      logger.error('close-settings failed:', err);
      throw err;
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Updates only work in packaged app' };
    }
    try {
      await checkForUpdates(false);
      return { success: true };
    } catch (error) {
      logger.error('check-for-updates error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-app-version', () => {
    try {
      return app.getVersion();
    } catch (err) {
      logger.error('get-app-version failed:', err);
      throw err;
    }
  });

  ipcMain.handle('get-hotkey', () => {
    try {
      return {
        hotkey: getCaptureHotkey(),
        displayHotkey: formatHotkeyForDisplay(getCaptureHotkey()),
        defaultHotkey: getDefaultHotkey(),
        defaultDisplayHotkey: formatHotkeyForDisplay(getDefaultHotkey()),
      };
    } catch (err) {
      logger.error('get-hotkey failed:', err);
      throw err;
    }
  });

  ipcMain.handle('validate-hotkey', (_event, hotkey: string) => {
    try {
      return validateHotkey(hotkey);
    } catch (err) {
      logger.error('validate-hotkey failed:', err);
      throw err;
    }
  });

  ipcMain.handle('save-hotkey', async (_event, hotkey: string) => {
    try {
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
    } catch (error) {
      logger.error('save-hotkey error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('reset-hotkey', async () => {
    try {
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
    } catch (error) {
      logger.error('reset-hotkey error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('set-traffic-lights-visible', (_event, visible: boolean) => {
    try {
      if (state.mainWindow && process.platform === 'darwin') {
        state.mainWindow.setWindowButtonVisibility(visible);
      }
    } catch (err) {
      logger.error('set-traffic-lights-visible failed:', err);
      throw err;
    }
  });

  ipcMain.handle('get-device-id', () => {
    try {
      return getDeviceId();
    } catch (err) {
      logger.error('get-device-id failed:', err);
      throw err;
    }
  });

  ipcMain.handle('get-language', () => {
    try {
      return getLanguage();
    } catch (err) {
      logger.error('get-language failed:', err);
      throw err;
    }
  });

  ipcMain.handle('set-language', async (_event, lang: string) => {
    try {
      setLanguage(lang);
      await changeLanguage(lang);
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach(win => {
        win.webContents.send('language-changed', lang);
      });
      return { success: true };
    } catch (error) {
      logger.error('set-language error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-supported-languages', () => {
    try {
      return getSupportedLanguages();
    } catch (err) {
      logger.error('get-supported-languages failed:', err);
      throw err;
    }
  });

  ipcMain.handle('translate', (_event, key: string, options?: Record<string, unknown>) => {
    try {
      return t(key, options as Record<string, any>);
    } catch (err) {
      logger.error('translate failed:', err);
      throw err;
    }
  });

  ipcMain.handle('translate-batch', (_event, entries: Array<{ key: string; options?: Record<string, unknown> }>) => {
    try {
      return entries.map(({ key, options }) => t(key, options as Record<string, any>));
    } catch (err) {
      logger.error('translate-batch failed:', err);
      throw err;
    }
  });

  ipcMain.handle('get-reverse-translation-map', () => {
    try {
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
    } catch (err) {
      logger.error('get-reverse-translation-map failed:', err);
      throw err;
    }
  });
}
