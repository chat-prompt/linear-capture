import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow, dialog } from 'electron';

// 로깅 설정 (electron-log 없이 console 사용)
autoUpdater.logger = {
  info: (...args: unknown[]) => console.log('[AutoUpdater]', ...args),
  warn: (...args: unknown[]) => console.warn('[AutoUpdater]', ...args),
  error: (...args: unknown[]) => console.error('[AutoUpdater]', ...args),
  debug: (...args: unknown[]) => console.log('[AutoUpdater DEBUG]', ...args),
};

// Ad-hoc 서명 앱용 설정
autoUpdater.autoDownload = false; // 사용자 동의 후 다운로드
autoUpdater.autoInstallOnAppQuit = true; // 종료 시 자동 설치
autoUpdater.allowDowngrade = false; // 다운그레이드 방지

let mainWindow: BrowserWindow | null = null;
let updateCheckInProgress = false;
let manualCheckMode = false; // 수동 확인 모드 (결과 항상 표시)

/**
 * 자동 업데이터 초기화
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // 이벤트: 업데이트 확인 시작
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
  });

  // 이벤트: 업데이트 발견
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Update available:', info.version);
    showUpdateAvailableDialog(info);
  });

  // 이벤트: 업데이트 없음 (최신 버전)
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Already up to date:', info.version);
    if (manualCheckMode) {
      manualCheckMode = false;
      showUpToDateDialog();
    }
  });

  // 이벤트: 에러
  autoUpdater.on('error', (err: Error) => {
    console.error('[AutoUpdater] Error:', err.message);
    updateCheckInProgress = false;
    if (manualCheckMode) {
      manualCheckMode = false;

      // 릴리즈가 없거나 네트워크 오류인지 구분
      const errorMessage = err.message || '';
      const isNoRelease = errorMessage.includes('404') ||
                          errorMessage.includes('No published versions') ||
                          errorMessage.includes('Cannot find latest');

      if (isNoRelease) {
        dialog.showMessageBox({
          type: 'info',
          title: '업데이트 확인',
          message: '아직 배포된 버전이 없습니다',
          detail: `현재 버전: ${app.getVersion()}\n\n새 버전이 배포되면 여기서 업데이트할 수 있습니다.`,
          buttons: ['확인'],
        });
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: '업데이트 확인 실패',
          message: '업데이트를 확인할 수 없습니다',
          detail: '네트워크 연결을 확인하고 다시 시도해주세요.',
          buttons: ['확인'],
        });
      }
    }
  });

  // 이벤트: 다운로드 진행
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const percent = progress.percent.toFixed(1);
    console.log(`[AutoUpdater] Download: ${percent}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`);
  });

  // 이벤트: 다운로드 완료
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    showRestartDialog(info);
  });
}

/**
 * 업데이트 확인 (수동/자동)
 * @param silent true면 업데이트 없을 때 알림 안 함, false면 항상 결과 표시
 */
export async function checkForUpdates(silent = true): Promise<void> {
  if (updateCheckInProgress) {
    console.log('[AutoUpdater] Update check already in progress');
    return;
  }

  try {
    updateCheckInProgress = true;
    manualCheckMode = !silent; // 수동 확인 시 결과 항상 표시
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[AutoUpdater] Failed to check for updates:', error);
    if (!silent) {
      dialog.showErrorBox('Update Check Failed', 'Could not check for updates. Please try again later.');
    }
  } finally {
    updateCheckInProgress = false;
  }
}

/**
 * 최신 버전일 때 다이얼로그 (수동 확인 시에만)
 */
function showUpToDateDialog(): void {
  const currentVersion = app.getVersion();
  dialog.showMessageBox({
    type: 'info',
    title: 'No Updates Available',
    message: 'You\'re up to date!',
    detail: `Linear Capture ${currentVersion} is the latest version.`,
    buttons: ['OK'],
  });
}

/**
 * 업데이트 발견 시 다이얼로그
 */
function showUpdateAvailableDialog(info: UpdateInfo): void {
  const currentVersion = app.getVersion();

  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of Linear Capture is available!`,
      detail: `Current version: ${currentVersion}\nNew version: ${info.version}\n\nWould you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        downloadUpdate();
      }
    });
}

/**
 * 업데이트 다운로드 시작
 */
async function downloadUpdate(): Promise<void> {
  try {
    // 다운로드 진행 알림
    dialog.showMessageBox({
      type: 'info',
      title: 'Downloading Update',
      message: 'Downloading update in the background...',
      detail: 'You can continue using the app. We\'ll notify you when the download is complete.',
      buttons: ['OK'],
    });

    await autoUpdater.downloadUpdate();
  } catch (error) {
    console.error('[AutoUpdater] Download failed:', error);
    dialog.showErrorBox('Download Failed', 'Failed to download the update. Please try again later.');
  }
}

/**
 * 다운로드 완료 후 재시작 다이얼로그
 */
function showRestartDialog(info: UpdateInfo): void {
  dialog
    .showMessageBox({
      type: 'info',
      title: '업데이트 준비 완료',
      message: `버전 ${info.version} 다운로드 완료`,
      detail: '앱을 재시작하면 업데이트가 설치됩니다.\n\n' +
              '⚠️ 재시작 후 핫키(⌘+Shift+L)가 작동하지 않으면:\n' +
              '시스템 환경설정 → 개인 정보 보호 및 보안 → 화면 녹화에서\n' +
              'Linear Capture를 다시 활성화해주세요.',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
}

/**
 * 바이트 포맷팅 헬퍼
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
