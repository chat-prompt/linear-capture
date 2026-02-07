/**
 * Dropdown menu toggle logic for settings page
 */
import { ipc } from '../shared/ipc';
import { showChannelSelectionModal } from './channel-modal';
import { updateSlackUI, allSlackChannels } from './slack';
import { updateNotionUI } from './notion';
import { updateGmailUI } from './gmail';

export function initMenuDropdown(): void {
  document.querySelectorAll('.btn-menu-trigger').forEach(btn => {
    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      const dropdown = (btn as HTMLElement).nextElementSibling;
      const isOpen = dropdown?.classList.contains('open');

      document.querySelectorAll('.menu-dropdown.open').forEach(d => d.classList.remove('open'));

      if (!isOpen) dropdown?.classList.add('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.menu-dropdown.open').forEach(d => d.classList.remove('open'));
  });

  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e: Event) => {
      e.stopPropagation();
      const action = (item as HTMLElement).dataset.action;
      const row = (item as HTMLElement).closest('.integration-row');
      const service = (row as HTMLElement)?.dataset.service;

      (item as HTMLElement).closest('.menu-dropdown')?.classList.remove('open');

      if (action === 'edit-channels') {
        if (service === 'slack' && allSlackChannels.length > 0) {
          showChannelSelectionModal(allSlackChannels, 'edit');
        }
      } else if (action === 'reconnect') {
        await ipc.invoke(`${service}-connect`);
      } else if (action === 'disconnect') {
        const result = await ipc.invoke(`${service}-disconnect`);
        if (result.success) {
          if (service === 'slack') await updateSlackUI({ connected: false });
          else if (service === 'notion') await updateNotionUI({ connected: false });
          else if (service === 'gmail') await updateGmailUI({ connected: false });
        }
      }
    });
  });
}
