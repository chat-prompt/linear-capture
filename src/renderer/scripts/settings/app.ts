/**
 * Settings page entry point
 * Imports and initializes all settings modules
 */
import { ipc } from '../shared/ipc';
import { t, translatePage, autoTranslate } from '../shared/i18n';
import { initToken } from './token';
import { initHotkey } from './hotkey';
import { initSlack, loadSlackStatus } from './slack';
import { initChannelModal } from './channel-modal';
import { initNotion, loadNotionStatus } from './notion';
import { initGmail, loadGmailStatus } from './gmail';
import { initSyncStatus, loadSyncStatus, invalidateSyncLabels } from './sync-status';
import { initMenuDropdown } from './menu-dropdown';
import { initLanguage } from './language';
import { initVersion } from './version';

// i18n: react to language changes
ipc.on('language-changed', async () => {
  invalidateSyncLabels(); // Clear cached i18n labels
  await translatePage();
  await autoTranslate();
  // Reload all statuses (sync-status now handles all source statuses)
  await Promise.all([
    loadSlackStatus(),
    loadNotionStatus(),
    loadGmailStatus(),
    loadSyncStatus(),
  ]);
});

// Initial translation
translatePage();
document.addEventListener('DOMContentLoaded', () => autoTranslate());

// ESC to close settings window
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    ipc.invoke('close-settings');
  }
});

// Initialize all modules
initToken();
initHotkey();
initSlack();
initChannelModal();
initNotion();
initGmail();
initSyncStatus();
initMenuDropdown();
initLanguage();
initVersion();
