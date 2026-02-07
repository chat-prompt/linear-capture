/**
 * Type-safe wrapper for window.electronAPI (exposed via contextBridge)
 */

interface ElectronAPI {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, callback: (...args: any[]) => void): void;
  openExternal(url: string): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const ipc = window.electronAPI;
