/**
 * Data sync logic for settings page
 *
 * Performance optimizations:
 * - Each source updates independently (no Promise.all blocking)
 * - i18n labels pre-fetched in a single batch IPC call
 * - Sync status cached on main process (30s TTL)
 */
import { ipc } from '../shared/ipc';
import { t, tBatch } from '../shared/i18n';
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

// --- i18n label cache (fetched once per language) ---

interface SyncLabels {
  lastSyncPrefix: string;
  justNow: string;
  notSyncedYet: string;
  syncedMessages: string;
  syncedDocs: string;
  syncedIssues: string;
  syncedEmails: string;
  notConnected: string;
}

let cachedLabels: SyncLabels | null = null;

async function getLabels(): Promise<SyncLabels> {
  if (cachedLabels) return cachedLabels;

  const values = await tBatch([
    { key: 'sync.lastSyncPrefix' },
    { key: 'sync.justNow' },
    { key: 'sync.notSyncedYet' },
    { key: 'sync.synced_messages' },
    { key: 'sync.synced_docs' },
    { key: 'sync.synced_issues' },
    { key: 'sync.synced_emails' },
    { key: 'sync.notConnected' },
  ]);

  cachedLabels = {
    lastSyncPrefix: values[0],
    justNow: values[1],
    notSyncedYet: values[2],
    syncedMessages: values[3],
    syncedDocs: values[4],
    syncedIssues: values[5],
    syncedEmails: values[6],
    notConnected: values[7],
  };
  return cachedLabels;
}

/** Invalidate label cache on language change */
export function invalidateSyncLabels(): void {
  cachedLabels = null;
}

// --- Formatting helpers (synchronous, use pre-fetched labels) ---

function formatLastSyncText(timestamp: number, labels: SyncLabels): string | null {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  const prefix = labels.lastSyncPrefix;
  if (minutes < 1) return `${prefix} ${labels.justNow}`;
  if (minutes < 60) return `${prefix} ${minutes}m`;
  if (hours < 24) return `${prefix} ${hours}h`;
  return `${prefix} ${days}d`;
}

function formatDocCountText(count: number, unitLabel: string, notSyncedLabel: string): string {
  if (!count) return notSyncedLabel;
  return `${count.toLocaleString()} ${unitLabel}`;
}

// --- Per-source UI updater ---

function updateSourceUI(
  connected: boolean,
  syncData: { documentCount?: number; lastSync?: number } | undefined,
  labels: SyncLabels,
  unitLabel: string,
  docCountEl: HTMLElement,
  lastSyncEl: HTMLElement,
  detailSepEl: HTMLElement,
): void {
  if (connected) {
    docCountEl.textContent = formatDocCountText(
      syncData?.documentCount || 0, unitLabel, labels.notSyncedYet
    );
    docCountEl.style.display = '';
    if (syncData?.lastSync) {
      lastSyncEl.textContent = formatLastSyncText(syncData.lastSync, labels) || '';
      lastSyncEl.style.display = '';
      detailSepEl.style.display = '';
    } else {
      lastSyncEl.style.display = 'none';
      detailSepEl.style.display = 'none';
    }
  } else {
    docCountEl.textContent = '';
    lastSyncEl.style.display = 'none';
    detailSepEl.style.display = 'none';
  }
}

// --- Main load function ---

export async function loadSyncStatus(): Promise<void> {
  try {
    // 1) Pre-fetch all i18n labels in one IPC call (was 20+ individual calls)
    const labels = await getLabels();

    // 2) Fire sync status (potentially slow) as a shared promise
    const syncStatusPromise = ipc.invoke('sync:get-status').catch(() => ({ initialized: false }));

    // 3) Each source loads independently - no single call blocks the rest
    await Promise.all([
      // Slack
      (async () => {
        try {
          const [slackStatus, syncStatus] = await Promise.all([
            ipc.invoke('slack-status'),
            syncStatusPromise,
          ]);
          updateSourceUI(
            slackStatus.connected, syncStatus?.sources?.slack, labels,
            labels.syncedMessages, slackDocCount, slackLastSync, slackDetailSep,
          );
        } catch (e) { console.error('Slack status error:', e); }
      })(),

      // Notion
      (async () => {
        try {
          const [notionStatus, syncStatus] = await Promise.all([
            ipc.invoke('notion-status'),
            syncStatusPromise,
          ]);
          updateSourceUI(
            notionStatus.connected, syncStatus?.sources?.notion, labels,
            labels.syncedDocs, notionDocCount, notionLastSync, notionDetailSep,
          );
        } catch (e) { console.error('Notion status error:', e); }
      })(),

      // Gmail
      (async () => {
        try {
          const [gmailStatus, syncStatus] = await Promise.all([
            ipc.invoke('gmail-status'),
            syncStatusPromise,
          ]);
          updateSourceUI(
            gmailStatus.connected, syncStatus?.sources?.gmail, labels,
            labels.syncedEmails, gmailDocCount, gmailLastSync, gmailDetailSep,
          );
        } catch (e) { console.error('Gmail status error:', e); }
      })(),

      // Linear (uses settings check instead of OAuth status)
      (async () => {
        try {
          const [settings, syncStatus] = await Promise.all([
            ipc.invoke('get-settings'),
            syncStatusPromise,
          ]);
          const linearConnected = !!settings?.linearApiToken;
          if (linearConnected) {
            syncLinearBtn.disabled = false;
            linearRow.classList.remove('disabled');
            linearStatusText.style.display = 'none';
            updateSourceUI(
              true, syncStatus?.sources?.linear, labels,
              labels.syncedIssues, linearDocCount, linearLastSync, linearDetailSep,
            );
          } else {
            syncLinearBtn.disabled = true;
            linearRow.classList.add('disabled');
            linearDocCount.textContent = '';
            linearLastSync.style.display = 'none';
            linearDetailSep.style.display = 'none';
            linearStatusText.textContent = labels.notConnected;
            linearStatusText.style.display = '';
          }
        } catch (e) { console.error('Linear status error:', e); }
      })(),
    ]);
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
