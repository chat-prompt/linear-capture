/**
 * Renderer process i18n - communicates with main process via IPC
 */

interface ElectronAPI {
  translate?: (key: string, options?: object) => Promise<string>;
  changeLanguage?: (lng: string) => Promise<void>;
  getCurrentLanguage?: () => Promise<string>;
}

interface I18nAPI {
  t: (key: string, options?: object) => Promise<string>;
  changeLanguage: (lng: string) => Promise<void>;
  getCurrentLanguage: () => Promise<string>;
  onLanguageChanged: (callback: (lng: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const listeners: ((lng: string) => void)[] = [];

export const i18n: I18nAPI = {
  t: async (key: string, options?: object): Promise<string> => {
    if (window.electronAPI?.translate) {
      return await window.electronAPI.translate(key, options);
    }
    return key;
  },

  changeLanguage: async (lng: string): Promise<void> => {
    if (window.electronAPI?.changeLanguage) {
      await window.electronAPI.changeLanguage(lng);
    }
    listeners.forEach(cb => cb(lng));
  },

  getCurrentLanguage: async (): Promise<string> => {
    if (window.electronAPI?.getCurrentLanguage) {
      return await window.electronAPI.getCurrentLanguage();
    }
    return 'en';
  },

  onLanguageChanged: (callback: (lng: string) => void): void => {
    listeners.push(callback);
  }
};
