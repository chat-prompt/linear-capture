/**
 * Channel selection modal logic for settings page
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import {
  renderChannelList,
  selectedChannelIds,
  allSlackChannels,
  loadSlackChannels,
  updateChannelSummary,
  setSelectedChannelIds,
  setAllSlackChannels,
  setChannelSelectionDone,
  syncSlackBtn,
  slackLastSync,
} from './slack';
import { triggerSync } from './sync-status';

// Elements
const channelSelectionModal = document.getElementById('channelSelectionModal') as HTMLElement;
const modalCloseBtn = document.getElementById('modalCloseBtn') as HTMLElement;
const modalChannelSearch = document.getElementById('modalChannelSearch') as HTMLInputElement;
const modalSelectAll = document.getElementById('modalSelectAll') as HTMLElement;
const modalDeselectAll = document.getElementById('modalDeselectAll') as HTMLElement;
const modalChannelCount = document.getElementById('modalChannelCount') as HTMLElement;
const modalChannelList = document.getElementById('modalChannelList') as HTMLElement;
const modalSkipBtn = document.getElementById('modalSkipBtn') as HTMLButtonElement;
const modalSaveBtn = document.getElementById('modalSaveBtn') as HTMLButtonElement;

// State
let modalChannels: any[] = [];
let modalSelectedIds = new Set<string>();
let modalMode: 'post-oauth' | 'edit' | 'first-sync' = 'post-oauth';
let modalPreviousSelection = new Set<string>();
export let pendingSyncAfterChannelSelection = false;

// --- Functions ---

export async function showChannelSelectionModal(channels: any[], mode: 'post-oauth' | 'edit' | 'first-sync' = 'post-oauth'): Promise<void> {
  modalMode = mode;
  modalChannels = channels.sort((a: any, b: any) => a.name.localeCompare(b.name));
  modalSelectedIds = new Set();

  if (mode === 'edit') {
    selectedChannelIds.forEach((id: string) => modalSelectedIds.add(id));
    modalPreviousSelection = new Set(selectedChannelIds);
    modalSkipBtn.textContent = await t('common.cancel');
    modalSaveBtn.textContent = await t('common.save');
  } else if (mode === 'first-sync') {
    modalChannels.forEach((c: any) => modalSelectedIds.add(c.id));
    modalSkipBtn.textContent = await t('common.cancel');
    modalSaveBtn.textContent = await t('slack.saveAndSync');
  } else {
    modalChannels.forEach((c: any) => modalSelectedIds.add(c.id));
    modalSkipBtn.textContent = await t('slack.skip');
    modalSaveBtn.textContent = await t('slack.save');
  }

  updateModalChannelList();
  channelSelectionModal.style.display = 'flex';
  modalChannelSearch.value = '';
  modalChannelSearch.focus();
}

function updateModalChannelList(): void {
  const count = renderChannelList(modalChannelList, modalChannels, modalSelectedIds, {
    searchFilter: modalChannelSearch.value,
    onToggle: (id: string, checked: boolean) => {
      if (checked) {
        modalSelectedIds.add(id);
      } else {
        modalSelectedIds.delete(id);
      }
      updateModalChannelCount();
    }
  });
  updateModalChannelCount();
}

async function updateModalChannelCount(): Promise<void> {
  const total = modalChannels.length;
  const selected = modalSelectedIds.size;
  const text = await t('slack.channelsSelected', { selected, total });
  modalChannelCount.textContent = text || `${selected}/${total} selected`;
}

async function closeModalWithDefault(): Promise<void> {
  if (modalMode === 'edit' || modalMode === 'first-sync') {
    channelSelectionModal.style.display = 'none';
    modalChannelSearch.value = '';
    pendingSyncAfterChannelSelection = false;
    return;
  }

  const channelsToSave = modalChannels.map((c: any) => ({
    id: c.id,
    name: c.name,
    selected: true
  }));

  try {
    await ipc.invoke('sync:set-slack-channels', channelsToSave);
    channelSelectionModal.style.display = 'none';
    loadSlackChannels();
  } catch (error) {
    console.error('Failed to save default channels:', error);
  }
}

async function closeModalWithSelection(): Promise<void> {
  const channelsToSave = modalChannels.map((c: any) => ({
    id: c.id,
    name: c.name,
    selected: modalSelectedIds.has(c.id)
  }));

  try {
    await ipc.invoke('sync:set-slack-channels', channelsToSave);
    channelSelectionModal.style.display = 'none';
    modalChannelSearch.value = '';

    setSelectedChannelIds(new Set(modalSelectedIds));
    setAllSlackChannels([...modalChannels]);
    setChannelSelectionDone(true);

    updateChannelSummary();

    if (pendingSyncAfterChannelSelection) {
      pendingSyncAfterChannelSelection = false;
      triggerSync('slack', syncSlackBtn, slackLastSync);
    }
  } catch (error) {
    console.error('Failed to save channel selection:', error);
  }
}

export function setPendingSyncAfterChannelSelection(value: boolean): void {
  pendingSyncAfterChannelSelection = value;
}

// --- Init ---

export function initChannelModal(): void {
  modalCloseBtn.addEventListener('click', closeModalWithDefault);
  modalSkipBtn.addEventListener('click', closeModalWithDefault);
  modalSaveBtn.addEventListener('click', closeModalWithSelection);

  channelSelectionModal.addEventListener('click', (e: Event) => {
    if (e.target === channelSelectionModal) {
      closeModalWithDefault();
    }
  });

  modalChannelSearch.addEventListener('input', updateModalChannelList);

  modalSelectAll.addEventListener('click', () => {
    const filter = modalChannelSearch.value.toLowerCase();
    modalChannels.forEach((c: any) => {
      if (c.name.toLowerCase().includes(filter)) {
        modalSelectedIds.add(c.id);
      }
    });
    updateModalChannelList();
  });

  modalDeselectAll.addEventListener('click', () => {
    const filter = modalChannelSearch.value.toLowerCase();
    modalChannels.forEach((c: any) => {
      if (c.name.toLowerCase().includes(filter)) {
        modalSelectedIds.delete(c.id);
      }
    });
    updateModalChannelList();
  });
}
