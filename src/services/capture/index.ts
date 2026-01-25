/**
 * Capture Service - Cross-platform screen capture abstraction
 * 
 * Platform implementations:
 * - macOS: capture.darwin.ts (screencapture CLI)
 * - Windows: capture.win32.ts (desktopCapturer + custom overlay)
 */

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export type PermissionStatus = 
  | 'granted' 
  | 'denied' 
  | 'not-determined' 
  | 'restricted' 
  | 'unknown';

export interface ICaptureService {
  /** Check screen capture permission status */
  checkPermission(): PermissionStatus;
  
  /** Execute area selection capture */
  captureSelection(): Promise<CaptureResult>;
  
  /** Open system permission settings */
  openPermissionSettings(): void;
  
  /** Clean up temporary capture file */
  cleanupCapture(filePath: string): void;
}

/** Create platform-specific capture service */
export function createCaptureService(): ICaptureService {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    const { DarwinCaptureService } = require('./capture.darwin');
    return new DarwinCaptureService();
  } else if (platform === 'win32') {
    const { Win32CaptureService } = require('./capture.win32');
    return new Win32CaptureService();
  }
  
  throw new Error(`Unsupported platform: ${platform}`);
}

import * as fs from 'fs';

export function cleanupCapture(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup capture file:', error);
  }
}
