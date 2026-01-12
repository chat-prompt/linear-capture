import { app, BrowserWindow, ipcMain, clipboard, Notification } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { createTray, destroyTray } from './tray';
import { captureSelection, cleanupCapture } from '../services/capture';
import { createR2UploaderFromEnv } from '../services/r2-uploader';
import { createLinearServiceFromEnv, TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo } from '../services/linear-client';
import { createGeminiAnalyzer, GeminiAnalyzer, AnalysisResult } from '../services/gemini-analyzer';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

let mainWindow: BrowserWindow | null = null;
let capturedFilePath: string | null = null;
let uploadedImageUrl: string | null = null;

// Cache for teams, projects, users, states, cycles
let teamsCache: TeamInfo[] = [];
let projectsCache: ProjectInfo[] = [];
let usersCache: UserInfo[] = [];
let statesCache: WorkflowStateInfo[] = [];
let cyclesCache: CycleInfo[] = [];

// Gemini analyzer instance
let geminiAnalyzer: GeminiAnalyzer | null = null;

/**
 * Create the issue creation window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    show: false,
    frame: true,
    resizable: false,
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

  mainWindow?.show();
  mainWindow?.focus();
}

/**
 * Handle screen capture flow
 */
async function handleCapture(): Promise<void> {
  console.log('Starting capture...');

  // Hide window if visible during capture
  mainWindow?.hide();

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

  // Start upload and AI analysis in parallel
  console.log('Uploading to R2 and analyzing with Gemini...');

  const uploadPromise = r2.upload(result.filePath);
  const analysisPromise = geminiAnalyzer
    ? geminiAnalyzer.analyzeScreenshot(result.filePath)
    : Promise.resolve({ title: '', description: '', success: false });

  const [uploadResult, analysisResult] = await Promise.all([
    uploadPromise,
    analysisPromise.catch((error) => {
      console.error('Gemini analysis error:', error);
      return { title: '', description: '', success: false };
    }),
  ]);

  if (!uploadResult.success || !uploadResult.url) {
    showNotification('Upload Failed', uploadResult.error || 'Unknown error');
    cleanupCapture(result.filePath);
    return;
  }

  console.log('Upload successful:', uploadResult.url);
  if (analysisResult.success) {
    console.log('AI analysis successful:', analysisResult.title);
  } else {
    console.log('AI analysis skipped or failed');
  }

  // Show window with capture and AI suggestions
  showCaptureWindow(result.filePath, uploadResult.url, analysisResult);
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
  } catch (error) {
    console.error('Failed to load Linear data:', error);
  }
}

// App lifecycle
app.whenReady().then(async () => {
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
    const linear = createLinearServiceFromEnv();
    if (!linear) {
      return { success: false, error: 'Linear not configured' };
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
      mainWindow?.hide();
    }

    return result;
  });

  ipcMain.handle('cancel', () => {
    if (capturedFilePath) {
      cleanupCapture(capturedFilePath);
      capturedFilePath = null;
    }
    uploadedImageUrl = null;
    mainWindow?.hide();
  });

  // Initialize Gemini analyzer
  geminiAnalyzer = createGeminiAnalyzer();
  if (geminiAnalyzer) {
    console.log('Gemini AI analysis enabled');
  }

  // Load Linear data first
  await loadLinearData();

  // Create tray
  createTray({
    onCapture: handleCapture,
    onQuit: () => app.quit(),
  });

  // Register global hotkey
  registerHotkey(handleCapture);

  // Create window (hidden)
  createWindow();

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
