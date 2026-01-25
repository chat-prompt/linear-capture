import { BrowserWindow, desktopCapturer, screen, ipcMain, nativeImage } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ICaptureService, CaptureResult, PermissionStatus, cleanupCapture } from './index';

interface SelectionResult {
  cancelled: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  displayId?: number;
}

export class Win32CaptureService implements ICaptureService {
  private overlayWindow: BrowserWindow | null = null;

  checkPermission(): PermissionStatus {
    return 'granted';
  }

  async captureSelection(): Promise<CaptureResult> {
    try {
      const selection = await this.showSelectionOverlay();
      
      if (selection.cancelled || !selection.bounds) {
        return { success: false, error: 'Capture cancelled' };
      }

      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find(d => d.id === selection.displayId) || screen.getPrimaryDisplay();
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.floor(targetDisplay.bounds.width * targetDisplay.scaleFactor),
          height: Math.floor(targetDisplay.bounds.height * targetDisplay.scaleFactor),
        },
      });

      if (sources.length === 0) {
        return { success: false, error: 'No screen source available' };
      }

      const source = sources.find(s => s.display_id === String(targetDisplay.id)) || sources[0];
      const fullScreenImage = source.thumbnail;

      if (fullScreenImage.isEmpty()) {
        return { success: false, error: 'Failed to capture screen' };
      }

      const scaleFactor = targetDisplay.scaleFactor;
      const cropRect = {
        x: Math.floor(selection.bounds.x * scaleFactor),
        y: Math.floor(selection.bounds.y * scaleFactor),
        width: Math.floor(selection.bounds.width * scaleFactor),
        height: Math.floor(selection.bounds.height * scaleFactor),
      };

      const croppedImage = fullScreenImage.crop(cropRect);

      if (croppedImage.isEmpty()) {
        return { success: false, error: 'Failed to crop image' };
      }

      const tempDir = os.tmpdir();
      const fileName = `linear-capture-${Date.now()}.png`;
      const filePath = path.join(tempDir, fileName);

      const pngBuffer = croppedImage.toPNG();
      fs.writeFileSync(filePath, pngBuffer);

      return { success: true, filePath };
    } catch (error) {
      console.error('Win32 capture error:', error);
      return { success: false, error: String(error) };
    }
  }

  openPermissionSettings(): void {
    // No-op: Windows doesn't have screen capture permission settings
  }

  cleanupCapture(filePath: string): void {
    cleanupCapture(filePath);
  }

  private async showSelectionOverlay(): Promise<SelectionResult> {
    return new Promise((resolve) => {
      const displays = screen.getAllDisplays();
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const display of displays) {
        minX = Math.min(minX, display.bounds.x);
        minY = Math.min(minY, display.bounds.y);
        maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
        maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
      }

      const combinedWidth = maxX - minX;
      const combinedHeight = maxY - minY;

      this.overlayWindow = new BrowserWindow({
        x: minX,
        y: minY,
        width: combinedWidth,
        height: combinedHeight,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      this.overlayWindow.setMenu(null);

      const htmlContent = this.getSelectionOverlayHtml();
      this.overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      const handleSelectionComplete = (_event: Electron.IpcMainEvent, result: SelectionResult) => {
        ipcMain.removeListener('selection-complete', handleSelectionComplete);
        this.closeOverlay();
        resolve(result);
      };

      ipcMain.on('selection-complete', handleSelectionComplete);

      this.overlayWindow.on('closed', () => {
        ipcMain.removeListener('selection-complete', handleSelectionComplete);
        this.overlayWindow = null;
        resolve({ cancelled: true });
      });

      this.overlayWindow.focus();
    });
  }

  private closeOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
  }

  private getSelectionOverlayHtml(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: crosshair;
      background: rgba(0, 0, 0, 0.3);
      user-select: none;
    }
    
    #selection {
      position: fixed;
      border: 2px solid #007AFF;
      background: rgba(0, 122, 255, 0.1);
      display: none;
      pointer-events: none;
    }
    
    #dimensions {
      position: fixed;
      background: rgba(0, 0, 0, 0.75);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      display: none;
      pointer-events: none;
      z-index: 1000;
    }
    
    #instructions {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      text-align: center;
      pointer-events: none;
    }
    
    #instructions.hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="selection"></div>
  <div id="dimensions"></div>
  <div id="instructions">
    Drag to select area<br>
    <span style="font-size: 12px; opacity: 0.7;">Press ESC to cancel</span>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    const selection = document.getElementById('selection');
    const dimensions = document.getElementById('dimensions');
    const instructions = document.getElementById('instructions');
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
      
      selection.style.display = 'block';
      instructions.classList.add('hidden');
      updateSelection();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      currentX = e.clientX;
      currentY = e.clientY;
      updateSelection();
    });
    
    document.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      
      const bounds = getSelectionBounds();
      
      // Minimum size check
      if (bounds.width < 10 || bounds.height < 10) {
        // Too small, cancel
        ipcRenderer.send('selection-complete', { cancelled: true });
        return;
      }
      
      // Send selection result
      ipcRenderer.send('selection-complete', {
        cancelled: false,
        bounds: bounds,
        displayId: null // Will be determined by main process
      });
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ipcRenderer.send('selection-complete', { cancelled: true });
      }
    });
    
    function updateSelection() {
      const bounds = getSelectionBounds();
      
      selection.style.left = bounds.x + 'px';
      selection.style.top = bounds.y + 'px';
      selection.style.width = bounds.width + 'px';
      selection.style.height = bounds.height + 'px';
      
      // Update dimensions display
      dimensions.textContent = bounds.width + ' x ' + bounds.height;
      dimensions.style.display = 'block';
      
      // Position dimensions label
      const labelX = bounds.x + bounds.width / 2 - dimensions.offsetWidth / 2;
      const labelY = bounds.y + bounds.height + 8;
      dimensions.style.left = Math.max(0, labelX) + 'px';
      dimensions.style.top = labelY + 'px';
    }
    
    function getSelectionBounds() {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      return { x, y, width, height };
    }
  </script>
</body>
</html>
`;
  }
}
