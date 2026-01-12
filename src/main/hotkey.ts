import { globalShortcut } from 'electron';

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+L';

/**
 * Register global hotkey for screen capture
 */
export function registerHotkey(callback: () => void, shortcut?: string): boolean {
  const key = shortcut || DEFAULT_SHORTCUT;

  try {
    const success = globalShortcut.register(key, callback);
    if (success) {
      console.log(`Global hotkey registered: ${key}`);
    } else {
      console.error(`Failed to register hotkey: ${key}`);
    }
    return success;
  } catch (error) {
    console.error('Error registering hotkey:', error);
    return false;
  }
}

/**
 * Unregister all global hotkeys
 */
export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
  console.log('All global hotkeys unregistered');
}

/**
 * Check if hotkey is registered
 */
export function isHotkeyRegistered(shortcut?: string): boolean {
  const key = shortcut || DEFAULT_SHORTCUT;
  return globalShortcut.isRegistered(key);
}
