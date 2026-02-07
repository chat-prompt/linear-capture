/**
 * Type declaration for the preload script's contextBridge API.
 * Exposed on window.electronAPI when contextIsolation is enabled.
 *
 * Note: The ElectronAPI interface is augmented here to include the preload
 * bridge methods. The base interface in src/renderer/i18n.ts defines
 * the i18n-specific subset. Both declarations merge via interface merging.
 */

interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  removeAllListeners(channel: string): void;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
