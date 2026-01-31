import { app, BrowserWindow, ipcMain, clipboard, Notification, shell, dialog } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Store from 'electron-store';

app.disableHardwareAcceleration();

import { registerHotkey, unregisterAllHotkeys, updateHotkey, validateHotkey, formatHotkeyForDisplay, getCurrentShortcut, DEFAULT_SHORTCUT } from './hotkey';
import { createTray, destroyTray } from './tray';
import { initI18n, t, changeLanguage, i18next, getCurrentLanguage } from './i18n';
import { createCaptureService, cleanupCapture, ICaptureService } from '../services/capture';
import { createR2UploaderFromEnv } from '../services/r2-uploader';
import { createLinearServiceFromEnv, validateLinearToken, TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo, LabelInfo } from '../services/linear-client';
import { createGeminiAnalyzer, GeminiAnalyzer, AnalysisResult, AnalysisContext } from '../services/gemini-analyzer';
import { createAnthropicAnalyzer, AnthropicAnalyzer } from '../services/anthropic-analyzer';
import {
  getLinearToken,
  setLinearToken,
  clearLinearToken,
  getUserInfo,
  setUserInfo,
  getAllSettings,
  getCaptureHotkey,
  setCaptureHotkey,
  resetCaptureHotkey,
  getDefaultHotkey,
  hasToken,
  getDeviceId,
  getLanguage,
  setLanguage,
  getSupportedLanguages,
  UserInfo as SettingsUserInfo,
} from '../services/settings-store';
import { initAutoUpdater, checkForUpdates } from '../services/auto-updater';
import { createSlackService, SlackService } from '../services/slack-client';
import { createNotionService, NotionService } from '../services/notion-client';
import { createGmailService, GmailService } from '../services/gmail-client';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Single instance lock - 중복 실행 방지
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    console.log('Second instance detected, focusing existing window...');
    const windowToFocus = mainWindow || settingsWindow || onboardingWindow;
    if (windowToFocus) {
      if (windowToFocus.isMinimized()) windowToFocus.restore();
      windowToFocus.show();
      windowToFocus.focus();
    }
    
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('linear-capture://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

app.setAsDefaultProtocolClient('linear-capture');

function handleDeepLink(url: string): void {
  console.log('Deep link received:', url);
  
  try {
    const parsed = new URL(url);
    
    if (parsed.hostname === 'slack' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        console.error('Slack OAuth error:', error);
        settingsWindow?.webContents.send('slack-oauth-error', { error });
        return;
      }
      
      if (code && state) {
        console.log('Slack OAuth callback received');
        pendingSlackCallback = { code, state };
        
        if (slackService) {
          slackService.handleCallback(code, state).then(result => {
            if (result.success) {
              settingsWindow?.webContents.send('slack-connected', result);
            } else {
              settingsWindow?.webContents.send('slack-oauth-error', { error: result.error });
            }
            pendingSlackCallback = null;
          });
        }
        
        if (settingsWindow) {
          settingsWindow.show();
          settingsWindow.focus();
        }
      }
    }
    
    if (parsed.hostname === 'notion' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        console.error('Notion OAuth error:', error);
        settingsWindow?.webContents.send('notion-oauth-error', { error });
        return;
      }
      
      if (code && state) {
        console.log('Notion OAuth callback received');
        pendingNotionCallback = { code, state };
        
        if (notionService) {
          notionService.handleCallback(code, state).then(result => {
            if (result.success) {
              settingsWindow?.webContents.send('notion-connected', result);
            } else {
              settingsWindow?.webContents.send('notion-oauth-error', { error: result.error });
            }
            pendingNotionCallback = null;
          });
        }
        
        if (settingsWindow) {
          settingsWindow.show();
          settingsWindow.focus();
        }
      }
    }
    
    if (parsed.hostname === 'gmail' && parsed.pathname === '/callback') {
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      const error = parsed.searchParams.get('error');
      
      if (error) {
        console.error('Gmail OAuth error:', error);
        settingsWindow?.webContents.send('gmail-oauth-error', { error });
        return;
      }
      
      if (code && state) {
        console.log('Gmail OAuth callback received');
        pendingGmailCallback = { code, state };
        
        if (gmailService) {
          gmailService.handleCallback(code, state).then(result => {
            if (result.success) {
              settingsWindow?.webContents.send('gmail-connected', result);
            } else {
              settingsWindow?.webContents.send('gmail-oauth-error', { error: result.error });
            }
            pendingGmailCallback = null;
          });
        }
        
        if (settingsWindow) {
          settingsWindow.show();
          settingsWindow.focus();
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse deep link URL:', err);
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

let mainWindow: BrowserWindow | null = null;
let onboardingWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// Multi-image capture session
interface CapturedImage {
  filePath: string;
  uploadedUrl?: string;
}

interface CaptureSession {
  images: CapturedImage[];
  analysisResult?: AnalysisResult;
}

const MAX_IMAGES = 10;
let captureSession: CaptureSession | null = null;

// App settings store
const store = new Store();

// Cache for teams, projects, users, states, cycles, labels
let teamsCache: TeamInfo[] = [];
let projectsCache: ProjectInfo[] = [];
let usersCache: UserInfo[] = [];
let statesCache: WorkflowStateInfo[] = [];
let cyclesCache: CycleInfo[] = [];
let labelsCache: LabelInfo[] = [];

// AI analyzer instance (Anthropic or Gemini)
let geminiAnalyzer: GeminiAnalyzer | null = null;
let anthropicAnalyzer: AnthropicAnalyzer | null = null;
let slackService: SlackService | null = null;
let notionService: NotionService | null = null;
let gmailService: GmailService | null = null;

let captureService: ICaptureService;
let pendingSlackCallback: { code: string; state: string } | null = null;
let pendingNotionCallback: { code: string; state: string } | null = null;
let pendingGmailCallback: { code: string; state: string } | null = null;

function openScreenCaptureSettings(): void {
  captureService.openPermissionSettings();
}

function showPermissionNotification(): void {
  dialog.showMessageBox({
    type: 'warning',
    title: t('dialogs.permissionTitle'),
    message: t('dialogs.permissionMessage'),
    detail: t('dialogs.permissionDetail'),
    buttons: [t('dialogs.permissionButton'), t('common.cancel')],
    defaultId: 0,
    cancelId: 1,
  }).then(async (result: { response: number }) => {
    if (result.response === 0) {
      console.log('Triggering capture to register app in permission list...');
      await captureService.captureSelection();
      openScreenCaptureSettings();
    }
  });
}

/**
 * Create the onboarding window (shown on first launch)
 */
function createOnboardingWindow(): void {
  onboardingWindow = new BrowserWindow({
    width: 380,
    height: 414,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  });

  onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));

  onboardingWindow.once('ready-to-show', async () => {
    onboardingWindow?.show();
    console.log('Triggering capture to register in permission list...');
    await captureService.captureSelection();
  });

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

/**
 * Create the settings window
 */
function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 800,
    show: false,
    frame: true, // 신호등 버튼 표시
    resizable: false,
    alwaysOnTop: false,
    title: 'Settings - Linear Capture',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Create the issue creation window
 */
function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('Main window already exists, skipping creation');
    return;
  }

  mainWindow = new BrowserWindow({
    width: 728,
    height: 720,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Cleanup all temp files if window closed without submission
    cleanupSession();
  });
}

/**
 * Show the issue creation window with captured images
 */
function showCaptureWindow(analysis?: AnalysisResult): void {
  if (!mainWindow) {
    createWindow();
  }

  const sendCaptureData = () => {
    console.log('Sending capture-ready event to renderer...');
    console.log('Images count:', captureSession?.images.length || 0);
    console.log('Analysis data:', JSON.stringify({
      title: analysis?.title,
      description: analysis?.description?.substring(0, 100),
      success: analysis?.success
    }));
    mainWindow?.webContents.send('capture-ready', {
      images: captureSession?.images || [],
      maxImages: MAX_IMAGES,
      teams: teamsCache,
      projects: projectsCache,
      users: usersCache,
      states: statesCache,
      cycles: cyclesCache,
      labels: labelsCache,
      defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || '',
      suggestedTitle: analysis?.title || '',
      suggestedDescription: analysis?.description || '',
      // AI 추천 메타데이터
      suggestedProjectId: analysis?.suggestedProjectId || '',
      suggestedAssigneeId: analysis?.suggestedAssigneeId || '',
      suggestedPriority: analysis?.suggestedPriority || 0,
      suggestedEstimate: analysis?.suggestedEstimate || 0,
      // 토큰 소유자 정보 (기본 담당자로 사용)
      userInfo: getUserInfo(),
    });
  };

  // 창을 열 때 일시적으로 최상위로 올린 후, 포커스 후 해제
  mainWindow?.setAlwaysOnTop(true);
  mainWindow?.show();
  mainWindow?.focus();

  // Check if webContents is still loading
  if (mainWindow?.webContents.isLoading()) {
    console.log('Window still loading, waiting for did-finish-load...');
    mainWindow.webContents.once('did-finish-load', sendCaptureData);
  } else {
    // Already loaded, send immediately (use setTimeout to ensure DOM is ready)
    setTimeout(sendCaptureData, 50);
  }

  // 잠시 후 alwaysOnTop 해제 → 일반 창처럼 동작
  setTimeout(() => {
    mainWindow?.setAlwaysOnTop(false);
  }, 100);
}

// Debounce flag to prevent duplicate capture calls
let isCapturing = false;

/**
 * Handle screen capture flow
 * If session exists and window is open, add to existing session
 * Otherwise, create new session
 */
async function handleCapture(): Promise<void> {
  // Debounce: prevent duplicate calls while capture is in progress
  if (isCapturing) {
    console.log('Capture already in progress, ignoring');
    return;
  }

  isCapturing = true;

  try {
    const permission = captureService.checkPermission();

    if (permission !== 'granted') {
      console.log('Permission not granted, attempting capture to register app in permission list...');
      const result = await captureService.captureSelection();

      if (!result.success || !result.filePath) {
        // Capture failed (permission denied or user cancelled)
        // Now show the permission notification
        showPermissionNotification();
        return;
      }

      // Capture succeeded - permission was granted during the attempt
      console.log('Permission granted during capture attempt, continuing...');
      // Continue to normal flow below with the captured file
      if (!captureSession) {
        captureSession = { images: [] };
      }
      captureSession.images.push({ filePath: result.filePath });
      console.log(`Added image ${captureSession.images.length}/${MAX_IMAGES}`);
      showCaptureWindow(captureSession.analysisResult);
      return;
    }

    // Check if we should add to existing session
    const isAddingToSession = captureSession !== null && mainWindow?.isVisible();

    if (isAddingToSession && captureSession!.images.length >= MAX_IMAGES) {
      showNotification(t('capture.maxImagesReached'), t('capture.maxImagesMessage', { max: MAX_IMAGES }));
      return;
    }

    const result = await captureService.captureSelection();

    if (!result.success || !result.filePath) {
      console.log('Capture cancelled or failed:', result.error);
      if (isAddingToSession) {
        mainWindow?.show();
      }
      return;
    }

    console.log('Capture successful:', result.filePath);

    // Create new session or add to existing
    if (!captureSession) {
      captureSession = { images: [] };
    }

    captureSession.images.push({ filePath: result.filePath });
    console.log(`Added image ${captureSession.images.length}/${MAX_IMAGES}`);

    if (isAddingToSession) {
      // 기존 세션에 추가: capture-added 이벤트만 전송
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send('capture-added', {
        index: captureSession.images.length - 1,
        filePath: result.filePath,
        canAddMore: captureSession.images.length < MAX_IMAGES,
      });
    } else {
      // 새 세션 시작: 전체 데이터 전송
      showCaptureWindow(captureSession.analysisResult);
    }
  } catch (error) {
    console.error('handleCapture error:', error);
  } finally {
    isCapturing = false;
  }
}

/**
 * Cleanup all images in current session
 */
function cleanupSession(): void {
  if (captureSession) {
    for (const img of captureSession.images) {
      cleanupCapture(img.filePath);
    }
    captureSession = null;
  }
}

/**
 * Show macOS notification
 */
function showNotification(title: string, body: string): void {
  new Notification({ title, body }).show();
}

/**
 * Load teams, projects, users, states, and cycles cache
 */
async function loadLinearData(): Promise<void> {
  const linear = createLinearServiceFromEnv();
  if (!linear) {
    console.error('Linear not configured');
    return;
  }

  try {
    // Load all data in parallel for faster startup
    const [teams, projects, users, states, cycles, labels] = await Promise.all([
      linear.getTeams(),
      linear.getProjects(),
      linear.getUsers(),
      linear.getWorkflowStates(),
      linear.getCycles(),
      linear.getLabels(),
    ]);

    teamsCache = teams;
    projectsCache = projects;
    usersCache = users;
    statesCache = states;
    cyclesCache = cycles;
    labelsCache = labels;

    console.log(`Loaded: ${teamsCache.length} teams, ${projectsCache.length} projects, ${usersCache.length} users, ${statesCache.length} states, ${cyclesCache.length} cycles, ${labelsCache.length} labels`);

    // Load local cache and merge recent issue titles into projects
    try {
      const { loadLocalCache } = await import('../services/linear-local-cache');
      const localCache = await loadLocalCache();
      if (localCache) {
        for (const project of projectsCache) {
          const cached = localCache.projects.find(p => p.id === project.id);
          if (cached) {
            project.recentIssueTitles = cached.recentIssueTitles;
          }
        }
        console.log(`Merged local cache: ${localCache.projects.length} projects with recent issues`);
      }
    } catch (cacheError) {
      console.warn('Failed to load local cache (non-critical):', cacheError instanceof Error ? cacheError.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Failed to load Linear data:', error);
  }
}

app.whenReady().then(async () => {
  await initI18n(getLanguage());
  
  captureService = createCaptureService();
  
  if (process.platform === 'darwin') {
    app.dock?.show();
  }

  // Check if first launch and show onboarding
  const hasLaunched = store.get('hasLaunched', false);
  if (!hasLaunched) {
    store.set('hasLaunched', true);
    createOnboardingWindow();
  }

  ipcMain.on('open-screen-capture-settings', async () => {
    console.log('Triggering capture to register in permission list...');
    await captureService.captureSelection();
    openScreenCaptureSettings();
  });

  ipcMain.on('close-onboarding', () => {
    onboardingWindow?.close();
  });

  // Handle onboarding complete (with token saved)
  ipcMain.on('onboarding-complete', async () => {
    onboardingWindow?.close();
    // Reload Linear data with new token
    await loadLinearData();
    // Show main window
    if (!mainWindow) {
      createWindow();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Register IPC handlers
  ipcMain.handle('create-issue', async (_event, data: {
    title: string;
    description: string;
    teamId: string;
    projectId?: string;
    stateId?: string;
    priority?: number;
    assigneeId?: string;
    estimate?: number;
    cycleId?: string;
    labelIds?: string[];
  }) => {
    const linear = createLinearServiceFromEnv();
    if (!linear) {
      return { success: false, error: 'Linear not configured' };
    }

    // Upload all images to R2 in parallel
    const r2 = createR2UploaderFromEnv();
    if (!r2) {
      return { success: false, error: 'R2 not configured' };
    }

    const imageUrls: string[] = [];
    const totalImages = captureSession?.images.length || 0;
    if (totalImages > 0) {
      console.log(`Uploading ${totalImages} images to R2...`);
      const uploadResults = await Promise.all(
        captureSession!.images.map(img => r2.upload(img.filePath))
      );

      for (const uploadResult of uploadResults) {
        if (uploadResult.success && uploadResult.url) {
          imageUrls.push(uploadResult.url);
        }
      }
      console.log(`Successfully uploaded ${imageUrls.length}/${totalImages} images`);

      // Warn if some uploads failed but continue with successful ones
      if (imageUrls.length < totalImages && imageUrls.length > 0) {
        console.warn(`${totalImages - imageUrls.length} image(s) failed to upload`);
      }

      // If all uploads failed, return error with count
      if (imageUrls.length === 0 && totalImages > 0) {
        return {
          success: false,
          error: 'All image uploads failed',
          uploadedCount: 0
        };
      }
    }

    const result = await linear.createIssue({
      title: data.title,
      description: data.description,
      teamId: data.teamId,
      projectId: data.projectId,
      stateId: data.stateId,
      priority: data.priority,
      assigneeId: data.assigneeId,
      estimate: data.estimate,
      cycleId: data.cycleId,
      labelIds: data.labelIds,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    if (result.success && result.issueUrl) {
      // Copy URL to clipboard
      clipboard.writeText(result.issueUrl);

      // Cleanup all images (but don't close window - let renderer show success screen)
      cleanupSession();
    }

    return result;
  });

  // Close window handler (called from success screen)
  ipcMain.handle('close-window', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('cancel', () => {
    cleanupSession();
    mainWindow?.minimize();
  });

  // Remove a specific image from the session
  ipcMain.handle('remove-capture', async (_event, data: { index: number }) => {
    if (!captureSession || data.index < 0 || data.index >= captureSession.images.length) {
      return { success: false, error: 'Invalid index' };
    }

    // Remove and cleanup the specific image
    const [removed] = captureSession.images.splice(data.index, 1);
    cleanupCapture(removed.filePath);

    console.log(`Removed image at index ${data.index}, ${captureSession.images.length} remaining`);

    // Notify renderer
    mainWindow?.webContents.send('capture-removed', {
      index: data.index,
      remainingCount: captureSession.images.length,
      canAddMore: captureSession.images.length < MAX_IMAGES,
    });

    return { success: true };
  });

  // Add another capture (alternative to using hotkey)
  ipcMain.handle('add-capture', async () => {
    if (captureSession && captureSession.images.length >= MAX_IMAGES) {
      return { success: false, error: 'Maximum images reached' };
    }
    await handleCapture();
    return { success: true };
  });

  // Handle re-analyze request with specific model (supports multiple images)
  ipcMain.handle('reanalyze', async (_event, data: { filePath: string; model: string; instruction?: string }) => {
    // Get all image paths from session
    const imagePaths = captureSession?.images.map(img => img.filePath) || [data.filePath];
    console.log(`Re-analyzing ${imagePaths.length} image(s) with model: ${data.model}`);

    const analysisContext: AnalysisContext = {
      projects: projectsCache.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description
      })),
      users: usersCache.map(u => ({ id: u.id, name: u.name })),
      defaultTeamId: process.env.DEFAULT_TEAM_ID,
      instruction: data.instruction,
      language: getCurrentLanguage(),
    };

    try {
      let analysisResult: AnalysisResult;

      if (data.model === 'haiku') {
        // Use Anthropic Haiku (first image only for now)
        const analyzer = createAnthropicAnalyzer();
        if (!analyzer) {
          mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Anthropic API key not set' };
        }
        // Anthropic doesn't support multi-image yet, use first image
        analysisResult = await analyzer.analyzeScreenshot(imagePaths[0], analysisContext);
      } else {
        // Use Gemini (supports multiple images)
        const analyzer = createGeminiAnalyzer();
        if (!analyzer) {
          mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Gemini API key not set' };
        }
        // Use multi-image analysis for all images in session
        analysisResult = await analyzer.analyzeMultipleScreenshots(imagePaths, analysisContext);
      }

      if (analysisResult.success) {
        console.log('Re-analysis successful:', analysisResult.title);
        mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
      } else {
        mainWindow?.webContents.send('ai-analysis-ready', { success: false });
      }

      return { success: true };
    } catch (error) {
      console.error('Re-analyze error:', error);
      mainWindow?.webContents.send('ai-analysis-ready', { success: false });
      return { success: false, error: String(error) };
    }
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings', async () => {
    return getAllSettings();
  });

  ipcMain.handle('validate-token', async (_event, token: string) => {
    try {
      const result = await validateLinearToken(token);
      return result;
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false, error: String(error) };
    }
  });

  ipcMain.handle('save-settings', async (_event, data: { linearApiToken: string; userInfo: SettingsUserInfo }) => {
    try {
      setLinearToken(data.linearApiToken);
      setUserInfo(data.userInfo);
      // Reload Linear data with new token
      await loadLinearData();
      // Notify main window about settings change and send updated data
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-updated');
        // Send updated Linear data to refresh dropdowns
        mainWindow.webContents.send('linear-data-updated', {
          teams: teamsCache,
          projects: projectsCache,
          users: usersCache,
          states: statesCache,
          cycles: cyclesCache,
          labels: labelsCache,
          defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
        });
      }
      return { success: true };
    } catch (error) {
      console.error('Save settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('clear-settings', async () => {
    try {
      clearLinearToken();
      return { success: true };
    } catch (error) {
      console.error('Clear settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('close-settings', () => {
    settingsWindow?.close();
  });

  // Check for updates manually (from Settings)
  ipcMain.handle('check-for-updates', async () => {
    if (app.isPackaged) {
      await checkForUpdates(false); // false = show result dialog
      return { success: true };
    } else {
      return { success: false, error: 'Updates only work in packaged app' };
    }
  });

  // Get current app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // ==================== Hotkey IPC Handlers ====================

  // Get current hotkey
  ipcMain.handle('get-hotkey', () => {
    return {
      hotkey: getCaptureHotkey(),
      displayHotkey: formatHotkeyForDisplay(getCaptureHotkey()),
      defaultHotkey: getDefaultHotkey(),
      defaultDisplayHotkey: formatHotkeyForDisplay(getDefaultHotkey()),
    };
  });

  // Validate hotkey
  ipcMain.handle('validate-hotkey', (_event, hotkey: string) => {
    return validateHotkey(hotkey);
  });

  // Save and apply new hotkey
  ipcMain.handle('save-hotkey', async (_event, hotkey: string) => {
    // Validate first
    const validation = validateHotkey(hotkey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Try to update the hotkey
    const success = updateHotkey(hotkey);
    if (success) {
      // Save to settings
      setCaptureHotkey(hotkey);
      const displayHotkey = formatHotkeyForDisplay(hotkey);
      // Notify main window about hotkey change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-changed', { hotkey, displayHotkey });
      }
      return {
        success: true,
        hotkey: hotkey,
        displayHotkey: displayHotkey,
      };
    } else {
      return {
        success: false,
        error: 'Failed to register hotkey. It may be in use by another application.',
      };
    }
  });

  // Reset hotkey to default
  ipcMain.handle('reset-hotkey', async () => {
    const defaultHotkey = getDefaultHotkey();
    const success = updateHotkey(defaultHotkey);
    if (success) {
      resetCaptureHotkey();
      const displayHotkey = formatHotkeyForDisplay(defaultHotkey);
      // Notify main window about hotkey change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-changed', { hotkey: defaultHotkey, displayHotkey });
      }
      return {
        success: true,
        hotkey: defaultHotkey,
        displayHotkey: displayHotkey,
      };
    } else {
      return {
        success: false,
        error: 'Failed to reset hotkey',
      };
    }
  });

  // Set traffic lights (window buttons) visibility
  ipcMain.handle('set-traffic-lights-visible', (_event, visible: boolean) => {
    if (mainWindow && process.platform === 'darwin') {
      mainWindow.setWindowButtonVisibility(visible);
    }
  });

  // Slack IPC handlers
  slackService = createSlackService();

  ipcMain.handle('slack-connect', async () => {
    if (!slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await slackService.startOAuthFlow();
  });

  ipcMain.handle('slack-disconnect', async () => {
    if (!slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await slackService.disconnect();
  });

  ipcMain.handle('slack-status', async () => {
    if (!slackService) {
      return { connected: false };
    }
    return await slackService.getConnectionStatus();
  });

  ipcMain.handle('slack-channels', async () => {
    if (!slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await slackService.getChannels();
  });

  ipcMain.handle('slack-search', async (_event, { query, channels, count }: { query: string; channels?: string[]; count?: number }) => {
    if (!slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await slackService.searchMessages(query, channels, count);
  });

  // Notion IPC handlers
  notionService = createNotionService();

  ipcMain.handle('notion-connect', async () => {
    if (!notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await notionService.startOAuthFlow();
  });

  ipcMain.handle('notion-disconnect', async () => {
    if (!notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await notionService.disconnect();
  });

  ipcMain.handle('notion-status', async () => {
    if (!notionService) {
      return { connected: false };
    }
    return await notionService.getConnectionStatus();
  });

  ipcMain.handle('notion-search', async (_event, { query, pageSize }: { query: string; pageSize?: number }) => {
    if (!notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await notionService.searchPages(query, pageSize);
  });

  ipcMain.handle('notion-get-content', async (_event, { pageId }: { pageId: string }) => {
    if (!notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await notionService.getPageContent(pageId);
  });

  // Gmail IPC handlers
  gmailService = createGmailService();

  ipcMain.handle('gmail-connect', async () => {
    if (!gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await gmailService.startOAuthFlow();
  });

  ipcMain.handle('gmail-disconnect', async () => {
    if (!gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await gmailService.disconnect();
  });

  ipcMain.handle('gmail-status', async () => {
    if (!gmailService) {
      return { connected: false };
    }
    return await gmailService.getConnectionStatus();
  });

  ipcMain.handle('gmail-search', async (_event, { query, maxResults }: { query: string; maxResults?: number }) => {
    if (!gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await gmailService.searchEmails(query, maxResults);
  });

  ipcMain.handle('get-device-id', () => {
    return getDeviceId();
  });

  ipcMain.handle('get-language', () => {
    return getLanguage();
  });

  ipcMain.handle('set-language', async (_event, lang: string) => {
    setLanguage(lang);
    await changeLanguage(lang);
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(win => {
      win.webContents.send('language-changed', lang);
    });
    return { success: true };
  });

  ipcMain.handle('get-supported-languages', () => {
    return getSupportedLanguages();
  });

  ipcMain.handle('translate', (_event, key: string, options?: Record<string, unknown>) => {
    return t(key, options as Record<string, any>);
  });

  // Reverse translation map for autoTranslate
  ipcMain.handle('get-reverse-translation-map', () => {
    const translations = i18next.getResourceBundle('en', 'translation');
    const reverseMap: Record<string, string> = {};
    
    function flatten(obj: any, prefix = '') {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          flatten(obj[key], fullKey);
        } else if (typeof obj[key] === 'string') {
          reverseMap[obj[key]] = fullKey;
        }
      }
    }
    flatten(translations);
    return reverseMap;
  });

  geminiAnalyzer = createGeminiAnalyzer();
  if (geminiAnalyzer) {
    console.log('Gemini AI analysis enabled (default)');
  }

  // Also initialize Anthropic as fallback
  anthropicAnalyzer = createAnthropicAnalyzer();
  if (anthropicAnalyzer) {
    console.log('Anthropic AI analysis enabled (fallback)');
  }

  // Load Linear data first (if token exists)
  await loadLinearData();

  // Create tray
  createTray({
    onCapture: handleCapture,
    onSettings: createSettingsWindow,
    onQuit: () => app.quit(),
  });

  // Register global hotkey (use saved hotkey or default)
  const savedHotkey = getCaptureHotkey();
  registerHotkey(handleCapture, savedHotkey);
  console.log(`Using hotkey: ${savedHotkey}`);

  // Check token status for existing users (not first launch)
  if (hasLaunched && !hasToken()) {
    // Existing user without token - force settings window
    console.log('Existing user without token, opening settings...');
    createSettingsWindow();
  }

  // Create and show main window on startup
  createWindow();
  mainWindow?.show();

  // Initialize auto-updater (only in packaged app)
  if (app.isPackaged && mainWindow) {
    initAutoUpdater(mainWindow);

    // Check for updates after 5 seconds (avoid blocking startup)
    setTimeout(() => {
      console.log('Checking for updates...');
      checkForUpdates();
    }, 5000);

    // Check for updates every 4 hours
    setInterval(() => {
      console.log('Periodic update check...');
      checkForUpdates();
    }, 4 * 60 * 60 * 1000);
  }

  console.log('Linear Capture ready! Press ⌘+Shift+L to capture.');
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  destroyTray();
});

// macOS specific: keep app running when all windows closed
app.on('window-all-closed', () => {
  // Don't quit on macOS
});

app.on('activate', () => {
  // Dock 아이콘 클릭 시 메인 윈도우 표시
  if (!mainWindow) {
    createWindow();
  }
  mainWindow?.show();
  mainWindow?.focus();
});
