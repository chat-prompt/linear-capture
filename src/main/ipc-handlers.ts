import { app, ipcMain, clipboard, BrowserWindow } from 'electron';
import { logger } from '../services/utils/logger';
import { cleanupCapture } from '../services/capture';
import { createR2UploaderFromEnv } from '../services/r2-uploader';
import { createLinearServiceFromEnv, validateLinearToken } from '../services/linear-client';
import { createGeminiAnalyzer } from '../services/gemini-analyzer';
import { createAnthropicAnalyzer } from '../services/anthropic-analyzer';
import {
  setLinearToken,
  clearLinearToken,
  getUserInfo,
  setUserInfo,
  getAllSettings,
  getCaptureHotkey,
  setCaptureHotkey,
  resetCaptureHotkey,
  getDefaultHotkey,
  getDeviceId,
  getLanguage,
  setLanguage,
  getSupportedLanguages,
  getOpenaiApiKey,
  setOpenaiApiKey,
  getSelectedSlackChannels,
  setSelectedSlackChannels,
  UserInfo as SettingsUserInfo,
  SlackChannelInfo,
} from '../services/settings-store';
import { getLocalSearchService } from '../services/local-search';
import { checkForUpdates } from '../services/auto-updater';
import { getAiRecommendations } from '../services/ai-recommend';
import { getAdapter } from '../services/context-adapters';
import { getSemanticSearchService } from '../services/semantic-search';
import { createGmailService } from '../services/gmail-client';
import { trackIssueCreated } from '../services/analytics';
import { updateHotkey, validateHotkey, formatHotkeyForDisplay } from './hotkey';
import { changeLanguage, t, i18next } from './i18n';
import { getState } from './state';
import { cleanupSession, handleCapture } from './capture-session';
import { createSettingsWindow, createMainWindow, openScreenCaptureSettings } from './window-manager';
import { MAX_IMAGES } from './types';
import type { AnalysisContext } from '../services/gemini-analyzer';
import type { ContextSource } from '../types/context-search';

export async function loadLinearData(): Promise<void> {
  const state = getState();
  const linear = createLinearServiceFromEnv();
  if (!linear) {
    logger.error('Linear not configured');
    return;
  }

  try {
    const [teams, projects, users, states, cycles, labels] = await Promise.all([
      linear.getTeams(),
      linear.getProjects(),
      linear.getUsers(),
      linear.getWorkflowStates(),
      linear.getCycles(),
      linear.getLabels(),
    ]);

    state.teamsCache = teams;
    state.projectsCache = projects;
    state.usersCache = users;
    state.statesCache = states;
    state.cyclesCache = cycles;
    state.labelsCache = labels;

    logger.log(`Loaded: ${state.teamsCache.length} teams, ${state.projectsCache.length} projects, ${state.usersCache.length} users, ${state.statesCache.length} states, ${state.cyclesCache.length} cycles, ${state.labelsCache.length} labels`);

    try {
      const { loadLocalCache } = await import('../services/linear-local-cache');
      const localCache = await loadLocalCache();
      if (localCache) {
        for (const project of state.projectsCache) {
          const cached = localCache.projects.find(p => p.id === project.id);
          if (cached) {
            project.recentIssueTitles = cached.recentIssueTitles;
          }
        }
        logger.log(`Merged local cache: ${localCache.projects.length} projects with recent issues`);
      }
    } catch (cacheError) {
      logger.warn('Failed to load local cache (non-critical):', cacheError instanceof Error ? cacheError.message : 'Unknown error');
    }
  } catch (error) {
    logger.error('Failed to load Linear data:', error);
  }
}

export function registerIpcHandlers(): void {
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

    const r2 = createR2UploaderFromEnv();
    if (!r2) {
      return { success: false, error: 'R2 not configured' };
    }

    const imageUrls: string[] = [];
    const totalImages = state.captureSession?.images.length || 0;
    if (totalImages > 0) {
      logger.log(`Uploading ${totalImages} images to R2...`);
      const uploadResults = await Promise.all(
        state.captureSession!.images.map(img => r2.upload(img.filePath))
      );

      for (const uploadResult of uploadResults) {
        if (uploadResult.success && uploadResult.url) {
          imageUrls.push(uploadResult.url);
        }
      }
      logger.log(`Successfully uploaded ${imageUrls.length}/${totalImages} images`);

      if (imageUrls.length < totalImages && imageUrls.length > 0) {
        logger.warn(`${totalImages - imageUrls.length} image(s) failed to upload`);
      }

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
      clipboard.writeText(result.issueUrl);
      cleanupSession();
      trackIssueCreated(imageUrls.length, false);
    }

    return result;
  });

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

  ipcMain.handle('reanalyze', async (_event, data: { filePath: string; model: string; instruction?: string }) => {
    // Fix: empty array is truthy, so we need explicit length check
    const sessionImages = state.captureSession?.images.map(img => img.filePath);
    const imagePaths = (sessionImages && sessionImages.length > 0) ? sessionImages : [data.filePath];
    
    logger.log(`Re-analyzing ${imagePaths.length} image(s) with model: ${data.model}`);
    logger.log(`Session state: ${state.captureSession ? `${state.captureSession.images.length} images` : 'null'}`);
    logger.log(`Image paths: ${JSON.stringify(imagePaths)}`);

    const analysisContext: AnalysisContext = {
      projects: state.projectsCache.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        recentIssueTitles: p.recentIssueTitles,
      })),
      users: state.usersCache.map(u => ({ id: u.id, name: u.name })),
      defaultTeamId: process.env.DEFAULT_TEAM_ID,
      instruction: data.instruction,
      language: getLanguage(),
    };

    try {
      let analysisResult;

      if (data.model === 'haiku') {
        const analyzer = createAnthropicAnalyzer();
        if (!analyzer) {
          state.mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Anthropic API key not set' };
        }
        analysisResult = await analyzer.analyzeScreenshot(imagePaths[0], analysisContext);
      } else {
        const analyzer = createGeminiAnalyzer();
        if (!analyzer) {
          state.mainWindow?.webContents.send('ai-analysis-ready', { success: false });
          return { success: false, error: 'Gemini API key not set' };
        }
        analysisResult = await analyzer.analyzeMultipleScreenshots(imagePaths, analysisContext);
      }

      if (analysisResult.success) {
        logger.log('Re-analysis successful:', analysisResult.title);
        state.mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
      } else {
        logger.warn('Re-analysis failed:', analysisResult.error || 'Unknown error');
        state.mainWindow?.webContents.send('ai-analysis-ready', { 
          success: false, 
          error: analysisResult.error || 'Analysis failed' 
        });
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Re-analyze error:', errorMessage);
      state.mainWindow?.webContents.send('ai-analysis-ready', { 
        success: false, 
        error: errorMessage 
      });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('get-settings', async () => {
    return getAllSettings();
  });

  ipcMain.handle('validate-token', async (_event, token: string) => {
    try {
      const result = await validateLinearToken(token);
      return result;
    } catch (error) {
      logger.error('Token validation error:', error);
      return { valid: false, error: String(error) };
    }
  });

  ipcMain.handle('save-settings', async (_event, data: { linearApiToken: string; userInfo: SettingsUserInfo }) => {
    try {
      setLinearToken(data.linearApiToken);
      setUserInfo(data.userInfo);
      await loadLinearData();
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('settings-updated');
        state.mainWindow.webContents.send('linear-data-updated', {
          teams: state.teamsCache,
          projects: state.projectsCache,
          users: state.usersCache,
          states: state.statesCache,
          cycles: state.cyclesCache,
          labels: state.labelsCache,
          defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
        });
      }
      return { success: true };
    } catch (error) {
      logger.error('Save settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('clear-settings', async () => {
    try {
      clearLinearToken();
      return { success: true };
    } catch (error) {
      logger.error('Clear settings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('close-settings', () => {
    state.settingsWindow?.close();
  });

  ipcMain.handle('check-for-updates', async () => {
    if (app.isPackaged) {
      await checkForUpdates(false);
      return { success: true };
    } else {
      return { success: false, error: 'Updates only work in packaged app' };
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-hotkey', () => {
    return {
      hotkey: getCaptureHotkey(),
      displayHotkey: formatHotkeyForDisplay(getCaptureHotkey()),
      defaultHotkey: getDefaultHotkey(),
      defaultDisplayHotkey: formatHotkeyForDisplay(getDefaultHotkey()),
    };
  });

  ipcMain.handle('validate-hotkey', (_event, hotkey: string) => {
    return validateHotkey(hotkey);
  });

  ipcMain.handle('save-hotkey', async (_event, hotkey: string) => {
    const validation = validateHotkey(hotkey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const success = updateHotkey(hotkey);
    if (success) {
      setCaptureHotkey(hotkey);
      const displayHotkey = formatHotkeyForDisplay(hotkey);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('hotkey-changed', { hotkey, displayHotkey });
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

  ipcMain.handle('reset-hotkey', async () => {
    const defaultHotkey = getDefaultHotkey();
    const success = updateHotkey(defaultHotkey);
    if (success) {
      resetCaptureHotkey();
      const displayHotkey = formatHotkeyForDisplay(defaultHotkey);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('hotkey-changed', { hotkey: defaultHotkey, displayHotkey });
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

  ipcMain.handle('set-traffic-lights-visible', (_event, visible: boolean) => {
    if (state.mainWindow && process.platform === 'darwin') {
      state.mainWindow.setWindowButtonVisibility(visible);
    }
  });

  ipcMain.handle('slack-connect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.startOAuthFlow();
  });

  ipcMain.handle('slack-disconnect', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.disconnect();
  });

  ipcMain.handle('slack-status', async () => {
    if (!state.slackService) {
      return { connected: false };
    }
    return await state.slackService.getConnectionStatus();
  });

  ipcMain.handle('slack-channels', async () => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.getChannels();
  });

  ipcMain.handle('slack-search', async (_event, { query, channels, count }: { query: string; channels?: string[]; count?: number }) => {
    if (!state.slackService) {
      return { success: false, error: 'Slack service not initialized' };
    }
    return await state.slackService.searchMessages(query, channels, count);
  });

  ipcMain.handle('notion-connect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.startOAuthFlow();
  });

  ipcMain.handle('notion-disconnect', async () => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.disconnect();
  });

  ipcMain.handle('notion-status', async () => {
    if (!state.notionService) {
      return { connected: false };
    }
    return await state.notionService.getConnectionStatus();
  });

  ipcMain.handle('notion-search', async (_event, { query, pageSize }: { query: string; pageSize?: number }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.searchPages(query, pageSize);
  });

  ipcMain.handle('notion-get-content', async (_event, { pageId }: { pageId: string }) => {
    if (!state.notionService) {
      return { success: false, error: 'Notion service not initialized' };
    }
    return await state.notionService.getPageContent(pageId);
  });

  ipcMain.handle('gmail-connect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.startOAuthFlow();
  });

  ipcMain.handle('gmail-disconnect', async () => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.disconnect();
  });

  ipcMain.handle('gmail-status', async () => {
    if (!state.gmailService) {
      return { connected: false };
    }
    return await state.gmailService.getConnectionStatus();
  });

  ipcMain.handle('gmail-search', async (_event, { query, maxResults }: { query: string; maxResults?: number }) => {
    if (!state.gmailService) {
      return { success: false, error: 'Gmail service not initialized' };
    }
    return await state.gmailService.searchEmails(query, maxResults);
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

  ipcMain.handle('ai-recommend', async (_event, { text, limit }: { text: string; limit?: number }) => {
    return await getAiRecommendations(text, limit);
  });

  ipcMain.handle('context-semantic-search', async (_event, { query, source }: { query: string; source: string }) => {
    const debug: string[] = [];
    debug.push(`query="${query}", source="${source}"`);
    logger.log(`[SemanticSearch] Handler called! query="${query}", source="${source}"`);
    
    try {
      debug.push('Getting adapter...');
      logger.log(`[SemanticSearch] Getting adapter for ${source}...`);
      const adapter = getAdapter(source as ContextSource);
      
      debug.push('Checking connection...');
      logger.log(`[SemanticSearch] Got adapter, checking connection...`);
      const isConnected = await adapter.isConnected();
      debug.push(`isConnected=${isConnected}`);
      logger.log(`[SemanticSearch] ${source} connected: ${isConnected}`);
      
      if (!isConnected) {
        debug.push('Not connected, returning early');
        logger.log(`[SemanticSearch] ${source} not connected, returning empty results`);
        return { success: true, results: [], notConnected: true, _debug: debug };
      }
      
      debug.push('Fetching items...');
      const items = await adapter.fetchItems(query);
      debug.push(`fetchedItems=${items.length}`);
      logger.log(`[SemanticSearch] Fetched ${items.length} items from ${source}`);
      
      if (items.length === 0) {
        debug.push('No items found, returning empty');
        logger.log('[SemanticSearch] No items to search, returning empty results');
        return { success: true, results: [], _debug: debug };
      }
      
      debug.push('Calling semantic search service...');
      const searchService = getSemanticSearchService();
      const results = await searchService.search(query, items);
      debug.push(`searchResults=${results.length}`);
      logger.log(`[SemanticSearch] Search returned ${results.length} results`);
      
      return { success: true, results, _debug: debug };
    } catch (error) {
      debug.push(`ERROR: ${String(error)}`);
      logger.error('[SemanticSearch] Error:', error);
      return { success: false, error: String(error), results: [], _debug: debug };
    }
  });

  ipcMain.handle('context.getRelated', async (_event, { query, limit = 20 }: { query: string; limit?: number }) => {
    const debug: string[] = [];
    debug.push(`query="${query}", limit=${limit}`);
    
    if (!query || query.length < 3) {
      return { success: true, results: [], _debug: [...debug, 'query too short'] };
    }
    
    try {
      const QUOTA_PER_SOURCE = 5;
      
      const gmailService = createGmailService();
      const linearService = createLinearServiceFromEnv();
      
      const [slackConnected, notionConnected, gmailConnected, linearConnected] = await Promise.all([
        state.slackService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
        state.notionService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
        gmailService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
        Promise.resolve(linearService !== null),
      ]);
      
      debug.push(`connected: slack=${slackConnected}, notion=${notionConnected}, gmail=${gmailConnected}, linear=${linearConnected}`);

      const [slackResult, notionResult, gmailResult, linearResult] = await Promise.allSettled([
        (async () => {
          if (!slackConnected) return [];
          const result = await state.slackService!.searchMessages(query, undefined, QUOTA_PER_SOURCE);
          return (result.messages || []).map(m => ({
            id: `slack-${m.ts}`,
            source: 'slack' as const,
            title: `#${m.channel?.name || 'unknown'}`,
            snippet: m.text?.substring(0, 200) || '',
            url: m.permalink,
            timestamp: m.timestamp,
          }));
        })(),
        
        (async () => {
          if (!notionConnected) return [];
          const adapter = getAdapter('notion');
          const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
          return items.map(item => ({
            id: `notion-${item.id}`,
            source: 'notion' as const,
            title: item.title,
            snippet: item.content?.substring(0, 200) || '',
            url: item.url,
            timestamp: item.timestamp,
          }));
        })(),
        
        (async () => {
          if (!gmailConnected) return [];
          const adapter = getAdapter('gmail');
          const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
          return items.map(item => ({
            id: `gmail-${item.id}`,
            source: 'gmail' as const,
            title: item.title,
            snippet: item.content?.substring(0, 200) || '',
            url: item.url,
            timestamp: item.timestamp,
          }));
        })(),
        
        (async () => {
          if (!linearConnected) return [];
          const adapter = getAdapter('linear');
          const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
          return items.map(item => ({
            id: `linear-${item.id}`,
            source: 'linear' as const,
            title: item.title,
            snippet: item.content?.substring(0, 200) || '',
            url: item.url,
          }));
        })(),
      ]);
      
      const results: any[] = [];
      const sourceNames = ['slack', 'notion', 'gmail', 'linear'];
      
      [slackResult, notionResult, gmailResult, linearResult].forEach((r, i) => {
        if (r.status === 'fulfilled') {
          results.push(...r.value);
          debug.push(`${sourceNames[i]}: ${r.value.length} results`);
        } else {
          debug.push(`${sourceNames[i]}: ERROR - ${r.reason}`);
        }
      });
      
      const seen = new Set<string>();
      const deduplicated = results.filter(r => {
        if (!r.url) return true;
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      
      const sorted = deduplicated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      debug.push(`total: ${sorted.length} (deduped from ${results.length})`);
      
      return { 
        success: true, 
        results: sorted.slice(0, limit),
        _debug: debug 
      };
    } catch (error) {
      debug.push(`ERROR: ${String(error)}`);
      return { success: false, error: String(error), results: [], _debug: debug };
    }
  });

  ipcMain.handle('openai:get-key', () => {
    return getOpenaiApiKey();
  });

  ipcMain.handle('openai:set-key', (_event, key: string) => {
    setOpenaiApiKey(key);
    return { success: true };
  });

  ipcMain.handle('sync:get-slack-channels', () => {
    return getSelectedSlackChannels();
  });

  ipcMain.handle('sync:set-slack-channels', (_event, channels: SlackChannelInfo[]) => {
    setSelectedSlackChannels(channels);
    return { success: true };
  });

  ipcMain.handle('sync:get-status', async () => {
    try {
      const localSearch = getLocalSearchService();
      if (!localSearch) {
        return { initialized: false };
      }
      return await localSearch.getSyncStatus();
    } catch (error) {
      logger.error('sync:get-status error:', error);
      return { initialized: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:trigger', async (_event, source: string) => {
    try {
      const localSearch = getLocalSearchService();
      if (!localSearch) {
        return { success: false, error: 'LocalSearchService not initialized' };
      }
      await localSearch.syncSource(source);
      return { success: true };
    } catch (error) {
      logger.error('sync:trigger error:', error);
      return { success: false, error: String(error) };
    }
  });
}
