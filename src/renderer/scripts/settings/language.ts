/**
 * Language selection logic for settings page
 */
import { ipc } from '../shared/ipc';

const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;

async function loadLanguage(): Promise<void> {
  try {
    const currentLang = await ipc.invoke('get-language');
    languageSelect.value = currentLang || 'en';
  } catch (error) {
    console.error('Failed to load language:', error);
  }
}

export function initLanguage(): void {
  loadLanguage();

  languageSelect.addEventListener('change', async () => {
    const newLang = languageSelect.value;
    try {
      await ipc.invoke('set-language', newLang);
    } catch (error) {
      console.error('Failed to set language:', error);
    }
  });
}
