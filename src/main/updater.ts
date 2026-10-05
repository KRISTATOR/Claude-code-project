import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '@shared/api';
import { IPC } from '@shared/ipc';

const { autoUpdater } = electronUpdater;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let status: UpdateStatus = { state: 'idle' };

function setStatus(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.updatesStatus, status);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

/**
 * Auto-update from the public `zazemi-releases` repo (see electron-builder.yml).
 * Runs only in installed release builds; downloads in the background and waits
 * for the user to click "restart".
 */
export function startAutoUpdates(): void {
  if (__ZAZEMI_TEST_BUILD__) {
    setStatus({ state: 'disabled', reason: 'test-build' });
    return;
  }
  if (!app.isPackaged) {
    setStatus({ state: 'disabled', reason: 'not-packaged' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none' }));
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'downloading', version: info.version, percent: 0 }),
  );
  autoUpdater.on('download-progress', (progress) => {
    const version = status.state === 'downloading' ? status.version : '';
    setStatus({ state: 'downloading', version, percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (error) => {
    // Typical causes: offline, or the releases repo is not set up yet. Not fatal.
    console.warn('[updater]', error.message);
    setStatus({ state: 'error', message: error.message });
  });

  void checkForUpdates();
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
}

export async function checkForUpdates(): Promise<void> {
  if (status.state === 'disabled') return;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Reported through the 'error' event.
  }
}

export function installUpdateNow(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall();
}
