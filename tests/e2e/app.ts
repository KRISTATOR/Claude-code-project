import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { encodeConnectionCode } from '../../src/core/connection';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close(options?: { keepData?: boolean }): Promise<void>;
}

/**
 * Launches the built app (`npm run build:test`). Each launch gets a throwaway
 * user data folder unless one is passed (to simulate restarting the app).
 */
export async function launchApp(options: { userDataDir?: string } = {}): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'zazemi-e2e-'));
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
    userDataDir,
    async close(closeOptions = {}) {
      await app.close();
      if (!closeOptions.keepData) rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export interface StackEnv {
  url: string;
  anonKey: string;
}

/**
 * A Supabase to test against: the official stack in CI (environment
 * variables) or the local stack (scripts/local-stack, .local-stack/env.json).
 */
export function stackEnv(): StackEnv | null {
  const url = process.env['ZAZEMI_E2E_SUPABASE_URL'];
  const anonKey = process.env['ZAZEMI_E2E_SUPABASE_ANON_KEY'];
  if (url && anonKey) return { url, anonKey };
  const file = join(import.meta.dirname, '../../.local-stack/env.json');
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { url: string; anonKey: string };
    return { url: parsed.url, anonKey: parsed.anonKey };
  }
  return null;
}

export async function connect(page: Page, stack: StackEnv): Promise<void> {
  const code = encodeConnectionCode({ supabaseUrl: stack.url, supabaseAnonKey: stack.anonKey });
  await page.getByLabel('Kód pro připojení').fill(code);
  await page.getByRole('button', { name: 'Připojit' }).click();
  await expect(page.getByRole('heading', { name: 'Přihlášení do Zázemí' })).toBeVisible();
}

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export async function signUp(
  page: Page,
  email: string,
  password = 'heslo-pro-test',
): Promise<void> {
  await page.getByRole('tab', { name: 'Nový účet' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Vytvořit účet' }).click();
  await expect(page.getByRole('heading', { name: 'Vítejte v Zázemí' })).toBeVisible();
}

export async function signIn(
  page: Page,
  email: string,
  password = 'heslo-pro-test',
): Promise<void> {
  await page.getByLabel('E-mail').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
}
