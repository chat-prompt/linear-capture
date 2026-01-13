import { exec } from 'child_process';
import { systemPreferences } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Check screen capture permission status on macOS
 */
export function checkScreenCapturePermission(): string {
  return systemPreferences.getMediaAccessStatus('screen');
}

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Capture a selected area of the screen using macOS screencapture
 * Returns the path to the captured image
 */
export function captureSelection(): Promise<CaptureResult> {
  const tempDir = os.tmpdir();
  const fileName = `linear-capture-${Date.now()}.png`;
  const filePath = path.join(tempDir, fileName);

  return new Promise((resolve) => {
    // -i: interactive mode (selection)
    // -s: only allow selection (not window)
    // -x: no sound
    exec(`screencapture -i -s -x "${filePath}"`, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }

      // Check if file was created (user might have cancelled)
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          resolve({ success: true, filePath });
        } else {
          fs.unlinkSync(filePath);
          resolve({ success: false, error: 'Capture cancelled' });
        }
      } else {
        resolve({ success: false, error: 'Capture cancelled' });
      }
    });
  });
}

/**
 * Clean up temporary capture file
 */
export function cleanupCapture(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup capture file:', error);
  }
}
