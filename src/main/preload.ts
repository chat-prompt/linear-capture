/**
 * Preload Script - Secure bridge between main and renderer processes
 *
 * Exposes a whitelisted set of IPC channels via contextBridge.
 * Channel lists derived from src/types/ipc-channels.ts type maps.
 */

import { contextBridge, ipcRenderer, shell } from 'electron';

// Whitelisted invoke channels (ipcRenderer.invoke / ipcMain.handle)
const INVOKE_CHANNELS = [
  // Linear
  'create-issue',
  // Capture
  'close-window', 'cancel', 'remove-capture', 'add-capture', 'reanalyze',
  // Settings
  'get-settings', 'validate-token', 'save-settings', 'clear-settings',
  'open-settings', 'close-settings', 'check-for-updates', 'get-app-version',
  // Hotkey
  'get-hotkey', 'validate-hotkey', 'save-hotkey', 'reset-hotkey',
  // Window
  'set-traffic-lights-visible',
  // Slack OAuth
  'slack-connect', 'slack-disconnect', 'slack-status', 'slack-channels', 'slack-search',
  // Notion OAuth
  'notion-connect', 'notion-disconnect', 'notion-status', 'notion-search', 'notion-get-content',
  // Gmail OAuth
  'gmail-connect', 'gmail-disconnect', 'gmail-status', 'gmail-search',
  // i18n
  'get-device-id', 'get-language', 'set-language', 'get-supported-languages',
  'translate', 'get-reverse-translation-map',
  // Context / Search
  'ai-recommend', 'context-semantic-search', 'context.getRelated',
  // Sync
  'sync:get-slack-channels', 'sync:set-slack-channels',
  'sync:get-status', 'sync:trigger', 'sync:reset-cursor', 'sync:delete-source',
] as const;

// Whitelisted fire-and-forget channels (ipcRenderer.send / ipcMain.on)
const SEND_CHANNELS = [
  'open-screen-capture-settings',
  'close-onboarding',
  'onboarding-complete',
] as const;

// Whitelisted event channels (webContents.send / ipcRenderer.on)
const ON_CHANNELS = [
  'capture-ready', 'capture-added', 'capture-removed',
  'ai-analysis-ready',
  'settings-updated', 'linear-data-updated',
  'hotkey-changed', 'language-changed',
  'sync:progress',
  'slack-connected', 'slack-oauth-error',
  'notion-connected', 'notion-oauth-error',
  'gmail-connected', 'gmail-oauth-error',
] as const;

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if ((INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`IPC invoke not allowed: ${channel}`);
  },

  send: (channel: string, ...args: unknown[]) => {
    if ((SEND_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.send(channel, ...args);
      return;
    }
    throw new Error(`IPC send not allowed: ${channel}`);
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if ((ON_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
      return;
    }
    throw new Error(`IPC on not allowed: ${channel}`);
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  openExternal: (url: string) => shell.openExternal(url),
});
