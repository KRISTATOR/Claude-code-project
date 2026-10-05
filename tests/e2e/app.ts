import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  close(): Promise<void>;
}

/**
 * Launches the built app (`npm run build:test`) with a fresh, throwaway user
 * data folder so every test starts from the first-run screen.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'zazemi-e2e-'));
  // Launch the project folder so Electron reads package.json (name, version, main).
  const args = ['.'];
  // Chromium refuses to run its sandbox as root (some Linux containers).
  if (process.platform === 'linux' && process.getuid?.() === 0) args.unshift('--no-sandbox');

  const env: Record<string, string> = { ZAZEMI_USER_DATA_DIR: userDataDir };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RENDERER_URL') env[key] = value;
  }
  const app = await electron.launch({ args, env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    async close() {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}
