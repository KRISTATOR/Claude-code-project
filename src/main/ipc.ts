import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { AppInfo, ConfigSetResult, SaveFileResult } from '@shared/api';
import {
  backupEntryInput,
  blobDataInput,
  configSetInput,
  IPC,
  openEditInput,
  openExternalInput,
  openViewInput,
  printInput,
  indexInput,
  saveFileInput,
  secureKeyInput,
  secureValueInput,
  sha256Input,
  uuidInput,
} from '@shared/ipc';
import { closeArchives, openArchives, readArchiveEntry } from './archives';
import { abortBackup, addToBackup, beginBackup, finishBackup } from './backup';
import { blobUsage, getBlob, hasBlob, putBlob } from './blob-cache';
import {
  discard,
  finish,
  listSessions,
  markUploaded,
  openForEdit,
  openReadOnly,
  readWorking,
} from './office';
import { buildTimeConfig, clearConfig, loadConfig, saveConfig } from './config';
import { takePendingInvite } from './deep-links';
import { fontsRoot, renderPdf } from './print';
import { secureGet, secureRemove, secureSet } from './secure-store';
import { checkForUpdates, getUpdateStatus, installUpdateNow } from './updater';

/** Registers every IPC handler. Each one validates its input with zod. */
export function registerIpcHandlers(onConfigChanged: () => void): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    configFromBuild: buildTimeConfig() !== null,
    machine: hostname().slice(0, 100),
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
    // End-to-end tests save into a known folder instead of answering a dialog.
    const testDir = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_SAVE_DIR'] : undefined;
    if (testDir) {
      const path = join(testDir, parsed.data.defaultName);
      await writeFile(path, parsed.data.data);
      return { saved: true, path };
    }
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

  ipcMain.handle(IPC.printPdf, (_event, input: unknown) => renderPdf(printInput.parse(input)));

  ipcMain.handle(IPC.fontsExport, async (event): Promise<SaveFileResult> => {
    const testDir = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_SAVE_DIR'] : undefined;
    let folder = testDir;
    if (!folder) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = { properties: ['openDirectory', 'createDirectory'] as const };
      const result = window
        ? await dialog.showOpenDialog(window, { properties: [...options.properties] })
        : await dialog.showOpenDialog({ properties: [...options.properties] });
      if (result.canceled || !result.filePaths[0]) return { saved: false };
      folder = result.filePaths[0];
    }
    const target = join(folder, 'Zazemi pisma');
    // File by file: the fonts sit inside the app's asar archive, which
    // supports reading but not every copy function.
    const copy = async (from: string, to: string) => {
      await mkdir(to, { recursive: true });
      for (const entry of await readdir(from, { withFileTypes: true })) {
        if (entry.isDirectory()) await copy(join(from, entry.name), join(to, entry.name));
        else await writeFile(join(to, entry.name), await readFile(join(from, entry.name)));
      }
    };
    await copy(fontsRoot(), target);
    return { saved: true, path: target };
  });

  ipcMain.handle(IPC.blobHas, (_event, sha: unknown) => hasBlob(sha256Input.parse(sha)));
  ipcMain.handle(IPC.blobGet, (_event, sha: unknown) => getBlob(sha256Input.parse(sha)));
  ipcMain.handle(IPC.blobPut, (_event, sha: unknown, data: unknown) =>
    putBlob(sha256Input.parse(sha), blobDataInput.parse(data)),
  );
  ipcMain.handle(IPC.blobUsage, () => blobUsage());

  ipcMain.handle(IPC.officeOpenEdit, (_event, input: unknown) =>
    openForEdit(openEditInput.parse(input)),
  );
  ipcMain.handle(IPC.officeOpenView, (_event, input: unknown) =>
    openReadOnly(openViewInput.parse(input)),
  );
  ipcMain.handle(IPC.officeReadWorking, (_event, fileId: unknown) =>
    readWorking(uuidInput.parse(fileId)),
  );
  ipcMain.handle(IPC.officeMarkUploaded, (_event, fileId: unknown, sha: unknown) =>
    markUploaded(uuidInput.parse(fileId), sha256Input.parse(sha)),
  );
  ipcMain.handle(IPC.officeFinish, (_event, fileId: unknown) => finish(uuidInput.parse(fileId)));
  ipcMain.handle(IPC.officeDiscard, (_event, fileId: unknown) => discard(uuidInput.parse(fileId)));
  ipcMain.handle(IPC.officeSessions, () => listSessions());

  ipcMain.handle(IPC.backupBegin, (event, name: unknown) =>
    beginBackup(
      BrowserWindow.fromWebContents(event.sender),
      saveFileInput.shape.defaultName.parse(name),
    ),
  );
  ipcMain.handle(IPC.backupAdd, (_event, token: unknown, path: unknown, data: unknown) => {
    addToBackup(uuidInput.parse(token), backupEntryInput.parse(path), blobDataInput.parse(data));
  });
  ipcMain.handle(IPC.backupFinish, (_event, token: unknown) =>
    finishBackup(uuidInput.parse(token)),
  );
  ipcMain.handle(IPC.backupAbort, (_event, token: unknown) => {
    abortBackup(uuidInput.parse(token));
  });
  ipcMain.handle(IPC.archivesOpen, (event) =>
    openArchives(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle(IPC.archivesRead, (_event, token: unknown, archive: unknown, entry: unknown) =>
    readArchiveEntry(uuidInput.parse(token), indexInput.parse(archive), indexInput.parse(entry)),
  );
  ipcMain.handle(IPC.archivesClose, (_event, token: unknown) =>
    closeArchives(uuidInput.parse(token)),
  );
}
