import { expect, test } from '@playwright/test';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import {
  choose,
  createCharacter,
  createPhase,
  go,
  named,
  setOffline,
  setUpTeam,
  syncNow,
} from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
let player: LaunchedApp;

test.beforeAll(async () => {
  organizer = await launchApp();
  player = await launchApp();
});

test.afterAll(async () => {
  await organizer.close();
  await player.close();
});

test('setup: phases, a character and a document for phase I', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer, player);
  const { page } = organizer;
  await createPhase(page, 'Příjezd');
  await createPhase(page, 'Obléhání');
  await createCharacter(page, 'Hraběnka z Lipnova', 'Hana Hráčka');
  await go(page, 'Dokumenty');
  await page.getByRole('button', { name: 'Nový dokument' }).click();
  await named(page, 'Dopis hraběnce');
  await choose(page, 'Fáze', '1 Obléhání');
  await page.getByLabel('Komu ho dáme').first().click();
  await page.getByRole('option', { name: 'Hraběnka z Lipnova' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
});

test('the dashboard starts phases and delivers what is next', async () => {
  const { page } = organizer;
  await go(page, 'Živá hra');
  await expect(page.getByTestId('current-phase')).toHaveText('Hra ještě nezačala.');
  await page.getByRole('button', { name: 'Začít hru: 0 Příjezd' }).click();
  await expect(page.getByTestId('current-phase')).toHaveText('0 Příjezd');
  await expect(page.getByText('V této fázi už nic nečeká.')).toBeVisible();

  await page.getByRole('button', { name: 'Začít fázi 1 Obléhání' }).click();
  await expect(page.getByTestId('current-phase')).toHaveText('1 Obléhání');
  const item = page.getByTestId('next-item').filter({ hasText: 'Dopis hraběnce' });
  await expect(item).toContainText('pro Hraběnka z Lipnova');
  await item.getByRole('button', { name: 'Doručeno' }).click();
  await expect(item).toHaveCount(0);
  const log = page.getByTestId('event-log');
  await expect(log.getByTestId('event').first()).toContainText('Dopis hraběnce');
  await expect(log).toContainText('1 Obléhání');

  await page.getByLabel('Deník').fill('Začala bouřka, hra pokračuje pod střechou.');
  await page.getByLabel('Deník').press('Control+Enter');
  await expect(log.getByTestId('event').first()).toContainText('Začala bouřka');

  // The server has it too: the document is delivered in the document list.
  await expect(page.getByTestId('outbox-badge')).toHaveCount(0);
  await go(page, 'Dokumenty');
  await expect(
    page.getByTestId('document-row').filter({ hasText: 'Dopis hraběnce' }),
  ).toContainText('Doručený');
});

test('without a connection, entries wait in the outbox and go out later', async () => {
  const { page } = organizer;
  await go(page, 'Živá hra');
  await setOffline(page, true);
  await page.getByLabel('Deník').fill('Lapka utekl do lesa.');
  await page.getByRole('button', { name: 'Zapsat' }).click();
  const entry = page.getByTestId('event').filter({ hasText: 'Lapka utekl' });
  await expect(entry).toContainText('čeká na odeslání');
  await expect(page.getByTestId('outbox-badge')).toHaveText('Čeká: 1');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'offline');

  await setOffline(page, false);
  await expect(page.getByTestId('outbox-badge')).toHaveCount(0, { timeout: 30_000 });
  await expect(entry).not.toContainText('čeká na odeslání');
});

test('trackers keep per-character values and warn at the threshold', async () => {
  const { page } = organizer;
  await go(page, 'Stav postav');
  await expect(page.getByText(/Hra zatím nic nesleduje/)).toBeVisible();
  await page.getByRole('tab', { name: 'Sledované hodnoty' }).click();
  await page.getByRole('button', { name: 'Nová sledovaná hodnota' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Zranění');
  await dialog.getByLabel('Nejvíc').fill('5');
  await dialog.getByLabel('Varovat od').fill('3');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: 'Stav' }).click();
  const row = page.locator('[data-testid="tracker-row"][data-name="Hraběnka z Lipnova"]');
  await expect(row).toContainText('Hana Hráčka');
  const plus = row.getByRole('button', { name: 'Přidat: Zranění, Hraběnka z Lipnova' });
  for (let i = 0; i < 3; i++) await plus.click();
  await expect(row.getByTestId('tracker-value')).toHaveText('3');
  await expect(row.getByTestId('tracker-value')).toHaveCSS('color', /rgb\(2[0-9]{2}, /);
  await row.getByRole('button', { name: 'Ubrat: Zranění, Hraběnka z Lipnova' }).click();
  await expect(row.getByTestId('tracker-value')).toHaveText('2');

  await row.getByText('Hraběnka z Lipnova').click();
  await expect(page.getByRole('dialog', { name: /Historie/ })).toContainText('Zranění');

  await page.getByLabel('Hledat postavu, CP nebo hráče…').fill('nikdo');
  await expect(page.getByTestId('tracker-row')).toHaveCount(0);
});

test('players see none of it', async () => {
  const { page } = player;
  await syncNow(page);
  const nav = page.getByRole('navigation');
  await expect(nav.getByText('Živá hra', { exact: true })).toHaveCount(0);
  await expect(nav.getByText('Stav postav', { exact: true })).toHaveCount(0);
});
