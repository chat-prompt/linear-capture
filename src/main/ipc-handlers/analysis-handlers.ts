import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { createGeminiAnalyzer, createAnthropicAnalyzer } from '../../services/ai-analyzer';
import { getAiRecommendations } from '../../services/ai-recommend';
import { getLanguage } from '../../services/settings-store';
import { getState } from '../state';
import type { AnalysisContext } from '../../services/ai-analyzer';

export function registerAnalysisHandlers(): void {
  const state = getState();

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

  ipcMain.handle('ai-recommend', async (_event, { text, limit }: { text: string; limit?: number }) => {
    try {
      return await getAiRecommendations(text, limit);
    } catch (error) {
      logger.error('ai-recommend error:', error);
      return [];
    }
  });
}
