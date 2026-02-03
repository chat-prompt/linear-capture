import { exec } from 'child_process';
import { shell } from 'electron';
import { systemPreferences } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ICaptureService, CaptureResult, PermissionStatus, cleanupCapture } from './index';
import { trackCaptureFailed } from '../analytics';

export class DarwinCaptureService implements ICaptureService {
  checkPermission(): PermissionStatus {
    const status = systemPreferences.getMediaAccessStatus('screen');
    return status as PermissionStatus;
  }

  captureSelection(): Promise<CaptureResult> {
    const tempDir = os.tmpdir();
    const fileName = `linear-capture-${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);

    return new Promise((resolve) => {
      exec(`screencapture -i -s -x "${filePath}"`, (error) => {
        if (error) {
          trackCaptureFailed('system_error', error.message);
          resolve({ success: false, error: error.message });
          return;
        }

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            resolve({ success: true, filePath });
          } else {
            fs.unlinkSync(filePath);
            trackCaptureFailed('cancelled', 'Capture cancelled');
            resolve({ success: false, error: 'Capture cancelled' });
          }
        } else {
          trackCaptureFailed('cancelled', 'Capture cancelled');
          resolve({ success: false, error: 'Capture cancelled' });
        }
      });
    });
  }

  openPermissionSettings(): void {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }

  cleanupCapture(filePath: string): void {
    cleanupCapture(filePath);
  }
}
