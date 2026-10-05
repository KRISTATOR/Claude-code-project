import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import type { ConnectionConfig } from '@core/connection';
import { loadConfig } from './config';
import { forwardInvite, registerProtocol, rememberStartupInvite } from './deep-links';
import { buildCsp } from './csp';
import { registerIpcHandlers } from './ipc';
import { restoreOfficeSessions } from './office';
import { configurePaths, configureUserAgent } from './paths';
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from './protocol';
import { hardenWebContents } from './security';
import { startAutoUpdates } from './updater';

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'] || undefined;
const isDev = devServerUrl !== undefined;

configurePaths();
configureUserAgent();
// Czech for Chromium's own UI: date pickers show dd.mm.rrrr, spellcheck in Czech.
app.commandLine.appendSwitch('lang', 'cs');
registerAppScheme();

let mainWindow: BrowserWindow | null = null;
let currentConfig: ConnectionConfig | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  rememberStartupInvite(process.argv);
  app.on('second-instance', (_event, argv) => {
    forwardInvite(mainWindow, argv);
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  hardenWebContents(devServerUrl);
  void app.whenReady().then(start);
}

async function start(): Promise<void> {
  app.setAppUserModelId('cz.chynickylarp.zazemi');
  registerProtocol();
  currentConfig = await loadConfig();
  const csp = () => buildCsp(currentConfig, { dev: isDev });

  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp()] },
      });
    });
  } else {
    handleAppScheme(join(import.meta.dirname, '../renderer'), csp);
  }

  registerIpcHandlers(() => {
    void loadConfig().then((config) => {
      currentConfig = config;
      // Reload so the new CSP (allowed Supabase origin) takes effect.
      mainWindow?.webContents.reload();
    });
  });

  await restoreOfficeSessions();
  createWindow();
  startAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Zázemí',
    autoHideMenuBar: true,
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
