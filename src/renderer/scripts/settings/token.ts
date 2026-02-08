/**
 * Token input/validation/save logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { showConfirm } from '../shared/dialog';
import { loadSyncStatus } from './sync-status';

// Elements
const tokenInput = document.getElementById('token') as HTMLInputElement;
const statusIcon = document.getElementById('statusIcon') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const userInfoRow = document.getElementById('userInfoRow') as HTMLElement;
const userInfo = document.getElementById('userInfo') as HTMLElement;
const errorMessage = document.getElementById('errorMessage') as HTMLElement;
const clearBtn = document.getElementById('clearBtn') as HTMLElement;
const validateBtn = document.getElementById('validateBtn') as HTMLButtonElement;

// State
let isValidated = false;
let validatedUser: any = null;

// --- Status display functions ---

async function showPending(): Promise<void> {
  statusIcon.textContent = '\u23F3';
  statusText.textContent = await t('settings.enterToken');
  statusText.className = 'status-value status-pending';
  userInfoRow.style.display = 'none';
  errorMessage.style.display = 'none';
  isValidated = false;
  validatedUser = null;
  validateBtn.className = 'btn-primary';
  validateBtn.disabled = false;
}

async function showValidating(): Promise<void> {
  statusIcon.innerHTML = '<span class="loading"></span>';
  statusText.textContent = await t('settings.validating');
  statusText.className = 'status-value status-pending';
  userInfoRow.style.display = 'none';
  errorMessage.style.display = 'none';
  validateBtn.disabled = true;
}

async function showSuccess(user: any): Promise<void> {
  statusIcon.textContent = '\u2705';
  statusText.textContent = await t('settings.connected');
  statusText.className = 'status-value status-success';
  userInfoRow.style.display = 'flex';
  userInfo.textContent = user.name + ' (' + user.email + ')';
  errorMessage.style.display = 'none';
  validateBtn.className = 'btn-primary';
  validateBtn.disabled = true;
  validatedUser = user;
  isValidated = true;
}

async function showError(message: string): Promise<void> {
  statusIcon.textContent = '\u274C';
  statusText.textContent = await t('settings.connectionFailed');
  statusText.className = 'status-value status-error';
  userInfoRow.style.display = 'none';
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  validateBtn.className = 'btn-primary';
  validateBtn.disabled = false;
  isValidated = false;
  validatedUser = null;
}

// --- Load existing settings ---

export async function loadSettings(): Promise<void> {
  try {
    const settings = await ipc.invoke('get-settings');

    if (settings && settings.linearApiToken) {
      tokenInput.value = settings.linearApiToken;
      clearBtn.style.display = 'block';

      if (settings.userInfo) {
        showSuccess(settings.userInfo);
        isValidated = true;
        validateBtn.disabled = true;
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// --- Init ---

export function initToken(): void {
  // Token input change handler
  tokenInput.addEventListener('input', async () => {
    await showPending();
    validateBtn.textContent = await t('common.validateAndSave');
    validateBtn.disabled = false;
    if (tokenInput.value.trim()) {
      clearBtn.style.display = 'block';
    } else {
      clearBtn.style.display = 'none';
    }
  });

  // Validate & save button
  validateBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showError(await t('errors.tokenRequired'));
      return;
    }

    await showValidating();

    try {
      const result = await ipc.invoke('validate-token', token);

      if (result.valid && result.user) {
        validateBtn.innerHTML = '<span class="loading"></span>' + await t('settings.saving');

        try {
          const saveResult = await ipc.invoke('save-settings', {
            linearApiToken: token,
            userInfo: result.user
          });

          if (saveResult.success) {
            await showSuccess(result.user);
            validateBtn.textContent = await t('settings.saved');

            await loadSyncStatus();

            setTimeout(async () => {
              validateBtn.textContent = await t('common.validateAndSave');
              validateBtn.disabled = true;
            }, 1500);
          } else {
            await showError(saveResult.error || await t('settings.saveFailed'));
            validateBtn.textContent = await t('common.validateAndSave');
            validateBtn.disabled = false;
          }
        } catch (saveError) {
          await showError(await t('errors.saveError'));
          validateBtn.textContent = await t('common.validateAndSave');
          validateBtn.disabled = false;
        }
      } else {
        await showError(result.error || await t('settings.invalidToken'));
        validateBtn.textContent = await t('common.validateAndSave');
      }
    } catch (error) {
      await showError(await t('errors.validationError'));
      validateBtn.textContent = await t('common.validateAndSave');
    }
  });

  // Clear button
  clearBtn.addEventListener('click', async () => {
    const confirmMsg = await t('settings.deleteConfirm');
    const confirmed = await showConfirm({ message: confirmMsg, type: 'danger', confirmText: 'Delete', cancelText: 'Cancel' });
    if (confirmed) {
      try {
        await ipc.invoke('clear-settings');
        tokenInput.value = '';
        clearBtn.style.display = 'none';
        await showPending();
      } catch (error) {
        showError(await t('settings.deleteError'));
      }
    }
  });

  // Enter to validate
  tokenInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      validateBtn.click();
    }
  });

  // Load settings on init
  loadSettings();
}
