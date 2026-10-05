import { expect, test } from '@playwright/test';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import {
  go,
  inviteCode,
  joinTeam,
  named,
  setOffline,
  setUpTeam,
  shareWithEveryone,
  syncNow,
} from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let kvido: LaunchedApp;
let bara: LaunchedApp;

test.beforeAll(async () => {
  kvido = await launchApp();
  bara = await launchApp();
});

test.afterAll(async () => {
  await kvido.close();
  await bara.close();
});

async function openPage(app: LaunchedApp, title: string) {
  await go(app.page, 'Encyklopedie');
  await app.page.getByTestId('wiki-list').getByText(title, { exact: true }).click();
}

test('setup: two organizers and a wiki page', async () => {
  if (!stack) return;
  await setUpTeam(stack, kvido);
  await joinTeam(stack, bara, 'Bára Organizátorka', await inviteCode(kvido.page, 'Organizátor'));
  await go(kvido.page, 'Encyklopedie');
  await kvido.page.getByRole('button', { name: 'Do světa' }).click();
  await named(kvido.page, 'Lipnov');
  await shareWithEveryone(kvido.page);
  await syncNow(bara.page);
});

test('records created and edited offline reach the server later', async () => {
  const { page } = kvido;
  await setOffline(page, true);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'offline');
  await go(page, 'Encyklopedie');
  await page.getByRole('button', { name: 'Do světa' }).click();
  await named(page, 'Severní marka');
  await page.getByLabel('Shrnutí').fill('Kraj za řekou.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByTestId('outbox-badge')).toHaveText('Čeká: 1');

  await setOffline(page, false);
  await expect(page.getByTestId('outbox-badge')).toHaveCount(0, { timeout: 30_000 });
  await syncNow(bara.page);
  await openPage(bara, 'Severní marka');
  await expect(bara.page.getByLabel('Shrnutí')).toHaveValue('Kraj za řekou.');
});

test('an offline edit of something changed meanwhile asks which version wins', async () => {
  await openPage(kvido, 'Lipnov');
  await setOffline(kvido.page, true);
  await expect(kvido.page.getByTestId('sync-state')).toHaveAttribute('data-state', 'offline');
  await kvido.page.getByLabel('Shrnutí').fill('Ves u brodu.');
  await kvido.page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(kvido.page.getByTestId('outbox-badge')).toHaveText('Čeká: 1');

  // Meanwhile Bára edits the same page online.
  await openPage(bara, 'Lipnov');
  await bara.page.getByLabel('Shrnutí').fill('Městečko na hranici.');
  await bara.page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(bara.page.getByText('Uloženo').first()).toBeVisible();

  await setOffline(kvido.page, false);
  const badge = kvido.page.getByTestId('outbox-badge');
  await expect(badge).toHaveText('Server odmítl: 1', { timeout: 30_000 });
  await badge.click();
  await kvido.page.getByRole('button', { name: 'Porovnat' }).click();
  const dialog = kvido.page.getByTestId('conflict-dialog');
  await expect(dialog).toContainText('Ves u brodu.');
  await expect(dialog).toContainText('Městečko na hranici.');
  await dialog.getByRole('button', { name: 'Ponechat moji' }).click();
  await expect(badge).toHaveCount(0, { timeout: 30_000 });

  await syncNow(bara.page);
  await openPage(bara, 'Lipnov');
  await expect(bara.page.getByLabel('Shrnutí')).toHaveValue('Ves u brodu.');
});
