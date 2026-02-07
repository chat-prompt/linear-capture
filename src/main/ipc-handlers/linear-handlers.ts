import { ipcMain, clipboard } from 'electron';
import { logger } from '../../services/utils/logger';
import { createLinearUploaderFromEnv } from '../../services/linear-uploader';
import { createLinearServiceFromEnv } from '../../services/linear-client';
import { trackIssueCreated } from '../../services/analytics';
import { getState } from '../state';
import { cleanupSession } from '../capture-session';

let loadingPromise: Promise<void> | null = null;

export async function loadLinearData(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = _doLoadLinearData();
  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

async function _doLoadLinearData(): Promise<void> {
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
      const { loadLocalCache } = await import('../../services/linear-local-cache');
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

export function registerLinearHandlers(): void {
  const state = getState();

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
    try {
      const linear = createLinearServiceFromEnv();
      if (!linear) {
        return { success: false, error: 'Linear not configured' };
      }

      const uploader = createLinearUploaderFromEnv();
      if (!uploader) {
        return { success: false, error: 'Linear uploader not configured' };
      }

      const imageUrls: string[] = [];
      const totalImages = state.captureSession?.images.length || 0;
      if (totalImages > 0) {
        logger.log(`Uploading ${totalImages} images via Linear SDK...`);
        const uploadResults = await Promise.all(
          state.captureSession!.images.map(img => uploader.upload(img.filePath))
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
    } catch (error) {
      logger.error('create-issue error:', error);
      return { success: false, error: String(error) };
    }
  });
}
