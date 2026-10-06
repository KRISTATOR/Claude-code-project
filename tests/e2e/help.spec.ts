import { expect, test } from '@playwright/test';
import { connect, launchApp, signUp, stackEnv, uniqueEmail, type LaunchedApp } from './app';
import { go } from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let app: LaunchedApp;
const email = uniqueEmail('kvido');

test.beforeAll(async () => {
  app = await launchApp({ env: { ZAZEMI_TOUR: '1' } });
});

test.afterAll(async () => {
  await app.close();
});

test('a new organizer gets a short tour once', async () => {
  if (!stack) return;
  const { page } = app;
  await connect(page, stack);
  await signUp(page, email);
  await page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Kvido Organizátor');
  await page.getByLabel('Název týmu').fill('Spolek Lipnov');
  await page.getByRole('button', { name: 'Založit tým' }).click();

  const title = page.getByTestId('tour-title');
  await expect(title).toHaveText('Vítejte v Zázemí');
  // The whole tour by keyboard: the main button has the focus.
  for (const next of ['Světy a hry', 'Kdo co vidí', 'Disk a Office', 'Příprava hry']) {
    await page.keyboard.press('Enter');
    await expect(title).toHaveText(next);
  }
  await page.getByRole('button', { name: 'Další' }).click();
  await page.getByRole('button', { name: 'Další' }).click();
  await expect(title).toHaveText('Nápověda');
  await page.getByRole('button', { name: 'Začít' }).click();
  await expect(title).toHaveCount(0);

  // It can be started again from Settings.
  await go(page, 'Nastavení');
  await page.getByRole('button', { name: 'Spustit úvodního průvodce znovu' }).click();
  await expect(title).toHaveText('Vítejte v Zázemí');
  await page.getByRole('button', { name: 'Přeskočit' }).click();
  await expect(title).toHaveCount(0);
});

test('the tour does not come back after a restart', async () => {
  if (!stack) return;
  const dir = app.userDataDir;
  await app.close({ keepData: true });
  app = await launchApp({ userDataDir: dir, env: { ZAZEMI_TOUR: '1' } });
  // The stored session brings the organizer straight back in.
  await expect(app.page.getByTestId('team-name')).toHaveText('Spolek Lipnov');
  await app.page.waitForTimeout(1000);
  await expect(app.page.getByTestId('tour-title')).toHaveCount(0);
});

test('the Czech guide is in the app with a table of contents', async () => {
  const { page } = app;
  await go(page, 'Nápověda');
  const guide = page.getByTestId('help-guide');
  await expect(guide.getByRole('heading', { name: 'Návod k Zázemí' })).toBeVisible();
  await page.getByRole('main').getByText('Bez připojení', { exact: true }).first().click();
  await expect(guide.getByRole('heading', { name: 'Bez připojení' })).toBeInViewport();
});

test('Ctrl+K jumps anywhere by keyboard', async () => {
  const { page } = app;
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('textbox', { name: 'Hledat záznamy a stránky…' })).toBeFocused();
  await page.keyboard.type('Nastavení');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Nastavení', exact: true })).toBeVisible();
});
