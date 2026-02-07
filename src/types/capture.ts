import type { AnalysisResult } from './shared';

export interface CapturedImage {
  filePath: string;
  uploadedUrl?: string;
}

export interface CaptureSession {
  images: CapturedImage[];
  analysisResult?: AnalysisResult;
}

export const MAX_IMAGES = 10;

export interface OAuthCallback {
  code: string;
  state: string;
}
