import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import {
  choose,
  createCharacter,
  go,
  named,
  setUpTeam,
  shareWithEveryone,
  syncNow,
} from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
let player: LaunchedApp;
const saveDir = mkdtempSync(join(tmpdir(), 'zazemi-saved-'));
const csvDir = mkdtempSync(join(tmpdir(), 'zazemi-csv-'));

/** Invented answers in the shape Google Forms exports them. */
const REGISTRATIONS_CSV = [
  '"Časová značka","E-mailová adresa","Jméno a příjmení","Datum narození","Máš nějaké alergie nebo dietní omezení?","Kontakt v případě nouze (jméno a telefon)"',
  '"2027/03/01 10:00:00","hana@example.test","Hana Hráčka","1.1.1999","bez lepku","Matka, 600 000 001"',
  '"2027/03/02 11:00:00","lida@example.test","Lída Nová","1.6.2012","ne","Otec, 600 000 002"',
  '"2027/03/03 12:00:00","ota@example.test","Ota Nový","5.5.1990","","Sestra, 600 000 003"',
].join('\r\n');

const SURVEY_CSV = [
  'Časová značka,Jméno,Jak se ti hra líbila? (1-5),Co zlepšit?',
  '2027/06/01,Hana Hráčka,5,Víc jídla',
  '2027/06/01,Ota Nový,4,Kratší noční fáze',
].join('\n');

function csv(name: string, content: string): string {
  const path = join(csvDir, name);
  writeFileSync(path, content);
  return path;
}

async function saved(name: string): Promise<Buffer> {
  await expect.poll(() => existsSync(join(saveDir, name)), { timeout: 30_000 }).toBe(true);
  return readFileSync(join(saveDir, name));
}

async function sheetTexts(bytes: Buffer, sheetName: string, column: number): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  const texts: string[] = [];
  workbook.getWorksheet(sheetName)?.eachRow((row) => texts.push(row.getCell(column).text));
  return texts;
}

/** Fills a text field in a dialog and leaves it (closes any autocomplete list). */
async function type(scope: Locator, label: string, value: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Tab');
}

test.beforeAll(async () => {
  organizer = await launchApp({ env: { ZAZEMI_SAVE_DIR: saveDir } });
  player = await launchApp();
});

test.afterAll(async () => {
  await organizer.close();
  await player.close();
  rmSync(csvDir, { recursive: true, force: true });
});

test('setup: a team with a player and a character', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer, player);
  await createCharacter(organizer.page, 'Hraběnka z Lipnova');
});

test('registrations import from a Google Forms CSV with only the minimal fields', async () => {
  const { page } = organizer;
  await go(page, 'Přihlášky');
  await page.locator('input[type="file"]').setInputFiles(csv('prihlasky.csv', REGISTRATIONS_CSV));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('import-summary')).toHaveText('Načte se: 3 přihlášky');
  await expect(dialog.getByText('propojeno')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Načíst' }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByTestId('registrations');
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row', { name: /Hana Hráčka/ })).toContainText('1 Lepek');
  await expect(page.getByTestId('registered-count')).toHaveText(
    'Přihlášeno (bez zrušených): 3 přihlášky',
  );
  await expect(page.getByTestId('missing-consent')).toContainText('Lída Nová');
  // E-mails are never stored.
  await expect(page.getByText('example.test')).toHaveCount(0);

  await table
    .getByRole('row', { name: /Lída Nová/ })
    .getByText('Lída Nová')
    .click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Podepsaný souhlas rodičů máme').check();
  await choose(edit, 'Stav', 'Zaplaceno');
  await edit.getByRole('button', { name: 'Uložit' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByTestId('missing-consent')).toBeHidden();
  await expect(table.getByRole('row', { name: /Lída Nová/ })).toContainText('Zaplaceno');
});

test('a player sees only their own registration and fixes their allergies', async () => {
  const { page } = player;
  await syncNow(page);
  await expect(page.getByRole('navigation').getByText('Přihlášky', { exact: true })).toHaveCount(0);
  await go(page, 'Moje přihláška');
  await expect(page.getByText('Hana Hráčka', { exact: true })).toBeVisible();
  await expect(page.getByText('Lída Nová')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Alergeny a strava' }).click();
  await page.getByRole('option', { name: '8 Ořechy' }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Kontakt v nouzi').fill('Matka, 600 000 009');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();

  await syncNow(organizer.page);
  const row = organizer.page.getByTestId('registrations').getByRole('row', { name: /Hana Hráčka/ });
  await expect(row).toContainText('8 Ořechy');
  await expect(row).toContainText('Matka, 600 000 009');
});

test('the menu flags allergies and the shopping list adds up per shop', async () => {
  const { page } = organizer;
  await go(page, 'Jídlo');
  await page.getByRole('tab', { name: 'Suroviny' }).click();
  for (const [name, price, pack, allergen] of [
    ['Mouka', '20', '1', '1 Lepek'],
    ['Brambory', '15', '5', null],
  ] as const) {
    await page.getByRole('button', { name: 'Nová surovina' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Název').fill(name);
    await type(dialog, 'Obchod', 'Makro');
    await dialog.getByLabel('Cena za jednotku (Kč)').fill(price);
    await dialog.getByLabel('Velikost balení').fill(pack);
    if (allergen) {
      await dialog.getByRole('combobox', { name: 'Alergeny a strava' }).click();
      await page.getByRole('option', { name: allergen }).click();
      await dialog.getByLabel('Název').click();
    }
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId('ingredients').getByRole('row')).toHaveCount(3);

  await page.getByRole('tab', { name: 'Jídla' }).click();
  for (const [name, quantity, ingredient] of [
    ['Lívance', '100', 'Mouka'],
    ['Bramboráky', '300', 'Brambory'],
  ] as const) {
    await page.getByRole('button', { name: 'Nové jídlo' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Název').fill(name);
    await dialog.getByRole('button', { name: 'Přidat surovinu' }).click();
    await dialog.getByLabel('Množství').fill(quantity);
    await type(dialog, 'Jednotka', 'g');
    await choose(dialog, 'Surovina', ingredient);
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId('dish').filter({ hasText: 'Lívance' })).toContainText('1 Lepek');
  await expect(page.getByTestId('dish').filter({ hasText: 'Bramboráky' })).toContainText(
    'veganské',
  );

  await page.getByRole('tab', { name: 'Jídelníček' }).click();
  await page.getByRole('button', { name: 'Nový chod' }).click();
  let dialog = page.getByRole('dialog');
  await choose(dialog, 'Chod', 'Oběd');
  await dialog.getByRole('button', { name: 'Přidat jídlo' }).click();
  await choose(dialog, 'Jídlo', 'Lívance');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  const meal = page.getByTestId('meal').filter({ hasText: '1. den – Oběd' });
  await expect(meal.getByTestId('meal-flags')).toContainText('Hana Hráčka (1 Lepek)');

  // Offering potato pancakes to half of the table covers Hana.
  await meal.getByText('1. den – Oběd').click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Podíl strávníků (%)').fill('50');
  await dialog.getByRole('button', { name: 'Přidat jídlo' }).click();
  await dialog.getByRole('combobox', { name: 'Jídlo', exact: true }).last().click();
  await page.getByRole('option', { name: 'Bramboráky', exact: true }).click();
  await dialog.getByLabel('Podíl strávníků (%)').last().fill('50');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(meal.getByTestId('meal-flags')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Nákup' }).click();
  await expect(page.getByTestId('headcount')).toHaveValue('3');
  await page.getByTestId('headcount').fill('40');
  // 20 × 100 g flour = 2 kg (2 packs, 40 Kč); 20 × 300 g potatoes = 6 kg → two 5 kg sacks (150 Kč).
  await expect(page.getByTestId('shopping-total')).toHaveText('Celkem 190 Kč, na osobu 4,75 Kč');
  await expect(page.getByTestId('shop')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stáhnout .xlsx' }).click();
  const texts = await sheetTexts(await saved('Nákup Pevnost na hranici.xlsx'), 'Nákup', 2);
  expect(texts).toEqual(expect.arrayContaining(['Brambory', 'Mouka']));
});

test('the budget compares plan and reality and exports to Excel', async () => {
  const { page } = organizer;
  await go(page, 'Rozpočet');
  for (const [kind, name, category, planned, actual] of [
    ['Příjem', 'Poplatky hráčů', 'Poplatky', '6000', '4500'],
    ['Výdaj', 'Pronájem statku', 'Prostory', '3000', '3200'],
  ] as const) {
    await page.getByRole('button', { name: 'Nová položka' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(kind, { exact: true }).click();
    await dialog.getByLabel('Položka').fill(name);
    await type(dialog, 'Kategorie', category);
    await dialog.getByLabel('Plán').fill(planned);
    await dialog.getByLabel('Skutečnost').fill(actual);
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId('budget-balance')).toContainText('1 300 Kč');
  await expect(page.getByTestId('budget-per-head')).toContainText('1 066,67 Kč');
  await expect(
    page.getByTestId('budget-expense').getByRole('row', { name: /Pronájem statku/ }),
  ).toContainText('200 Kč');
  await page.getByRole('button', { name: 'Stáhnout .xlsx' }).click();
  const texts = await sheetTexts(await saved('Rozpočet Pevnost na hranici.xlsx'), 'Rozpočet', 3);
  expect(texts).toEqual(expect.arrayContaining(['Poplatky hráčů', 'Pronájem statku']));
});

test('players see the list of things to bring once it is shared', async () => {
  const { page } = organizer;
  await go(page, 'Vybavení');
  await page.getByRole('button', { name: 'Nový seznam' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Co si vzít');
  await dialog.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Přidat věc' }).click();
  await page.getByLabel('Věc').fill('Spacák');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
  await shareWithEveryone(page);

  await syncNow(player.page);
  await go(player.page, 'Vybavení');
  await expect(player.page.getByTestId('equipment-entries')).toContainText('Spacák');
  await go(player.page, 'Moje přihláška');
  await expect(
    player.page.getByRole('link', { name: 'Seznam věcí, které si mají hráči přivézt' }),
  ).toBeVisible();
});

test('tasks show who does what and what is overdue', async () => {
  const { page } = organizer;
  await go(page, 'Úkolníček');
  await page.getByRole('button', { name: 'Nový úkol' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Objednat seno');
  await choose(dialog, 'Kdo', 'Kvido Organizátor');
  await dialog.getByLabel('Do kdy').fill('2020-01-31');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByTestId('tasks').getByRole('row', { name: /Objednat seno/ });
  await expect(row).toContainText('31. 1. 2020 · Po termínu');
  await page.getByText('Moje', { exact: true }).click();
  await expect(row).toBeVisible();
  // Done tasks leave the open lists straight away.
  await row.getByRole('checkbox').click();
  await expect(row).toBeHidden();
  await page.getByText('Otevřené', { exact: true }).click();
  await expect(page.getByText('Žádné úkoly.')).toBeVisible();
  await page.getByText('Všechny', { exact: true }).click();
  await expect(row.getByRole('checkbox')).toBeChecked();
});

test('notes keep rich text', async () => {
  const { page } = organizer;
  await go(page, 'Poznámky');
  await page.getByRole('button', { name: 'Nová poznámka' }).click();
  await named(page, 'Nápady na příště');
  const body = page.getByTestId('note-body').locator('.ProseMirror');
  await body.click();
  await page.keyboard.type('Víc stínového divadla.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
  await go(page, 'Přehled');
  await go(page, 'Poznámky');
  await page.getByText('Nápady na příště').click();
  await expect(page.getByTestId('note-body')).toContainText('Víc stínového divadla.');
});

test('a survey becomes a retrospective without the names', async () => {
  const { page } = organizer;
  await go(page, 'Zpětná vazba');
  await page.locator('input[type="file"]').setInputFiles(csv('dotaznik.csv', SURVEY_CSV));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Jméno')).not.toBeChecked();
  await expect(dialog.getByLabel('Co zlepšit?')).toBeChecked();
  await dialog.getByRole('button', { name: 'Načíst' }).click();
  await expect(dialog).toBeHidden();
  const questions = page.getByTestId('survey-question');
  await expect(questions).toHaveCount(2);
  await expect(questions.first()).toContainText('průměr 4,5 (od 4 do 5)');
  await expect(questions.last()).toContainText('Kratší noční fáze');
  await expect(page.getByRole('main').getByText('Ota Nový')).toHaveCount(0);
});

test('backups leave registrations out unless asked', async () => {
  const { page } = organizer;
  await go(page, 'Nastavení');
  const day = new Date();
  const name = `zazemi-zaloha-spolek-lipnov-${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}.zip`;
  type Backup = { tables: Record<string, unknown[]> };
  /** Waits until the zip is complete, reads zazemi.json and removes the file. */
  const backupJson = async (): Promise<Backup> => {
    const path = join(saveDir, name);
    const read: { value: Backup | null } = { value: null };
    await expect
      .poll(
        () => {
          try {
            const json = unzipSync(new Uint8Array(readFileSync(path)))['zazemi.json'];
            if (json) read.value = JSON.parse(strFromU8(json)) as Backup;
          } catch {
            read.value = null;
          }
          return read.value !== null;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    rmSync(path);
    if (!read.value) throw new Error('no backup');
    return read.value;
  };
  await page.getByRole('button', { name: 'Stáhnout zálohu' }).click();
  let backup = await backupJson();
  expect(backup.tables['registrations']).toBeUndefined();
  expect(JSON.stringify(backup)).not.toContain('600 000 002');

  await page.getByLabel('Včetně přihlášek').check();
  await page.getByRole('button', { name: 'Stáhnout zálohu' }).click();
  backup = await backupJson();
  expect(backup.tables['registrations']).toHaveLength(3);
});
