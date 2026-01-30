import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow, dialog } from 'electron';
import { t } from '../main/i18n';

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
    updateCheckInProgress = false;
    manualCheckMode = false;
    showUpdateAvailableDialog(info);
  });

  // 이벤트: 업데이트 없음 (최신 버전)
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Already up to date:', info.version);
    updateCheckInProgress = false;
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
          title: t('update.checkTitle'),
          message: t('update.noReleases'),
          detail: t('update.noReleasesDetail', { version: app.getVersion() }),
          buttons: [t('common.ok')],
        });
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: t('update.checkTitle'),
          message: t('update.checkFailed'),
          detail: t('update.checkFailedDetail'),
          buttons: [t('common.ok')],
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
    // 플래그 리셋은 이벤트 핸들러에서 처리
  } catch (error) {
    console.error('[AutoUpdater] Failed to check for updates:', error);
    updateCheckInProgress = false;
    if (!silent) {
      manualCheckMode = false;
      dialog.showErrorBox(t('update.checkTitle'), t('update.checkFailedDetail'));
    }
  }
}

/**
 * 최신 버전일 때 다이얼로그 (수동 확인 시에만)
 */
function showUpToDateDialog(): void {
  dialog.showMessageBox({
    type: 'info',
    title: t('update.upToDateTitle'),
    message: t('update.upToDateMessage'),
    detail: t('update.upToDateDetail', { version: app.getVersion() }),
    buttons: [t('common.ok')],
  });
}

/**
 * 업데이트 발견 시 다이얼로그
 */
function showUpdateAvailableDialog(info: UpdateInfo): void {
  dialog
    .showMessageBox({
      type: 'info',
      title: t('update.availableTitle'),
      message: t('update.availableMessage'),
      detail: t('update.availableDetail', { current: app.getVersion(), new: info.version }),
      buttons: [t('common.download'), t('common.later')],
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
    dialog.showMessageBox({
      type: 'info',
      title: t('update.downloadingTitle'),
      message: t('update.downloadingMessage'),
      detail: t('update.downloadingDetail'),
      buttons: [t('common.ok')],
    });

    await autoUpdater.downloadUpdate();
  } catch (error) {
    console.error('[AutoUpdater] Download failed:', error);
    dialog.showErrorBox(t('update.downloadFailed'), t('update.downloadFailedDetail'));
  }
}

/**
 * 다운로드 완료 후 재시작 다이얼로그
 */
function showRestartDialog(info: UpdateInfo): void {
  dialog
    .showMessageBox({
      type: 'info',
      title: t('update.readyTitle'),
      message: t('update.readyMessage', { version: info.version }),
      detail: t('update.readyDetail'),
      buttons: [t('update.restartNow'), t('common.later')],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        console.log('[AutoUpdater] Closing all windows before restart...');
        BrowserWindow.getAllWindows().forEach((win) => {
          win.removeAllListeners('close');
          win.close();
        });

        setTimeout(() => {
          console.log('[AutoUpdater] Executing quitAndInstall...');
          autoUpdater.quitAndInstall(false, true);
        }, 500);
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
