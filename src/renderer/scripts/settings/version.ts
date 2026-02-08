/**
 * Version check logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { showAlert } from '../shared/dialog';

async function loadVersion(): Promise<void> {
  try {
    const version = await ipc.invoke('get-app-version');
    (document.getElementById('appVersion') as HTMLElement).textContent = version || '-';
  } catch (error) {
    console.error('Failed to get version:', error);
  }
}

export function initVersion(): void {
  loadVersion();

  const checkUpdateBtn = document.getElementById('checkUpdateBtn') as HTMLButtonElement;
  checkUpdateBtn.addEventListener('click', async () => {
    checkUpdateBtn.disabled = true;
    const checkingText = await t('settings.checking');
    checkUpdateBtn.innerHTML = '<span class="loading"></span>' + checkingText;

    try {
      const result = await ipc.invoke('check-for-updates');
      if (!result.success && result.error) {
        await showAlert({ message: result.error });
      }
    } catch (error) {
      console.error('Update check failed:', error);
      await showAlert({ message: await t('settings.updateCheckFailed') });
    } finally {
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = await t('settings.checkUpdate');
    }
  });
}
