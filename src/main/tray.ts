import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { t } from './i18n';

let tray: Tray | null = null;
let storedCallbacks: TrayCallbacks | null = null;

interface TrayCallbacks {
  onCapture: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Create menu bar tray icon
 */
export function createTray(callbacks: TrayCallbacks): Tray {
  storedCallbacks = callbacks;

  // Load tray icon from PNG files
  // In production (asar), use app.getAppPath(), in dev use __dirname
  const appPath = app.getAppPath();
  const iconPath = path.join(appPath, 'assets/tray-icon.png');
  const iconPath2x = path.join(appPath, 'assets/tray-icon@2x.png');

  let icon = nativeImage.createFromPath(iconPath);

  // Add @2x image for Retina displays
  const icon2x = nativeImage.createFromPath(iconPath2x);
  if (!icon2x.isEmpty()) {
    icon.addRepresentation({
      scaleFactor: 2.0,
      buffer: icon2x.toPNG(),
    });
  }

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip(t('tray.tooltip'));

  const shortcutLabel = process.platform === 'darwin' ? '⌘+Shift+L' : 'Ctrl+Shift+L';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('tray.captureScreen', { shortcut: shortcutLabel }),
      click: callbacks.onCapture,
    },
    { type: 'separator' },
    {
      label: t('tray.settings'),
      click: callbacks.onSettings,
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: callbacks.onQuit,
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (process.platform === 'darwin') {
      tray?.popUpContextMenu();
    }
  });

  return tray;
}

/**
 * Destroy tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * Rebuild tray context menu (e.g., after language change)
 */
export function rebuildTrayMenu(): void {
  if (!tray || !storedCallbacks) return;

  tray.setToolTip(t('tray.tooltip'));

  const shortcutLabel = process.platform === 'darwin' ? '⌘+Shift+L' : 'Ctrl+Shift+L';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('tray.captureScreen', { shortcut: shortcutLabel }),
      click: storedCallbacks.onCapture,
    },
    { type: 'separator' },
    {
      label: t('tray.settings'),
      click: storedCallbacks.onSettings,
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: storedCallbacks.onQuit,
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Update tray tooltip
 */
export function setTrayTooltip(text: string): void {
  if (tray) {
    tray.setToolTip(text);
  }
}
