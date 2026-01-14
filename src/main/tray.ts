import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

interface TrayCallbacks {
  onCapture: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Create menu bar tray icon
 */
export function createTray(callbacks: TrayCallbacks): Tray {
  // Create a simple icon (you can replace with a custom icon later)
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');

  // Try to load custom icon, fallback to creating a simple one
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      throw new Error('Icon not found');
    }
  } catch {
    // Create a simple 16x16 icon as fallback
    icon = nativeImage.createEmpty();
  }

  // Resize for menu bar (16x16 on macOS)
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);
  tray.setToolTip('Linear Capture');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Capture Screen (⌘+Shift+L)',
      click: callbacks.onCapture,
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: callbacks.onSettings,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: callbacks.onQuit,
    },
  ]);

  tray.setContextMenu(contextMenu);

  // On macOS, clicking the tray icon shows the context menu
  tray.on('click', () => {
    tray?.popUpContextMenu();
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
 * Update tray tooltip
 */
export function setTrayTooltip(text: string): void {
  if (tray) {
    tray.setToolTip(text);
  }
}
