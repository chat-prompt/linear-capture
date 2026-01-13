import { app, BrowserWindow, ipcMain, clipboard, Notification } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { createTray, destroyTray } from './tray';
import { captureSelection, cleanupCapture } from '../services/capture';
import { createR2UploaderFromEnv } from '../services/r2-uploader';
import { createLinearServiceFromEnv, TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo } from '../services/linear-client';
import { createGeminiAnalyzer, GeminiAnalyzer, AnalysisResult, AnalysisContext } from '../services/gemini-analyzer';
import { createAnthropicAnalyzer, AnthropicAnalyzer } from '../services/anthropic-analyzer';

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

// AI analyzer instance (Anthropic or Gemini)
let geminiAnalyzer: GeminiAnalyzer | null = null;
let anthropicAnalyzer: AnthropicAnalyzer | null = null;

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
    alwaysOnTop: true,
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

  mainWindow?.show();
  mainWindow?.focus();
}

/**
 * Handle screen capture flow
 */
async function handleCapture(): Promise<void> {
  const captureStartTime = Date.now();
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

  // Use Anthropic if available, otherwise Gemini
  const analyzer = anthropicAnalyzer || geminiAnalyzer;
  const analysisPromise = analyzer
    ? analyzer.analyzeScreenshot(result.filePath, analysisContext)
    : Promise.resolve({ title: '', description: '', success: false });

  // Wait for both to complete
  const [uploadResult, analysisResult] = await Promise.all([
    uploadPromise,
    analysisPromise.catch((error) => {
      console.error('Gemini analysis error:', error?.message || error);
      console.error('Full error:', JSON.stringify(error, null, 2));
      return { title: '', description: '', success: false };
    })
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
    console.log('AI analysis successful:', analysisResult.title);
    mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
  } else {
    console.log('AI analysis failed or disabled');
    mainWindow?.webContents.send('ai-analysis-ready', { success: false });
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

  // Initialize AI analyzer (prefer Anthropic, fallback to Gemini)
  anthropicAnalyzer = createAnthropicAnalyzer();
  if (anthropicAnalyzer) {
    console.log('Anthropic AI analysis enabled (Haiku)');
  } else {
    geminiAnalyzer = createGeminiAnalyzer();
    if (geminiAnalyzer) {
      console.log('Gemini AI analysis enabled');
    }
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
