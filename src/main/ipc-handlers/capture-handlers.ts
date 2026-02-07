import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { cleanupCapture } from '../../services/capture';
import { getState } from '../state';
import { cleanupSession, handleCapture } from '../capture-session';
import { createMainWindow } from '../window-manager';
import { MAX_IMAGES } from '../types';

export function registerCaptureHandlers(): void {
  const state = getState();

  ipcMain.handle('close-window', () => {
    state.mainWindow?.minimize();
  });

  ipcMain.handle('cancel', () => {
    cleanupSession();
    state.mainWindow?.minimize();
  });

  ipcMain.handle('remove-capture', async (_event, data: { index: number }) => {
    if (!state.captureSession || data.index < 0 || data.index >= state.captureSession.images.length) {
      return { success: false, error: 'Invalid index' };
    }

    const [removed] = state.captureSession.images.splice(data.index, 1);
    cleanupCapture(removed.filePath);

    logger.log(`Removed image at index ${data.index}, ${state.captureSession.images.length} remaining`);

    state.mainWindow?.webContents.send('capture-removed', {
      index: data.index,
      remainingCount: state.captureSession.images.length,
      canAddMore: state.captureSession.images.length < MAX_IMAGES,
    });

    return { success: true };
  });

  ipcMain.handle('add-capture', async () => {
    if (state.captureSession && state.captureSession.images.length >= MAX_IMAGES) {
      return { success: false, error: 'Maximum images reached' };
    }
    await handleCapture(createMainWindow);
    return { success: true };
  });
}
