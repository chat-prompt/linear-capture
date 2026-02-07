/**
 * Data sync logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import {
  slackDocCount,
  slackLastSync,
  slackDetailSep,
  syncSlackBtn,
  allSlackChannels,
  channelSelectionDone,
} from './slack';
import {
  notionDocCount,
  notionLastSync,
  notionDetailSep,
  syncNotionBtn,
} from './notion';
import {
  gmailDocCount,
  gmailLastSync,
  gmailDetailSep,
  syncGmailBtn,
} from './gmail';
import {
  showChannelSelectionModal,
  setPendingSyncAfterChannelSelection,
} from './channel-modal';

// Elements
const syncLinearBtn = document.getElementById('syncLinearBtn') as HTMLButtonElement;
const linearRow = document.getElementById('linearRow') as HTMLElement;
const linearDocCount = document.getElementById('linearDocCount') as HTMLElement;
const linearLastSync = document.getElementById('linearLastSync') as HTMLElement;
const linearDetailSep = document.getElementById('linearDetailSep') as HTMLElement;
const linearStatusText = document.getElementById('linearStatusText') as HTMLElement;

// State
const activeSyncs = new Map<string, HTMLElement>();
const lastSyncElements: Record<string, HTMLElement> = {
  slack: slackLastSync,
  notion: notionLastSync,
  gmail: gmailLastSync,
  linear: linearLastSync,
};

// --- Functions ---

async function formatLastSync(timestamp: number): Promise<string | null> {
  if (!timestamp) return null;
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  const prefix = await t('sync.lastSyncPrefix');
  if (minutes < 1) return `${prefix} ${await t('sync.justNow')}`;
  if (minutes < 60) return `${prefix} ${await t('sync.minutesAgo', { count: minutes })}`;
  if (hours < 24) return `${prefix} ${await t('sync.hoursAgo', { count: hours })}`;
  return `${prefix} ${await t('sync.daysAgo', { count: days })}`;
}

async function formatDocCount(count: number, unit: string = 'docs'): Promise<string> {
  if (!count) return await t('sync.notSyncedYet');
  const label = await t(`sync.synced_${unit}`);
  return `${count.toLocaleString()} ${label}`;
}

export async function loadSyncStatus(): Promise<void> {
  try {
    const [slackStatus, notionStatus, gmailStatus, syncStatus] = await Promise.all([
      ipc.invoke('slack-status'),
      ipc.invoke('notion-status'),
      ipc.invoke('gmail-status'),
      ipc.invoke('sync:get-status'),
    ]);

    const linearConnected = !!(await ipc.invoke('get-settings'))?.linearApiToken;

    if (slackStatus.connected) {
      const src = syncStatus?.sources?.slack;
      slackDocCount.textContent = await formatDocCount(src?.documentCount, 'messages');
      slackDocCount.style.display = '';
      const lastSync = src?.lastSync;
      if (lastSync) {
        slackLastSync.textContent = await formatLastSync(lastSync) || '';
        slackLastSync.style.display = '';
        slackDetailSep.style.display = '';
      } else {
        slackLastSync.style.display = 'none';
        slackDetailSep.style.display = 'none';
      }
    } else {
      slackDocCount.textContent = '';
      slackLastSync.style.display = 'none';
      slackDetailSep.style.display = 'none';
    }

    if (notionStatus.connected) {
      const src = syncStatus?.sources?.notion;
      notionDocCount.textContent = await formatDocCount(src?.documentCount, 'docs');
      notionDocCount.style.display = '';
      const lastSync = src?.lastSync;
      if (lastSync) {
        notionLastSync.textContent = await formatLastSync(lastSync) || '';
        notionLastSync.style.display = '';
        notionDetailSep.style.display = '';
      } else {
        notionLastSync.style.display = 'none';
        notionDetailSep.style.display = 'none';
      }
    } else {
      notionDocCount.textContent = '';
      notionLastSync.style.display = 'none';
      notionDetailSep.style.display = 'none';
    }

    if (linearConnected) {
      syncLinearBtn.disabled = false;
      linearRow.classList.remove('disabled');
      linearStatusText.style.display = 'none';
      const src = syncStatus?.sources?.linear;
      linearDocCount.textContent = await formatDocCount(src?.documentCount, 'issues');
      linearDocCount.style.display = '';
      const lastSync = src?.lastSync;
      if (lastSync) {
        linearLastSync.textContent = await formatLastSync(lastSync) || '';
        linearLastSync.style.display = '';
        linearDetailSep.style.display = '';
      } else {
        linearLastSync.style.display = 'none';
        linearDetailSep.style.display = 'none';
      }
    } else {
      syncLinearBtn.disabled = true;
      linearRow.classList.add('disabled');
      linearDocCount.textContent = '';
      linearLastSync.style.display = 'none';
      linearDetailSep.style.display = 'none';
      linearStatusText.textContent = await t('sync.notConnected');
      linearStatusText.style.display = '';
    }

    if (gmailStatus.connected) {
      const src = syncStatus?.sources?.gmail;
      gmailDocCount.textContent = await formatDocCount(src?.documentCount, 'emails');
      gmailDocCount.style.display = '';
      const lastSync = src?.lastSync;
      if (lastSync) {
        gmailLastSync.textContent = await formatLastSync(lastSync) || '';
        gmailLastSync.style.display = '';
        gmailDetailSep.style.display = '';
      } else {
        gmailLastSync.style.display = 'none';
        gmailDetailSep.style.display = 'none';
      }
    } else {
      gmailDocCount.textContent = '';
      gmailLastSync.style.display = 'none';
      gmailDetailSep.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to load sync status:', error);
  }
}

export async function triggerSync(source: string, btn: HTMLButtonElement, lastSyncEl: HTMLElement): Promise<void> {
  btn.disabled = true;
  btn.classList.add('syncing');
  btn.textContent = await t('sync.syncing');

  const row = btn.closest('.integration-row');
  const docCountEl = row?.querySelector('.integration-doc-count') as HTMLElement | null;
  const sepEl = row?.querySelector('.integration-detail-sep') as HTMLElement | null;
  if (docCountEl) docCountEl.style.display = 'none';
  if (sepEl) sepEl.style.display = 'none';

  if (lastSyncEl) {
    lastSyncEl.textContent = await t('sync.syncing');
    lastSyncEl.style.display = '';
  }
  activeSyncs.set(source, lastSyncEl);

  try {
    const result = await ipc.invoke('sync:trigger', source);
    if (result.success) {
      const itemsText = result.itemsSynced === 1 ? 'item' : 'items';
      if (lastSyncEl) {
        lastSyncEl.textContent = `Synced ${result.itemsSynced} ${itemsText}`;
      }
      setTimeout(() => {
        loadSyncStatus();
      }, 3000);
    } else {
      if (lastSyncEl) {
        lastSyncEl.textContent = result.error || await t('sync.failed');
      }
    }
  } catch (error) {
    console.error(`Sync ${source} error:`, error);
    if (lastSyncEl) {
      lastSyncEl.textContent = await t('sync.failed');
    }
  } finally {
    btn.classList.remove('syncing');
    btn.textContent = await t('sync.syncNow');
    btn.disabled = false;
    activeSyncs.delete(source);
  }
}

// --- Init ---

export function initSyncStatus(): void {
  loadSyncStatus();
  setInterval(() => loadSyncStatus(), 60000);

  // Sync progress listener
  ipc.on('sync:progress', (progress: any) => {
    const lastSyncEl = activeSyncs.get(progress.source);
    if (!lastSyncEl) return;

    if (progress.phase === 'complete') return;

    if (progress.total > 0) {
      lastSyncEl.textContent = `(${progress.current}/${progress.total}) Syncing...`;
    } else {
      lastSyncEl.textContent = 'Discovering...';
    }
  });

  // Sync button click handlers
  syncSlackBtn.addEventListener('click', () => {
    if (!channelSelectionDone && allSlackChannels.length > 0) {
      setPendingSyncAfterChannelSelection(true);
      showChannelSelectionModal(allSlackChannels, 'first-sync');
      return;
    }
    triggerSync('slack', syncSlackBtn, slackLastSync);
  });

  syncNotionBtn.addEventListener('click', () => triggerSync('notion', syncNotionBtn, notionLastSync));
  syncLinearBtn.addEventListener('click', () => triggerSync('linear', syncLinearBtn, linearLastSync));
  syncGmailBtn.addEventListener('click', () => triggerSync('gmail', syncGmailBtn, gmailLastSync));

  // Settings updated listener
  ipc.on('settings-updated', () => loadSyncStatus());
}
