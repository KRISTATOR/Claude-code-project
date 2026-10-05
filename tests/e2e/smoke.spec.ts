import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { encodeConnectionCode } from '../../src/core/connection';
import { launchApp, type LaunchedApp } from './app';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

const fakeAnonKey = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from('{"role":"anon","ref":"testproject"}').toString('base64url'),
  'signature',
].join('.');

test('shows the Czech first-run screen when not configured', async () => {
  const { page } = launched;
  await expect(page).toHaveTitle('Zázemí');
  await expect(page.getByRole('heading', { name: 'Zázemí zatím není připojené' })).toBeVisible();
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  await expect(page.getByTestId('app-version')).toHaveText(`Verze ${version}`);
});

test('renderer is isolated from Node and served with a strict CSP', async () => {
  const { page } = launched;
  const exposure = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    api: Object.keys(window.zazemi).sort(),
  }));
  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    api: ['app', 'config', 'deepLinks', 'dialogs', 'secureStore', 'shell', 'updates'],
  });

  const csp = await page.evaluate(async () => {
    const response = await fetch(location.href);
    return response.headers.get('content-security-policy');
  });
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
});

test('rejects a bad code, then connects and asks to sign in', async () => {
  const { page } = launched;

  await page.getByLabel('Kód pro připojení').fill('nesmysl');
  await page.getByRole('button', { name: 'Připojit' }).click();
  await expect(page.getByRole('alert')).toContainText('nevypadá jako kód');

  const code = encodeConnectionCode({
    supabaseUrl: 'https://testproject.supabase.co',
    supabaseAnonKey: fakeAnonKey,
  });
  await page.getByLabel('Kód pro připojení').fill(code);
  await page.getByRole('button', { name: 'Připojit' }).click();
  await expect(page.getByRole('heading', { name: 'Přihlášení do Zázemí' })).toBeVisible();
});

test('switches between light and dark theme', async () => {
  const { page } = launched;
  const html = page.locator('html');
  await page.getByText('Tmavý').click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await page.getByText('Světlý').click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
});
