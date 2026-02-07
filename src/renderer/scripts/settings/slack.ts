/**
 * Slack connection logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { showChannelSelectionModal } from './channel-modal';
import { loadSyncStatus } from './sync-status';

// Elements
const slackStatusText = document.getElementById('slackStatusText') as HTMLElement;
const slackConnectBtn = document.getElementById('slackConnectBtn') as HTMLButtonElement;
const slackError = document.getElementById('slackError') as HTMLElement;
const slackWorkspace = document.getElementById('slackWorkspace') as HTMLElement;
export const slackDocCount = document.getElementById('slackDocCount') as HTMLElement;
export const slackLastSync = document.getElementById('slackLastSync') as HTMLElement;
export const slackDetailSep = document.getElementById('slackDetailSep') as HTMLElement;
const slackMenu = document.getElementById('slackMenu') as HTMLElement;
export const syncSlackBtn = document.getElementById('syncSlackBtn') as HTMLButtonElement;

const slackChannelHint = document.getElementById('slackChannelHint') as HTMLElement;
const channelSummaryText = document.getElementById('channelSummaryText') as HTMLElement;
const editChannelsBtn = document.getElementById('editChannelsBtn') as HTMLElement;

// State (exported for use by channel-modal and sync-status)
export let allSlackChannels: any[] = [];
export let selectedChannelIds = new Set<string>();
export let channelSelectionDone = false;

// --- Functions ---

export function renderChannelList(
  container: HTMLElement,
  channels: any[],
  selectedIds: Set<string>,
  options: { onToggle?: (id: string, checked: boolean) => void; searchFilter?: string } = {}
): number {
  const { onToggle, searchFilter } = options;
  container.innerHTML = '';

  const filteredChannels = channels.filter((channel: any) => {
    if (!searchFilter) return true;
    return channel.name.toLowerCase().includes(searchFilter.toLowerCase());
  });

  if (filteredChannels.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.padding = '10px';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.color = '#888';
    emptyDiv.style.fontSize = '13px';
    t('slack.noChannels').then(text => emptyDiv.textContent = text || 'No channels found');
    container.appendChild(emptyDiv);
    return filteredChannels.length;
  }

  filteredChannels.forEach((channel: any) => {
    const item = document.createElement('div');
    item.className = 'channel-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `channel-${channel.id}`;
    checkbox.checked = selectedIds.has(channel.id);

    const label = document.createElement('label');
    label.htmlFor = `channel-${channel.id}`;
    label.textContent = `# ${channel.name}`;

    checkbox.addEventListener('change', () => {
      if (onToggle) onToggle(channel.id, checkbox.checked);
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    container.appendChild(item);
  });

  return filteredChannels.length;
}

export async function loadSlackStatus(): Promise<void> {
  try {
    const status = await ipc.invoke('slack-status');
    updateSlackUI(status);
  } catch (error) {
    console.error('Failed to load Slack status:', error);
  }
}

export async function updateSlackUI(status: any): Promise<void> {
  if (status.connected) {
    const workspaceName = status.workspace?.name || 'Workspace';
    slackWorkspace.textContent = workspaceName;
    slackWorkspace.style.display = '';
    slackStatusText.style.display = 'none';
    slackConnectBtn.style.display = 'none';
    syncSlackBtn.style.display = '';
    syncSlackBtn.disabled = false;
    slackMenu.style.display = '';

    slackChannelHint.style.display = 'block';
    (document.getElementById('slackRow') as HTMLElement).style.gridTemplateRows = 'auto auto auto';
    loadSlackChannels();
  } else {
    slackWorkspace.style.display = 'none';
    slackDocCount.textContent = '';
    slackLastSync.style.display = 'none';
    slackDetailSep.style.display = 'none';
    slackStatusText.textContent = await t('slack.notConnected');
    slackStatusText.style.display = '';
    slackConnectBtn.textContent = await t('common.connect');
    slackConnectBtn.style.display = '';
    syncSlackBtn.style.display = 'none';
    slackMenu.style.display = 'none';

    slackChannelHint.style.display = 'none';
    (document.getElementById('slackRow') as HTMLElement).style.gridTemplateRows = '';
  }
  slackError.style.display = 'none';
}

export async function loadSlackChannels(): Promise<void> {
  try {
    const [channelsResult, savedChannels] = await Promise.all([
      ipc.invoke('slack-channels'),
      ipc.invoke('sync:get-slack-channels')
    ]);

    if (channelsResult.success) {
      allSlackChannels = channelsResult.channels.sort((a: any, b: any) => a.name.localeCompare(b.name));

      selectedChannelIds = new Set();

      if (!savedChannels || savedChannels.length === 0) {
        allSlackChannels.forEach((c: any) => selectedChannelIds.add(c.id));
        channelSelectionDone = false;
      } else {
        channelSelectionDone = true;
        selectedChannelIds.clear();
        savedChannels.forEach((c: any) => {
          if (c.selected) selectedChannelIds.add(c.id);
        });
      }

      updateChannelSummary();
    }
  } catch (error) {
    console.error('Failed to load Slack channels:', error);
  }
}

export async function updateChannelSummary(): Promise<void> {
  const total = allSlackChannels.length;
  const selected = selectedChannelIds.size;

  if (total === 0) {
    channelSummaryText.textContent = await t('common.loading');
    return;
  }

  const hintSeparator = document.querySelector('#slackChannelHint .hint-separator') as HTMLElement;

  if (!channelSelectionDone) {
    channelSummaryText.textContent = await t('slack.selectChannelsAction') || 'Select channels';
    channelSummaryText.classList.add('channel-cta');
    hintSeparator.style.display = 'none';
    editChannelsBtn.style.display = 'none';
  } else {
    const text = await t('slack.channelsSelected', { selected, total });
    channelSummaryText.textContent = text || `${selected}/${total} selected`;
    channelSummaryText.classList.remove('channel-cta');
    hintSeparator.style.display = '';
    editChannelsBtn.style.display = '';
  }
}

// Setters for state modified by channel-modal
export function setSelectedChannelIds(ids: Set<string>): void {
  selectedChannelIds = ids;
}

export function setAllSlackChannels(channels: any[]): void {
  allSlackChannels = channels;
}

export function setChannelSelectionDone(done: boolean): void {
  channelSelectionDone = done;
}

// --- Init ---

export function initSlack(): void {
  editChannelsBtn.addEventListener('click', (e: Event) => {
    e.preventDefault();
    showChannelSelectionModal(allSlackChannels, 'edit');
  });

  channelSummaryText.addEventListener('click', () => {
    if (!channelSelectionDone && allSlackChannels.length > 0) {
      showChannelSelectionModal(allSlackChannels, 'first-sync');
    }
  });

  slackConnectBtn.addEventListener('click', async () => {
    slackConnectBtn.disabled = true;
    slackError.style.display = 'none';

    try {
      slackConnectBtn.textContent = await t('slack.connecting');
      const result = await ipc.invoke('slack-connect');
      if (!result.success) {
        slackError.textContent = result.error || await t('slack.connectFailed');
        slackError.style.display = 'block';
        await updateSlackUI({ connected: false });
      }
    } catch (error: any) {
      console.error('Slack action error:', error);
      slackError.textContent = error.message || await t('common.error');
      slackError.style.display = 'block';
    } finally {
      slackConnectBtn.disabled = false;
      slackConnectBtn.textContent = await t('common.connect');
    }
  });

  ipc.on('slack-connected', async (result: any) => {
    console.log('Slack connected:', result);
    updateSlackUI({
      connected: true,
      workspace: result.workspace,
      user: result.user,
    });
    loadSyncStatus();

    // Show channel selection modal after OAuth
    try {
      const channelsResult = await ipc.invoke('slack-channels');
      if (channelsResult.success && channelsResult.channels?.length > 0) {
        showChannelSelectionModal(channelsResult.channels, 'post-oauth');
      }
    } catch (error) {
      console.error('Failed to load channels for modal:', error);
    }
  });

  ipc.on('slack-oauth-error', (data: any) => {
    console.error('Slack OAuth error:', data.error);
    slackError.textContent = data.error || 'OAuth failed';
    slackError.style.display = 'block';
    updateSlackUI({ connected: false });
  });

  loadSlackStatus();
}
