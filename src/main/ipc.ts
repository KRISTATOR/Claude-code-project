import { app, ipcMain, shell } from 'electron';
import type { AppInfo, ConfigSetResult } from '@shared/api';
import { configSetInput, IPC, openExternalInput } from '@shared/ipc';
import { buildTimeConfig, clearConfig, loadConfig, saveConfig } from './config';
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
  ipcMain.handle(IPC.updatesInstall, () => installUpdateNow());

  ipcMain.handle(IPC.openExternal, async (_event, input: unknown) => {
    const parsed = openExternalInput.safeParse(input);
    if (parsed.success) await shell.openExternal(parsed.data);
  });
}
