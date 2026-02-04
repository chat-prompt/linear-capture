import { globalShortcut } from 'electron';
import { logger } from '../services/utils/logger';

export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+L';

// Currently registered shortcut
let currentShortcut: string | null = null;
let currentCallback: (() => void) | null = null;

/**
 * Register global hotkey for screen capture
 */
export function registerHotkey(callback: () => void, shortcut?: string): boolean {
  const key = shortcut || DEFAULT_SHORTCUT;

   try {
     const success = globalShortcut.register(key, callback);
     if (success) {
       logger.log(`Global hotkey registered: ${key}`);
       currentShortcut = key;
       currentCallback = callback;
     } else {
       logger.error(`Failed to register hotkey: ${key}`);
     }
     return success;
   } catch (error) {
     logger.error('Error registering hotkey:', error);
     return false;
   }
}

/**
 * Unregister all global hotkeys
 */
export function unregisterAllHotkeys(): void {
   globalShortcut.unregisterAll();
   logger.log('All global hotkeys unregistered');
 }

/**
 * Check if hotkey is registered
 */
export function isHotkeyRegistered(shortcut?: string): boolean {
  const key = shortcut || DEFAULT_SHORTCUT;
  return globalShortcut.isRegistered(key);
}

/**
 * Get currently registered shortcut
 */
export function getCurrentShortcut(): string | null {
  return currentShortcut;
}

/**
 * Update hotkey to a new shortcut
 * Unregisters old shortcut and registers new one
 */
export function updateHotkey(newShortcut: string): boolean {
   if (!currentCallback) {
     logger.error('No callback registered, cannot update hotkey');
     return false;
   }

   // Validate first
   const validation = validateHotkey(newShortcut);
   if (!validation.valid) {
     logger.error(`Invalid hotkey: ${validation.error}`);
     return false;
   }

   // Unregister old shortcut if exists
   if (currentShortcut) {
     try {
       globalShortcut.unregister(currentShortcut);
       logger.log(`Unregistered old hotkey: ${currentShortcut}`);
     } catch (error) {
       logger.error('Error unregistering old hotkey:', error);
     }
   }

   // Register new shortcut
   try {
     const success = globalShortcut.register(newShortcut, currentCallback);
     if (success) {
       logger.log(`Hotkey updated to: ${newShortcut}`);
       currentShortcut = newShortcut;
       return true;
     } else {
       logger.error(`Failed to register new hotkey: ${newShortcut}`);
       // Try to re-register old shortcut
       if (currentShortcut) {
         globalShortcut.register(currentShortcut, currentCallback);
       }
       return false;
     }
   } catch (error) {
     logger.error('Error registering new hotkey:', error);
     // Try to re-register old shortcut
     if (currentShortcut) {
       try {
         globalShortcut.register(currentShortcut, currentCallback);
       } catch (e) {
         // Ignore
       }
     }
     return false;
   }
 }

/**
 * Validate hotkey format
 * Returns { valid: boolean, error?: string }
 */
export function validateHotkey(shortcut: string): { valid: boolean; error?: string } {
  if (!shortcut || shortcut.trim() === '') {
    return { valid: false, error: 'Hotkey cannot be empty' };
  }

  const parts = shortcut.split('+').map(p => p.trim());
  
  if (parts.length < 2) {
    return { valid: false, error: 'Hotkey must include at least one modifier and a key' };
  }

  // Valid modifiers
  const validModifiers = ['CommandOrControl', 'Command', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta'];
  
  // Valid keys (letters, numbers, function keys, special keys)
  const validKeys = [
    // Letters
    ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
    // Numbers
    ...Array.from({ length: 10 }, (_, i) => String(i)),
    // Function keys
    ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
    // Special keys
    'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
    'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
    'Escape', 'Esc', 'VolumeUp', 'VolumeDown', 'VolumeMute',
    'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
    'PrintScreen', 'Plus', 'Minus', 'numadd', 'numsub', 'numdec',
  ];

  // Check that we have at least one modifier
  const hasModifier = parts.some(p => validModifiers.includes(p));
  if (!hasModifier) {
    return { valid: false, error: 'Hotkey must include a modifier (Cmd/Ctrl/Alt/Shift)' };
  }

  // The last part should be the main key
  const mainKey = parts[parts.length - 1];
  const isValidKey = validKeys.includes(mainKey) || 
                     validKeys.includes(mainKey.toUpperCase()) ||
                     (mainKey.length === 1 && /[a-zA-Z0-9]/.test(mainKey));
  
  if (!isValidKey && !validModifiers.includes(mainKey)) {
    return { valid: false, error: `Invalid key: ${mainKey}` };
  }

  // Check for system reserved shortcuts (basic check)
  const lowerShortcut = shortcut.toLowerCase();
  const reservedShortcuts = [
    'commandorcontrol+q',  // Quit
    'commandorcontrol+w',  // Close window
    'commandorcontrol+h',  // Hide
    'commandorcontrol+m',  // Minimize
    'command+q',
    'command+w',
    'command+h',
    'command+m',
    'control+q',
    'control+w',
  ];

  if (reservedShortcuts.includes(lowerShortcut)) {
    return { valid: false, error: 'This shortcut is reserved by the system' };
  }

  return { valid: true };
}

/**
 * Format hotkey for display (convert to platform-specific symbols)
 */
export function formatHotkeyForDisplay(shortcut: string): string {
  if (process.platform === 'darwin') {
    return shortcut
      .replace(/CommandOrControl/g, '⌘')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, '⌃')
      .replace(/Ctrl/g, '⌃')
      .replace(/Alt/g, '⌥')
      .replace(/Option/g, '⌥')
      .replace(/Shift/g, '⇧')
      .replace(/\+/g, ' + ');
  } else {
    return shortcut
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/Command/g, 'Ctrl')
      .replace(/\+/g, ' + ');
  }
}
