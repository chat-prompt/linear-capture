import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { app } from 'electron';
import { logger } from './utils/logger';

const execFileAsync = promisify(execFile);

/**
 * Project data from local Linear cache
 */
export interface LocalCacheProject {
  id: string;
  name: string;
  teamId: string;
  recentIssueTitles: string[];
}

/**
 * Complete cache data structure
 */
export interface LocalCacheData {
  version: number;
  updatedAt: string;
  projects: LocalCacheProject[];
}

/**
 * Load Linear project data from local IndexedDB cache.
 * 
 * Spawns Python script to read Linear Desktop App's IndexedDB and parse JSON output.
 * Returns null on any error (Python not installed, script failure, timeout, parse error).
 * 
 * @returns LocalCacheData if successful, null otherwise
 */
export async function loadLocalCache(): Promise<LocalCacheData | null> {
  try {
    // Get script path (handle both development and packaged app)
     let appPath = app.getAppPath();
     if (appPath.includes('app.asar')) {
       appPath = appPath.replace('app.asar', 'app.asar.unpacked');
     }
     const scriptPath = path.join(appPath, 'scripts', 'export_linear_cache.py');

     logger.log('[LocalCache] Loading cache from:', scriptPath);

    // Execute Python script with 8 second timeout
    const { stdout, stderr } = await execFileAsync('python3', [scriptPath], {
      timeout: 8000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large cache
    });

     // Log stderr if present (warnings/errors)
     if (stderr) {
       logger.warn('[LocalCache] Python stderr:', stderr);
     }

     // Parse JSON output
     const data = JSON.parse(stdout) as LocalCacheData;

     // Validate structure
     if (!data.version || !data.updatedAt || !Array.isArray(data.projects)) {
       logger.error('[LocalCache] Invalid data structure:', data);
       return null;
     }

     logger.log(`[LocalCache] Loaded ${data.projects.length} projects from cache`);
     return data;

  } catch (error) {
    // Graceful fallback on any error
    if (error instanceof Error) {
      // Check for specific error types
       if ('code' in error) {
         const code = (error as any).code;
         if (code === 'ENOENT') {
           logger.warn('[LocalCache] Python3 not found - skipping local cache');
         } else if (code === 'ETIMEDOUT') {
           logger.warn('[LocalCache] Script timeout - skipping local cache');
         } else {
           logger.error('[LocalCache] Script error:', error.message);
         }
       } else {
         logger.error('[LocalCache] Error loading cache:', error.message);
       }
     } else {
       logger.error('[LocalCache] Unknown error:', error);
     }
    return null;
  }
}
