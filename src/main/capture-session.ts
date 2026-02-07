import { Notification } from 'electron';
import { logger } from '../services/utils/logger';
import { cleanupCapture } from '../services/capture';
import { getUserInfo } from '../services/settings-store';
import { t } from './i18n';
import { getState } from './state';
import { MAX_IMAGES } from './types';
import type { AnalysisResult } from '../services/ai-analyzer';

export function showNotification(title: string, body: string): void {
  new Notification({ title, body }).show();
}

export function cleanupSession(): void {
  const state = getState();
  if (state.captureSession) {
    for (const img of state.captureSession.images) {
      cleanupCapture(img.filePath);
    }
    state.captureSession = null;
  }
}

export function showCaptureWindow(
  analysis?: AnalysisResult,
  createMainWindow?: () => void
): void {
  const state = getState();
  
  if (!state.mainWindow) {
    createMainWindow?.();
  }

  const sendCaptureData = () => {
    logger.log('Sending capture-ready event to renderer...');
    logger.log('Images count:', state.captureSession?.images.length || 0);
    logger.log('Analysis data:', JSON.stringify({
      title: analysis?.title,
      description: analysis?.description?.substring(0, 100),
      success: analysis?.success
    }));
    state.mainWindow?.webContents.send('capture-ready', {
      images: state.captureSession?.images || [],
      maxImages: MAX_IMAGES,
      teams: state.teamsCache,
      projects: state.projectsCache,
      users: state.usersCache,
      states: state.statesCache,
      cycles: state.cyclesCache,
      labels: state.labelsCache,
      defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || '',
      suggestedTitle: analysis?.title || '',
      suggestedDescription: analysis?.description || '',
      suggestedProjectId: analysis?.suggestedProjectId || '',
      suggestedAssigneeId: analysis?.suggestedAssigneeId || '',
      suggestedPriority: analysis?.suggestedPriority || 0,
      suggestedEstimate: analysis?.suggestedEstimate || 0,
      userInfo: getUserInfo(),
    });
  };

  state.mainWindow?.setAlwaysOnTop(true);
  state.mainWindow?.show();
  state.mainWindow?.focus();

  if (state.mainWindow?.webContents.isLoading()) {
    logger.log('Window still loading, waiting for did-finish-load...');
    state.mainWindow.webContents.once('did-finish-load', sendCaptureData);
  } else {
    setTimeout(sendCaptureData, 50);
  }

  setTimeout(() => {
    state.mainWindow?.setAlwaysOnTop(false);
  }, 100);
}

export async function handleCapture(createMainWindow: () => void): Promise<void> {
  const state = getState();
  
  if (state.isCapturing) {
    logger.log('Capture already in progress, ignoring');
    return;
  }

  state.isCapturing = true;

  try {
    if (!state.captureService) {
      logger.error('Capture service not initialized');
      return;
    }

    const permission = state.captureService.checkPermission();

    if (permission !== 'granted') {
      logger.log('Permission not granted, attempting capture to register app in permission list...');
      const result = await state.captureService.captureSelection();

      if (!result.success || !result.filePath) {
        const { showPermissionNotification } = await import('./window-manager');
        showPermissionNotification();
        return;
      }

      logger.log('Permission granted during capture attempt, continuing...');
      if (!state.captureSession) {
        state.captureSession = { images: [] };
      }
      state.captureSession.images.push({ filePath: result.filePath });
      logger.log(`Added image ${state.captureSession.images.length}/${MAX_IMAGES}`);
      showCaptureWindow(state.captureSession.analysisResult, createMainWindow);
      return;
    }

    const isAddingToSession = state.captureSession !== null && state.mainWindow?.isVisible();

    if (isAddingToSession && state.captureSession!.images.length >= MAX_IMAGES) {
      showNotification(t('capture.maxImagesReached'), t('capture.maxImagesMessage', { max: MAX_IMAGES }));
      return;
    }

    const result = await state.captureService.captureSelection();

    if (!result.success || !result.filePath) {
      logger.log('Capture cancelled or failed:', result.error);
      if (isAddingToSession) {
        state.mainWindow?.show();
      }
      return;
    }

    logger.log('Capture successful:', result.filePath);

    if (!state.captureSession) {
      state.captureSession = { images: [] };
    }

    state.captureSession.images.push({ filePath: result.filePath });
    logger.log(`Added image ${state.captureSession.images.length}/${MAX_IMAGES}`);

    if (isAddingToSession) {
      state.mainWindow?.show();
      state.mainWindow?.focus();
      state.mainWindow?.webContents.send('capture-added', {
        index: state.captureSession.images.length - 1,
        filePath: result.filePath,
        canAddMore: state.captureSession.images.length < MAX_IMAGES,
      });
    } else {
      showCaptureWindow(state.captureSession.analysisResult, createMainWindow);
    }
  } catch (error) {
    logger.error('handleCapture error:', error);
  } finally {
    state.isCapturing = false;
  }
}
