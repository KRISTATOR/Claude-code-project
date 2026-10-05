import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import { choose, createCharacter, createPhase, go, named, setUpTeam, syncNow } from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
let player: LaunchedApp;
const saveDir = mkdtempSync(join(tmpdir(), 'zazemi-saved-'));

test.beforeAll(async () => {
  organizer = await launchApp({ env: { ZAZEMI_SAVE_DIR: saveDir } });
  player = await launchApp();
});

test.afterAll(async () => {
  await organizer.close();
  await player.close();
});

test('setup: a team with a player, a phase and a character', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer, player);
  await createPhase(organizer.page, 'Příjezd');
  await createCharacter(organizer.page, 'Hraběnka z Lipnova', 'Hana Hráčka');
});

test('money uses Czech plurals and the catalogue shows prices in it', async () => {
  const { page } = organizer;
  await go(page, 'Předměty a peníze');
  await page.getByRole('tab', { name: 'Měna' }).click();
  await expect(page.getByTestId('currency-sample')).toHaveText('Ukázka: 1,5 = 1 orel 5 grošů');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Katalog' }).click();
  await page.getByRole('button', { name: 'Nový předmět' }).click();
  await named(page, 'Chléb');
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cena', { exact: true }).fill('1,5');
  await choose(dialog, 'Režim obchodu', 'Na příděl');
  await choose(dialog, 'Na začátku má', 'Hraběnka z Lipnova');
  await dialog.getByLabel('Počet').fill('3');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('item-row').filter({ hasText: 'Chléb' })).toContainText(
    '1 orel 5 grošů',
  );

  await page.getByRole('button', { name: 'Nový předmět' }).click();
  await named(page, 'Kůň');
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cena', { exact: true }).fill('40');
  await dialog.getByLabel('Rychlost cestování').fill('3');
  await choose(dialog, 'Podoba', 'Skutečná rekvizita');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('item-row')).toHaveCount(2);
});

test('the ledger tracks transfers and the sheet shows what a character holds', async () => {
  const { page } = organizer;
  await page.getByRole('tab', { name: 'Majetek' }).click();
  await expect(
    page.locator('[data-testid="holder"][data-name="Hraběnka z Lipnova"]'),
  ).toContainText('3× Chléb');
  await page.getByRole('button', { name: 'Nový převod' }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, 'Předmět', 'Chléb');
  await choose(dialog, 'Od', 'Hraběnka z Lipnova');
  await dialog.getByLabel('Poznámka').fill('snědla');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('[data-testid="holder"][data-name="Hraběnka z Lipnova"]'),
  ).toContainText('2× Chléb');
  await expect(page.getByTestId('transfers')).toContainText('snědla');

  await go(page, 'Postavy');
  await page.getByTestId('roster').getByRole('link', { name: 'Hraběnka z Lipnova' }).click();
  await expect(page.getByTestId('property')).toContainText('2× Chléb');
});

test('item cards print eight to an A4 sheet', async () => {
  const { page } = organizer;
  await go(page, 'Předměty a peníze');
  await page.getByRole('tab', { name: 'Karty a poukázky' }).click();
  await page.getByRole('button', { name: 'Exportovat' }).first().click();
  await page.getByRole('menuitem', { name: 'PDF' }).click();
  const file = join(saveDir, 'Karty předmětů.pdf');
  await expect.poll(() => existsSync(file), { timeout: 30_000 }).toBe(true);
  const pdf = await PDFDocument.load(readFileSync(file));
  expect(pdf.getPageCount()).toBe(1);
  const { width, height } = pdf.getPage(0).getSize();
  expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
});

test('travel times use the quickest route and mounts', async () => {
  const { page } = organizer;
  await go(page, 'Cesty');
  for (const [from, to, minutes] of [
    ['Lipnov', 'Hrad', '120'],
    ['Hrad', 'Klášter', '60'],
  ] as const) {
    await page.getByRole('button', { name: 'Nová cesta' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Název místa').first().fill(from);
    await dialog.getByPlaceholder('Název místa').last().fill(to);
    await dialog.getByLabel('Pěšky (minut)').fill(minutes);
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await choose(page, 'Odkud', 'Lipnov');
  await choose(page, 'Kam', 'Klášter');
  await expect(page.getByTestId('trip')).toContainText('Cesta trvá 3 h (pěšky 3 h).');
  await expect(page.getByTestId('trip')).toContainText('Lipnov → Hrad → Klášter');
  await page.getByRole('combobox', { name: 'Zvíře nebo vůz' }).click();
  await page.getByRole('option', { name: 'Kůň (×3)' }).click();
  await expect(page.getByTestId('trip')).toContainText('Cesta trvá 1 h (pěšky 3 h).');
});

test('the sleeping plan checks capacity', async () => {
  const { page } = organizer;
  await go(page, 'Spaní');
  await page.getByRole('button', { name: 'Založit plán spaní' }).click();
  await page.getByRole('button', { name: 'Přidat místo' }).click();
  await page.getByLabel('Budova nebo místnost').fill('Stodola');
  await page.getByLabel('Míst', { exact: true }).fill('1');
  for (const name of ['Hana Hráčka', 'Kvido Organizátor']) {
    await page.getByRole('button', { name: 'Přidat osobu' }).click();
    await page.getByRole('combobox', { name: 'Osoba' }).last().click();
    await page.getByRole('option', { name }).click();
  }
  await expect(page.getByTestId('over-capacity')).toContainText('Stodola');
  await page.getByLabel('Míst', { exact: true }).fill('2');
  await expect(page.getByTestId('over-capacity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
});

test('maps have layers; a secret layer stays hidden from players', async () => {
  const { page } = organizer;
  await go(page, 'Mapy');
  await page.getByRole('button', { name: 'Nová mapa' }).click();
  await page.getByRole('dialog').getByLabel('Název').fill('Lipnov');
  await page.getByRole('dialog').getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByTestId('map-layer')).toHaveCount(1);

  const canvas = page.getByTestId('map-canvas').locator('canvas').last();
  await page.getByTestId('map-tools').getByText('Budova').click();
  await canvas.click({ position: { x: 200, y: 150 } });
  const panel = page.getByTestId('map-object');
  await panel.getByLabel('Číslo domu').fill('4');
  await panel.getByLabel('Popisek').fill('Kovárna');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();

  // The base layer and the map are shared; a new layer stays organizer-only.
  await page.getByRole('button', { name: 'Nastavení mapy' }).click();
  const settings = page.getByRole('dialog');
  await settings.getByText('Všichni v týmu').click();
  await settings.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await settings.getByRole('button', { name: 'Zrušit' }).click();
  await page.getByRole('button', { name: 'Kdo vrstvu vidí' }).first().click();
  const layerDialog = page.getByRole('dialog');
  await layerDialog.getByText('Všichni v týmu').click();
  await layerDialog.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await layerDialog
    .getByRole('button', { name: 'Uložit viditelnost' })
    .waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Nová vrstva' }).click();
  await expect(page.getByTestId('map-layer')).toHaveCount(2);

  await page.getByRole('button', { name: 'Exportovat' }).click();
  await page.getByRole('menuitem', { name: 'PNG' }).click();
  await expect.poll(() => existsSync(join(saveDir, 'Lipnov.png')), { timeout: 30_000 }).toBe(true);

  await syncNow(player.page);
  await go(player.page, 'Mapy');
  await player.page.getByText('Lipnov', { exact: true }).click();
  await expect(player.page.getByTestId('map-layer')).toHaveCount(1);
  await expect(player.page.getByTestId('map-tools')).toHaveCount(0);
});

test('the props inventory is shared across games', async () => {
  const { page } = organizer;
  await go(page, 'Sklad rekvizit');
  await page.getByRole('button', { name: 'Nová rekvizita' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Stan pro 4');
  await dialog.getByLabel('Kusů').fill('2');
  await dialog.getByLabel('Kde je uložená').fill('garáž, bedna 3');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByTestId('inventory')).toContainText('garáž, bedna 3');
});
