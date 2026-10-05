import { writeFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { AppInfo, ConfigSetResult, SaveFileResult } from '@shared/api';
import {
  configSetInput,
  IPC,
  openExternalInput,
  saveFileInput,
  secureKeyInput,
  secureValueInput,
} from '@shared/ipc';
import { buildTimeConfig, clearConfig, loadConfig, saveConfig } from './config';
import { takePendingInvite } from './deep-links';
import { secureGet, secureRemove, secureSet } from './secure-store';
import { checkForUpdates, getUpdateStatus, installUpdateNow } from './updater';

/** Registers every IPC handler. Each one validates its input with zod. */
export function registerIpcHandlers(onConfigChanged: () => void): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    configFromBuild: buildTimeConfig() !== null,
  }));

  ipcMain.handle(IPC.configGet, () => loadConfig());

  ipcMain.handle(IPC.configSet, async (_event, input: unknown): Promise<ConfigSetResult> => {
    if (buildTimeConfig()) return { ok: false, error: 'config-from-build' };
    const parsed = configSetInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
    await saveConfig(parsed.data);
    onConfigChanged();
    return { ok: true };
  });

  ipcMain.handle(IPC.configClear, async () => {
    await clearConfig();
    onConfigChanged();
  });

  ipcMain.handle(IPC.updatesGetStatus, () => getUpdateStatus());
  ipcMain.handle(IPC.updatesCheck, () => checkForUpdates());
  ipcMain.handle(IPC.updatesInstall, () => {
    installUpdateNow();
  });

  ipcMain.handle(IPC.openExternal, async (_event, input: unknown) => {
    const parsed = openExternalInput.safeParse(input);
    if (parsed.success) await shell.openExternal(parsed.data);
  });

  ipcMain.handle(IPC.secureGet, (_event, key: unknown) => {
    const parsed = secureKeyInput.safeParse(key);
    return parsed.success ? secureGet(parsed.data) : null;
  });
  ipcMain.handle(IPC.secureSet, async (_event, key: unknown, value: unknown) => {
    const parsedKey = secureKeyInput.safeParse(key);
    const parsedValue = secureValueInput.safeParse(value);
    if (parsedKey.success && parsedValue.success) await secureSet(parsedKey.data, parsedValue.data);
  });
  ipcMain.handle(IPC.secureRemove, async (_event, key: unknown) => {
    const parsed = secureKeyInput.safeParse(key);
    if (parsed.success) await secureRemove(parsed.data);
  });

  ipcMain.handle(IPC.saveFile, async (event, input: unknown): Promise<SaveFileResult> => {
    const parsed = saveFileInput.safeParse(input);
    if (!parsed.success) return { saved: false };
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      defaultPath: parsed.data.defaultName,
      filters: parsed.data.filters,
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, parsed.data.data);
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle(IPC.takePendingInvite, () => takePendingInvite());
}
