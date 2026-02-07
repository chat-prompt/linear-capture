/**
 * Notion connection logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { loadSyncStatus } from './sync-status';

// Elements
const notionStatusText = document.getElementById('notionStatusText') as HTMLElement;
const notionConnectBtn = document.getElementById('notionConnectBtn') as HTMLButtonElement;
const notionError = document.getElementById('notionError') as HTMLElement;
const notionWorkspace = document.getElementById('notionWorkspace') as HTMLElement;
export const notionDocCount = document.getElementById('notionDocCount') as HTMLElement;
export const notionLastSync = document.getElementById('notionLastSync') as HTMLElement;
export const notionDetailSep = document.getElementById('notionDetailSep') as HTMLElement;
const notionMenu = document.getElementById('notionMenu') as HTMLElement;
export const syncNotionBtn = document.getElementById('syncNotionBtn') as HTMLButtonElement;

// --- Functions ---

export async function loadNotionStatus(): Promise<void> {
  try {
    const status = await ipc.invoke('notion-status');
    updateNotionUI(status);
  } catch (error) {
    console.error('Failed to load Notion status:', error);
  }
}

export async function updateNotionUI(status: any): Promise<void> {
  if (status.connected) {
    const workspaceName = status.workspace?.name || 'Workspace';
    notionWorkspace.textContent = workspaceName;
    notionWorkspace.style.display = '';
    notionStatusText.style.display = 'none';
    notionConnectBtn.style.display = 'none';
    syncNotionBtn.style.display = '';
    syncNotionBtn.disabled = false;
    notionMenu.style.display = '';
  } else {
    notionWorkspace.style.display = 'none';
    notionDocCount.textContent = '';
    notionLastSync.style.display = 'none';
    notionDetailSep.style.display = 'none';
    notionStatusText.textContent = await t('notion.notConnected');
    notionStatusText.style.display = '';
    notionConnectBtn.textContent = await t('common.connect');
    notionConnectBtn.style.display = '';
    syncNotionBtn.style.display = 'none';
    notionMenu.style.display = 'none';
  }
  notionError.style.display = 'none';
}

// --- Init ---

export function initNotion(): void {
  notionConnectBtn.addEventListener('click', async () => {
    notionConnectBtn.disabled = true;
    notionError.style.display = 'none';

    try {
      notionConnectBtn.textContent = await t('notion.connecting');
      const result = await ipc.invoke('notion-connect');
      if (!result.success) {
        notionError.textContent = result.error || await t('notion.connectFailed');
        notionError.style.display = 'block';
        await updateNotionUI({ connected: false });
      }
    } catch (error: any) {
      console.error('Notion action error:', error);
      notionError.textContent = error.message || await t('common.error');
      notionError.style.display = 'block';
    } finally {
      notionConnectBtn.disabled = false;
      notionConnectBtn.textContent = await t('common.connect');
    }
  });

  ipc.on('notion-connected', (result: any) => {
    console.log('Notion connected:', result);
    updateNotionUI({
      connected: true,
      workspace: result.workspace,
      user: result.user,
    });
    loadSyncStatus();
  });

  ipc.on('notion-oauth-error', (data: any) => {
    console.error('Notion OAuth error:', data.error);
    notionError.textContent = data.error || 'OAuth failed';
    notionError.style.display = 'block';
    updateNotionUI({ connected: false });
  });

  loadNotionStatus();
}
