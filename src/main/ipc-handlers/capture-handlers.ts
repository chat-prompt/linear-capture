import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { cleanupCapture } from '../../services/capture';
import { getState } from '../state';
import { cleanupSession, handleCapture } from '../capture-session';
import { createMainWindow } from '../window-manager';
import { MAX_IMAGES } from '../../types/capture';

export function registerCaptureHandlers(): void {
  const state = getState();

  ipcMain.handle('close-window', () => {
    try {
      state.mainWindow?.minimize();
    } catch (err) {
      logger.error('close-window failed:', err);
      throw err;
    }
  });

  ipcMain.handle('cancel', () => {
    try {
      cleanupSession();
      state.mainWindow?.minimize();
    } catch (err) {
      logger.error('cancel failed:', err);
      throw err;
    }
  });

  ipcMain.handle('remove-capture', async (_event, data: { index: number }) => {
    if (!state.captureSession || data.index < 0 || data.index >= state.captureSession.images.length) {
      return { success: false, error: 'Invalid index' };
    }

    try {
      const [removed] = state.captureSession.images.splice(data.index, 1);
      cleanupCapture(removed.filePath);

      logger.log(`Removed image at index ${data.index}, ${state.captureSession.images.length} remaining`);

      state.mainWindow?.webContents.send('capture-removed', {
        index: data.index,
        remainingCount: state.captureSession.images.length,
        canAddMore: state.captureSession.images.length < MAX_IMAGES,
      });

      return { success: true };
    } catch (error) {
      logger.error('remove-capture error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('add-capture', async () => {
    if (state.captureSession && state.captureSession.images.length >= MAX_IMAGES) {
      return { success: false, error: 'Maximum images reached' };
    }
    try {
      await handleCapture(createMainWindow);
      return { success: true };
    } catch (error) {
      logger.error('add-capture error:', error);
      return { success: false, error: String(error) };
    }
  });
}
