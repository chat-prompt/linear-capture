/**
 * Gmail connection logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { loadSyncStatus } from './sync-status';

// Elements
const gmailStatusText = document.getElementById('gmailStatusText') as HTMLElement;
const gmailConnectBtn = document.getElementById('gmailConnectBtn') as HTMLButtonElement;
const gmailError = document.getElementById('gmailError') as HTMLElement;
const gmailWorkspace = document.getElementById('gmailWorkspace') as HTMLElement;
export const gmailDocCount = document.getElementById('gmailDocCount') as HTMLElement;
export const gmailLastSync = document.getElementById('gmailLastSync') as HTMLElement;
export const gmailDetailSep = document.getElementById('gmailDetailSep') as HTMLElement;
const gmailMenu = document.getElementById('gmailMenu') as HTMLElement;
export const syncGmailBtn = document.getElementById('syncGmailBtn') as HTMLButtonElement;

// --- Functions ---

export async function loadGmailStatus(): Promise<void> {
  try {
    const status = await ipc.invoke('gmail-status');
    updateGmailUI(status);
  } catch (error) {
    console.error('Failed to load Gmail status:', error);
  }
}

export async function updateGmailUI(status: any): Promise<void> {
  if (status.connected) {
    const email = status.user?.email || 'Connected';
    gmailWorkspace.textContent = email;
    gmailWorkspace.style.display = '';
    gmailStatusText.style.display = 'none';
    gmailConnectBtn.style.display = 'none';
    syncGmailBtn.style.display = '';
    syncGmailBtn.disabled = false;
    gmailMenu.style.display = '';
  } else {
    gmailWorkspace.style.display = 'none';
    gmailDocCount.textContent = '';
    gmailLastSync.style.display = 'none';
    gmailDetailSep.style.display = 'none';
    gmailStatusText.textContent = await t('gmail.notConnected');
    gmailStatusText.style.display = '';
    gmailConnectBtn.textContent = await t('common.connect');
    gmailConnectBtn.style.display = '';
    syncGmailBtn.style.display = 'none';
    gmailMenu.style.display = 'none';
  }
  gmailError.style.display = 'none';
}

// --- Init ---

export function initGmail(): void {
  gmailConnectBtn.addEventListener('click', async () => {
    gmailConnectBtn.disabled = true;
    gmailError.style.display = 'none';

    try {
      gmailConnectBtn.textContent = await t('gmail.connecting');
      const result = await ipc.invoke('gmail-connect');
      if (!result.success) {
        gmailError.textContent = result.error || await t('gmail.connectFailed');
        gmailError.style.display = 'block';
        await updateGmailUI({ connected: false });
      }
    } catch (error: any) {
      console.error('Gmail action error:', error);
      gmailError.textContent = error.message || await t('common.error');
      gmailError.style.display = 'block';
    } finally {
      gmailConnectBtn.disabled = false;
      gmailConnectBtn.textContent = await t('common.connect');
    }
  });

  ipc.on('gmail-connected', (result: any) => {
    console.log('Gmail connected:', result);
    updateGmailUI({
      connected: true,
      user: result.user,
    });
    loadSyncStatus();
  });

  ipc.on('gmail-oauth-error', (data: any) => {
    console.error('Gmail OAuth error:', data.error);
    gmailError.textContent = data.error || 'OAuth failed';
    gmailError.style.display = 'block';
    updateGmailUI({ connected: false });
  });

  loadGmailStatus();
}
