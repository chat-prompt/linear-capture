import * as fs from 'fs';
import * as path from 'path';

// Cloudflare Worker URL
const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface MultiUploadResult {
  success: boolean;
  urls?: string[];
  error?: string;
}

export class R2Uploader {
  constructor() {
    console.log('📤 R2 Uploader (via Cloudflare Worker)');
  }

  /**
   * Upload an image file to R2 via Worker and return the public URL
   */
  async upload(filePath: string): Promise<UploadResult> {
    const result = await this.uploadMultiple([filePath]);
    if (result.success && result.urls && result.urls.length > 0) {
      return { success: true, url: result.urls[0] };
    }
    return { success: false, error: result.error || 'Upload failed' };
  }

  /**
   * Upload multiple image files to R2 via Worker
   */
  async uploadMultiple(filePaths: string[]): Promise<MultiUploadResult> {
    try {
      const images = filePaths.map(filePath => {
        const body = fs.readFileSync(filePath);
        const base64Data = body.toString('base64');
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const fileName = path.basename(filePath);

        return { data: base64Data, mimeType, fileName };
      });

      console.log(`📤 Uploading ${images.length} image(s) to Worker...`);
      const startTime = Date.now();

      const response = await fetch(`${WORKER_URL}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ images }),
      });

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ Upload response in ${elapsed}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Worker error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { success: boolean; urls?: string[]; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      return { success: true, urls: result.urls };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ R2 upload error:', message);
      return { success: false, error: message };
    }
  }
}

/**
 * Create R2Uploader (Worker 방식은 항상 사용 가능)
 */
export function createR2UploaderFromEnv(): R2Uploader {
  return new R2Uploader();
}
