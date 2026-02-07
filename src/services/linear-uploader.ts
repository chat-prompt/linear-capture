import * as fs from 'fs';
import * as path from 'path';
import { LinearClient } from '@linear/sdk';
import { getLinearToken } from './settings-store';
import { logger } from './utils/logger';
import type { UploadResult, MultiUploadResult } from '../types';

// Re-export for backwards compatibility
export type { UploadResult, MultiUploadResult } from '../types';

export class LinearUploader {
  private client: LinearClient;

  constructor(apiToken: string) {
    this.client = new LinearClient({ apiKey: apiToken });
    logger.log('📤 Linear Uploader (via SDK fileUpload)');
  }

  /**
   * Upload an image file to Linear via SDK fileUpload and return the asset URL
   */
  async upload(filePath: string): Promise<UploadResult> {
    const result = await this.uploadMultiple([filePath]);
    if (result.success && result.urls && result.urls.length > 0) {
      return { success: true, url: result.urls[0] };
    }
    return { success: false, error: result.error || 'Upload failed' };
  }

  /**
   * Upload multiple image files to Linear via SDK fileUpload
   */
  async uploadMultiple(filePaths: string[]): Promise<MultiUploadResult> {
    try {
      logger.log(`📤 Uploading ${filePaths.length} image(s) via Linear SDK...`);
      const startTime = Date.now();

      const urls: string[] = [];
      const errors: string[] = [];

      for (const filePath of filePaths) {
        try {
          const url = await this.uploadSingleFile(filePath);
          urls.push(url);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`❌ Failed to upload ${path.basename(filePath)}:`, message);
          errors.push(message);
        }
      }

      const elapsed = Date.now() - startTime;
      logger.log(`⏱️ Upload completed in ${elapsed}ms (${urls.length}/${filePaths.length} successful)`);

      if (urls.length === 0) {
        return { success: false, error: errors.join('; ') || 'All uploads failed' };
      }

      return { success: true, urls };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Linear upload error:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Upload a single file to Linear
   */
  private async uploadSingleFile(filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const fileBuffer = fs.readFileSync(filePath);

    logger.log(`📎 Uploading: ${fileName} (${mimeType}, ${fileSize} bytes)`);

    // Step 1: Request pre-signed URL from Linear
    const uploadPayload = await this.client.fileUpload(mimeType, fileName, fileSize);

    if (!uploadPayload.success || !uploadPayload.uploadFile) {
      throw new Error('Failed to request upload URL from Linear');
    }

    const uploadUrl = uploadPayload.uploadFile.uploadUrl;
    const assetUrl = uploadPayload.uploadFile.assetUrl;

    // Step 2: Upload file to pre-signed URL
    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000',
    };

    // Copy required headers from Linear response
    for (const { key, value } of uploadPayload.uploadFile.headers) {
      headers[key] = value;
    }

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
    }

    logger.log(`✅ Uploaded: ${fileName} → ${assetUrl}`);
    return assetUrl;
  }
}

/**
 * Create LinearUploader from settings store
 */
export function createLinearUploaderFromEnv(): LinearUploader | null {
  const apiToken = getLinearToken();

  if (!apiToken) {
    logger.error('Missing LINEAR_API_TOKEN for uploader');
    return null;
  }

  return new LinearUploader(apiToken);
}
