/**
 * Hotkey recording/saving logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';

// Elements
const hotkeyInput = document.getElementById('hotkeyInput') as HTMLInputElement;
const resetHotkeyBtn = document.getElementById('resetHotkeyBtn') as HTMLButtonElement;
const hotkeyHint = document.getElementById('hotkeyHint') as HTMLElement;
const hotkeyError = document.getElementById('hotkeyError') as HTMLElement;
const hotkeySuccess = document.getElementById('hotkeySuccess') as HTMLElement;

// State
let isRecording = false;
let currentHotkey = '';
let recordedKeys: string[] = [];

// --- Functions ---

export async function loadHotkey(): Promise<void> {
  try {
    const result = await ipc.invoke('get-hotkey');
    currentHotkey = result.hotkey;
    hotkeyInput.value = result.displayHotkey;
  } catch (error) {
    console.error('Failed to load hotkey:', error);
  }
}

function keyToAccelerator(key: string, code: string): string | null {
  const keyMap: Record<string, string> = {
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    ' ': 'Space',
    'Escape': 'Escape',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Enter': 'Return',
    'Tab': 'Tab',
  };

  if (keyMap[key]) return keyMap[key];

  // Function keys
  if (key.match(/^F\d+$/)) return key;

  // Letters and numbers
  if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    return key.toUpperCase();
  }

  return null;
}

function formatForDisplay(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, '\u2318')
    .replace(/Command/g, '\u2318')
    .replace(/Control/g, '\u2303')
    .replace(/Ctrl/g, '\u2303')
    .replace(/Alt/g, '\u2325')
    .replace(/Option/g, '\u2325')
    .replace(/Shift/g, '\u21E7')
    .replace(/\+/g, ' + ');
}

// --- Init ---

export function initHotkey(): void {
  loadHotkey();

  hotkeyInput.addEventListener('focus', async () => {
    isRecording = true;
    recordedKeys = [];
    hotkeyInput.classList.add('recording');
    hotkeyInput.value = await t('hotkey.pressKeys');
    hotkeyHint.textContent = await t('hotkey.pressModifier');
    hotkeyError.style.display = 'none';
    hotkeySuccess.style.display = 'none';
  });

  hotkeyInput.addEventListener('blur', () => {
    isRecording = false;
    hotkeyInput.classList.remove('recording');
    if (recordedKeys.length === 0) {
      loadHotkey();
    }
  });

  hotkeyInput.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];

    if (e.metaKey || e.ctrlKey) {
      parts.push('CommandOrControl');
    }
    if (e.altKey) {
      parts.push('Alt');
    }
    if (e.shiftKey) {
      parts.push('Shift');
    }

    const mainKey = keyToAccelerator(e.key, e.code);

    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
      if (parts.length > 0) {
        hotkeyInput.value = formatForDisplay(parts.join('+')) + ' + ...';
      }
      return;
    }

    if (parts.length === 0) {
      hotkeyError.textContent = await t('hotkey.needModifier');
      hotkeyError.style.display = 'block';
      hotkeySuccess.style.display = 'none';
      return;
    }

    if (!mainKey) {
      hotkeyError.textContent = await t('hotkey.invalidKeyType');
      hotkeyError.style.display = 'block';
      hotkeySuccess.style.display = 'none';
      return;
    }

    parts.push(mainKey);
    const accelerator = parts.join('+');

    hotkeyInput.value = formatForDisplay(accelerator);

    try {
      const validation = await ipc.invoke('validate-hotkey', accelerator);
      if (!validation.valid) {
        hotkeyError.textContent = validation.error;
        hotkeyError.style.display = 'block';
        hotkeySuccess.style.display = 'none';
        return;
      }

      const result = await ipc.invoke('save-hotkey', accelerator);
      if (result.success) {
        currentHotkey = result.hotkey;
        hotkeyInput.value = result.displayHotkey;
        hotkeySuccess.textContent = await t('hotkey.saved');
        hotkeySuccess.style.display = 'block';
        hotkeyError.style.display = 'none';
        hotkeyHint.textContent = await t('hotkey.updated');

        isRecording = false;
        hotkeyInput.classList.remove('recording');
        hotkeyInput.blur();

        setTimeout(async () => {
          hotkeySuccess.style.display = 'none';
          hotkeyHint.textContent = await t('hotkey.hint');
        }, 2000);
      } else {
        hotkeyError.textContent = result.error || await t('hotkey.saveFailed');
        hotkeyError.style.display = 'block';
        hotkeySuccess.style.display = 'none';
      }
    } catch (error) {
      console.error('Hotkey save error:', error);
      hotkeyError.textContent = await t('hotkey.saveFailed');
      hotkeyError.style.display = 'block';
      hotkeySuccess.style.display = 'none';
    }
  });

  resetHotkeyBtn.addEventListener('click', async () => {
    resetHotkeyBtn.disabled = true;
    resetHotkeyBtn.textContent = await t('common.loading');

    try {
      const result = await ipc.invoke('reset-hotkey');
      if (result.success) {
        currentHotkey = result.hotkey;
        hotkeyInput.value = result.displayHotkey;
        hotkeySuccess.textContent = await t('hotkey.resetSuccess');
        hotkeySuccess.style.display = 'block';
        hotkeyError.style.display = 'none';

        setTimeout(() => {
          hotkeySuccess.style.display = 'none';
        }, 2000);
      } else {
        hotkeyError.textContent = result.error || await t('hotkey.resetFailed');
        hotkeyError.style.display = 'block';
        hotkeySuccess.style.display = 'none';
      }
    } catch (error) {
      console.error('Reset hotkey error:', error);
      hotkeyError.textContent = await t('hotkey.resetFailed');
      hotkeyError.style.display = 'block';
    } finally {
      resetHotkeyBtn.disabled = false;
      resetHotkeyBtn.textContent = await t('common.reset');
    }
  });
}
