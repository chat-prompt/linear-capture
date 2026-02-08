/**
 * Language selection logic for settings page
 */
import { ipc } from '../shared/ipc';
import { setSelectValue } from '../shared/custom-select';

const languageSelect = document.getElementById('languageSelect') as HTMLInputElement;

async function loadLanguage(): Promise<void> {
  try {
    const currentLang = await ipc.invoke('get-language');
    setSelectValue('languageSelect', currentLang || 'en');
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
