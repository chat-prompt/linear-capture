import { app, BrowserWindow, ipcMain, clipboard, Notification, systemPreferences } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import Store from 'electron-store';

// Debug logging to file for packaged app
let logFile: string | null = null;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function setupFileLogging() {
  try {
    logFile = path.join(app.getPath('userData'), 'debug.log');
    // Clear old log
    fs.writeFileSync(logFile, `=== Linear Capture Debug Log ===\nStarted: ${new Date().toISOString()}\n\n`);
  } catch (e) {
    originalConsoleError('Failed to setup file logging:', e);
  }
}

console.log = (...args: unknown[]) => {
  originalConsoleLog(...args);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `[LOG] ${new Date().toISOString()} ${args.join(' ')}\n`);
    } catch {}
  }
};
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `[ERR] ${new Date().toISOString()} ${args.join(' ')}\n`);
    } catch {}
  }
};

import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { createTray, destroyTray } from './tray';
import { captureSelection, cleanupCapture } from '../services/capture';
import {
  getPermissionStatus,
  recoverPermission,
  openScreenCaptureSettings,
  resetScreenCapturePermission,
} from '../services/permission';
import { createR2UploaderFromEnv } from '../services/r2-uploader';
import { createLinearService, TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo } from '../services/linear-client';
import { createGeminiAnalyzer, GeminiAnalyzer, AnalysisResult, AnalysisContext } from '../services/gemini-analyzer';
import { createAnthropicAnalyzer, AnthropicAnalyzer } from '../services/anthropic-analyzer';
import {
  getLinearToken,
  setLinearToken,
  clearLinearToken,
  hasToken,
  getUserInfo,
  setUserInfo,
  validateToken,
  UserInfo as SettingsUserInfo,
} from '../services/settings-store';

// Load environment variables - handle both dev and packaged paths
const envPaths = [
  path.join(__dirname, '../../.env'),  // Dev: dist/main -> .env
  path.join(process.resourcesPath || '', '.env'),  // Packaged: Resources/.env
  path.join(app.getAppPath(), '.env'),  // Packaged: inside asar
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`Loaded .env from: ${envPath}`);
    envLoaded = true;
    break;
  }
}
if (!envLoaded) {
  console.error('Failed to load .env from any path:', envPaths);
}

let mainWindow: BrowserWindow | null = null;
let onboardingWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let capturedFilePath: string | null = null;
let uploadedImageUrl: string | null = null;

// App settings store
const store = new Store();

// Cache for teams, projects, users, states, cycles
let teamsCache: TeamInfo[] = [];
let projectsCache: ProjectInfo[] = [];
let usersCache: UserInfo[] = [];
let statesCache: WorkflowStateInfo[] = [];
let cyclesCache: CycleInfo[] = [];

// AI analyzer instance (Anthropic or Gemini)
let geminiAnalyzer: GeminiAnalyzer | null = null;
let anthropicAnalyzer: AnthropicAnalyzer | null = null;

/**
 * Show permission required notification with recovery option
 */
function showPermissionNotification(needsReset: boolean = false): void {
  const notification = new Notification({
    title: '화면 녹화 권한 필요',
    body: needsReset
      ? '권한 문제가 감지되었습니다. 클릭하여 복구를 시작합니다.'
      : '클릭하여 시스템 환경설정을 엽니다',
  });

  notification.on('click', async () => {
    if (needsReset) {
      await recoverPermission();
    } else {
      await openScreenCaptureSettings();
    }
  });

  notification.show();
}

/**
 * Create the onboarding window (shown on first launch)
 */
function createOnboardingWindow(): void {
  onboardingWindow = new BrowserWindow({
    width: 380,
    height: 414,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));

  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow?.show();
  });

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

/**
 * Create the settings window
 */
function createSettingsWindow(): void {
  // If settings window already exists, focus it
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 380,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
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
  mainWindow = new BrowserWindow({
    width: 728,
    height: 720,
    show: false,
    frame: true,
    resizable: false,
    alwaysOnTop: false,  // 기본값은 false, 단축키로 열 때만 일시적으로 최상위
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Cleanup temp file if window closed without submission
    if (capturedFilePath) {
      cleanupCapture(capturedFilePath);
      capturedFilePath = null;
      uploadedImageUrl = null;
    }
  });
}

/**
 * Show the issue creation window with captured image
 */
function showCaptureWindow(filePath: string, imageUrl: string, analysis?: AnalysisResult): void {
  capturedFilePath = filePath;
  uploadedImageUrl = imageUrl;

  if (!mainWindow) {
    createWindow();
  }

  const sendCaptureData = () => {
    console.log('Sending capture-ready event to renderer...');
    console.log('Analysis data:', JSON.stringify({
      title: analysis?.title,
      description: analysis?.description?.substring(0, 100),
      success: analysis?.success
    }));
    mainWindow?.webContents.send('capture-ready', {
      filePath,
      imageUrl,
      teams: teamsCache,
      projects: projectsCache,
      users: usersCache,
      states: statesCache,
      cycles: cyclesCache,
      defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || '',
      suggestedTitle: analysis?.title || '',
      suggestedDescription: analysis?.description || '',
      // AI 추천 메타데이터
      suggestedProjectId: analysis?.suggestedProjectId || '',
      suggestedAssigneeId: analysis?.suggestedAssigneeId || '',
      suggestedPriority: analysis?.suggestedPriority || 0,
      suggestedEstimate: analysis?.suggestedEstimate || 0,
    });
  };

  // Check if webContents is still loading
  if (mainWindow?.webContents.isLoading()) {
    console.log('Window still loading, waiting for did-finish-load...');
    mainWindow.webContents.once('did-finish-load', sendCaptureData);
  } else {
    // Already loaded, send immediately
    sendCaptureData();
  }

  // 창을 열 때 일시적으로 최상위로 올린 후, 포커스 후 해제
  mainWindow?.setAlwaysOnTop(true);
  mainWindow?.show();
  mainWindow?.focus();

  // 잠시 후 alwaysOnTop 해제 → 일반 창처럼 동작
  setTimeout(() => {
    mainWindow?.setAlwaysOnTop(false);
  }, 100);
}

/**
 * Handle screen capture flow
 */
async function handleCapture(): Promise<void> {
  try {
    // Check if Linear token is configured
    if (!hasToken()) {
      showNotification('토큰 설정 필요', 'Linear API 토큰을 먼저 설정해주세요');
      createSettingsWindow();
      return;
    }

    // Check screen capture permission first
    const permissionStatus = getPermissionStatus();
    if (!permissionStatus.hasPermission) {
      showPermissionNotification(permissionStatus.needsReset);
      return; // Block capture if no permission
    }

    const captureStartTime = Date.now();

  // Hide window if visible during capture
  mainWindow?.minimize();

  const result = await captureSelection();

  if (!result.success || !result.filePath) {
    console.log('Capture cancelled or failed:', result.error);
    return;
  }

  console.log('Capture successful:', result.filePath);

  // Upload to R2
  const r2 = createR2UploaderFromEnv();
  if (!r2) {
    showNotification('Error', 'R2 not configured. Please check .env file.');
    cleanupCapture(result.filePath);
    return;
  }

  // Show window immediately with loading state
  showCaptureWindow(result.filePath, '', undefined);

  // Prepare analysis context
  const analysisContext: AnalysisContext = {
    projects: projectsCache.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description
    })),
    users: usersCache.map(u => ({ id: u.id, name: u.name })),
    defaultTeamId: process.env.DEFAULT_TEAM_ID,
  };

  // Start upload and AI analysis in parallel
  const uploadStartTime = Date.now();
  console.log('Starting R2 upload and AI analysis in parallel...');

  const uploadPromise = r2.upload(result.filePath);

  // Use Gemini if available, otherwise Anthropic (with fallback)
  const capturedFilePath = result.filePath;
  const analysisPromise = (async () => {
    // Try Gemini first
    if (geminiAnalyzer) {
      try {
        const geminiResult = await geminiAnalyzer.analyzeScreenshot(capturedFilePath, analysisContext);
        if (geminiResult.success) return geminiResult;
        // Gemini returned success: false, fallback to Anthropic
        console.log('Gemini returned no result, falling back to Anthropic...');
      } catch (error: any) {
        console.error('Gemini analysis failed:', error?.message || error);
      }
      // Fallback to Anthropic (both after exception and success: false)
      if (anthropicAnalyzer) {
        try {
          return await anthropicAnalyzer.analyzeScreenshot(capturedFilePath, analysisContext);
        } catch (fallbackError: any) {
          console.error('Anthropic fallback also failed:', fallbackError?.message);
        }
      }
    } else if (anthropicAnalyzer) {
      // Only Anthropic available
      try {
        return await anthropicAnalyzer.analyzeScreenshot(capturedFilePath, analysisContext);
      } catch (error: any) {
        console.error('Anthropic analysis failed:', error?.message || error);
      }
    }
    return { title: '', description: '', success: false };
  })();

  // Wait for both to complete
  const [uploadResult, analysisResult] = await Promise.all([
    uploadPromise,
    analysisPromise
  ]);

  const uploadEndTime = Date.now();
  console.log(`⏱️ Upload completed in ${uploadEndTime - uploadStartTime}ms`);
  console.log(`⏱️ AI analysis completed in ${uploadEndTime - uploadStartTime}ms (parallel)`);
  console.log(`⏱️ Total time from capture: ${uploadEndTime - captureStartTime}ms`);

  if (!uploadResult.success || !uploadResult.url) {
    showNotification('Upload Failed', uploadResult.error || 'Unknown error');
    cleanupCapture(result.filePath);
    return;
  }

  console.log('Upload successful:', uploadResult.url);
  uploadedImageUrl = uploadResult.url;

  // Send AI results to renderer
  if (analysisResult.success) {
    mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
  } else {
    mainWindow?.webContents.send('ai-analysis-ready', { success: false });
  }
  } catch (error) {
    console.error('handleCapture error:', error);
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
async function loadLinearData(): Promise<boolean> {
  const token = getLinearToken();
  if (!token) {
    console.log('No Linear token configured');
    return false;
  }

  const linear = createLinearService(token);
  if (!linear) {
    console.error('Failed to create Linear service');
    return false;
  }

  try {
    // Load all data in parallel for faster startup
    const [teams, projects, users, states, cycles] = await Promise.all([
      linear.getTeams(),
      linear.getProjects(),
      linear.getUsers(),
      linear.getWorkflowStates(),
      linear.getCycles(),
    ]);

    teamsCache = teams;
    projectsCache = projects;
    usersCache = users;
    statesCache = states;
    cyclesCache = cycles;

    console.log(`Loaded: ${teamsCache.length} teams, ${projectsCache.length} projects, ${usersCache.length} users, ${statesCache.length} states, ${cyclesCache.length} cycles`);
    return true;
  } catch (error) {
    console.error('Failed to load Linear data:', error);
    return false;
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Setup file logging first
  setupFileLogging();
  console.log('App ready, isPackaged:', app.isPackaged);
  console.log('App path:', app.getAppPath());
  console.log('Resource path:', process.resourcesPath);

  // Dock에 아이콘 표시 (Alt+Tab에 보이게)
  app.dock?.show();

  // Check if first launch and show onboarding
  const hasLaunched = store.get('hasLaunched', false);
  if (!hasLaunched) {
    store.set('hasLaunched', true);
    createOnboardingWindow();
  }

  // IPC handlers for onboarding window
  ipcMain.on('open-screen-capture-settings', async () => {
    // Request permission (triggers dialog on first call)
    const status = getPermissionStatus();
    console.log('Permission status:', status);

    if (!status.hasPrompted) {
      // First time - trigger permission dialog
      console.log('Triggering permission request...');
      await captureSelection(); // This registers app in TCC
    }

    // Open system preferences
    await openScreenCaptureSettings();
  });

  ipcMain.on('reset-permission', async () => {
    console.log('Resetting screen capture permission...');
    await resetScreenCapturePermission();
    console.log('Permission reset complete. User should re-grant permission.');
    // Open settings after reset
    await openScreenCaptureSettings();
  });

  ipcMain.handle('get-permission-status', () => {
    return getPermissionStatus();
  });

  ipcMain.on('close-onboarding', () => {
    onboardingWindow?.close();
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
  }) => {
    const token = getLinearToken();
    if (!token) {
      return { success: false, error: 'No Linear token configured' };
    }

    const linear = createLinearService(token);
    if (!linear) {
      return { success: false, error: 'Failed to create Linear service' };
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
      imageUrl: uploadedImageUrl || undefined,
    });

    if (result.success && result.issueUrl) {
      // Copy URL to clipboard
      clipboard.writeText(result.issueUrl);
      showNotification('Issue Created!', `${result.issueIdentifier} - URL copied to clipboard`);

      // Cleanup
      if (capturedFilePath) {
        cleanupCapture(capturedFilePath);
        capturedFilePath = null;
      }
      uploadedImageUrl = null;

      // Close window
      mainWindow?.minimize();
    }

    return result;
  });

  ipcMain.handle('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('cancel', () => {
    if (capturedFilePath) {
      cleanupCapture(capturedFilePath);
      capturedFilePath = null;
    }
    uploadedImageUrl = null;
    mainWindow?.minimize();
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings', () => {
    return {
      linearApiToken: getLinearToken() || '',
      userInfo: getUserInfo(),
    };
  });

  ipcMain.handle('save-settings', async (_event, data: { linearApiToken: string }) => {
    try {
      // Validate token first
      const validationResult = await validateToken(data.linearApiToken);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error || 'Invalid token' };
      }

      // Save token and user info
      setLinearToken(data.linearApiToken);
      if (validationResult.user) {
        setUserInfo(validationResult.user);
      }

      // Reload Linear data with new token
      await loadLinearData();

      return { success: true, user: validationResult.user };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('validate-token', async (_event, token: string) => {
    return validateToken(token);
  });

  ipcMain.handle('clear-token', async () => {
    clearLinearToken();
    // Clear cache
    teamsCache = [];
    projectsCache = [];
    usersCache = [];
    statesCache = [];
    cyclesCache = [];
    return { success: true };
  });

  ipcMain.handle('close-settings', () => {
    settingsWindow?.close();
  });

  // Handle re-analyze request with specific model
  ipcMain.handle('reanalyze', async (_event, data: { filePath: string; model: string }) => {
    console.log(`Re-analyzing with model: ${data.model}`);

    const analysisContext: AnalysisContext = {
      projects: projectsCache.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description
      })),
      users: usersCache.map(u => ({ id: u.id, name: u.name })),
      defaultTeamId: process.env.DEFAULT_TEAM_ID,
    };

    try {
      let analysisResult: AnalysisResult;

      if (data.model === 'haiku') {
        // Use Anthropic Haiku
        const analyzer = createAnthropicAnalyzer();
        if (!analyzer) {
          mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Anthropic API key not set' };
        }
        analysisResult = await analyzer.analyzeScreenshot(data.filePath, analysisContext);
      } else {
        // Use Gemini
        const analyzer = createGeminiAnalyzer();
        if (!analyzer) {
          mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Gemini API key not set' };
        }
        analysisResult = await analyzer.analyzeScreenshot(data.filePath, analysisContext);
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

  // Initialize AI analyzer (prefer Gemini, fallback to Anthropic)
  geminiAnalyzer = createGeminiAnalyzer();
  if (geminiAnalyzer) {
    console.log('Gemini AI analysis enabled (default)');
  }

  // Also initialize Anthropic as fallback
  anthropicAnalyzer = createAnthropicAnalyzer();
  if (anthropicAnalyzer) {
    console.log('Anthropic AI analysis enabled (fallback)');
  }

  // Load Linear data first
  await loadLinearData();

  // Create tray
  createTray({
    onCapture: handleCapture,
    onSettings: createSettingsWindow,
    onQuit: () => app.quit(),
  });

  // Check Accessibility permission for global hotkey (macOS)
  if (process.platform === 'darwin') {
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);
    console.log(`Accessibility permission: ${isTrusted ? 'granted' : 'not granted (prompt shown)'}`);
  }

  // Register global hotkey
  const hotkeyRegistered = registerHotkey(handleCapture);
  if (!hotkeyRegistered) {
    console.error('Failed to register hotkey - Accessibility permission may be required');
  }

  // Create and show main window immediately
  createWindow();

  // Show main window when ready (with Linear data or settings prompt)
  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();

      // Send initial data to renderer
      mainWindow?.webContents.send('app-ready', {
        teams: teamsCache,
        projects: projectsCache,
        users: usersCache,
        states: statesCache,
        cycles: cyclesCache,
        defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
        defaultProjectId: process.env.DEFAULT_PROJECT_ID || '',
        hasToken: hasToken(),
      });

      // If no token, open settings
      if (!hasToken()) {
        createSettingsWindow();
      }
    });
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
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
