import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { getState } from '../state';
import { createMainWindow, openScreenCaptureSettings } from '../window-manager';
import { loadLinearData } from './linear-handlers';

export function registerOnboardingHandlers(): void {
  const state = getState();

  ipcMain.on('open-screen-capture-settings', async () => {
    logger.log('Triggering capture to register in permission list...');
    await state.captureService?.captureSelection();
    openScreenCaptureSettings();
  });

  ipcMain.on('close-onboarding', () => {
    state.onboardingWindow?.close();
  });

  ipcMain.on('onboarding-complete', async () => {
    state.onboardingWindow?.close();
    await loadLinearData();
    if (!state.mainWindow) {
      createMainWindow();
    }
    state.mainWindow?.show();
    state.mainWindow?.focus();
  });
}
