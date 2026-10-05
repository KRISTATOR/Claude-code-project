import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import { go, setUpTeam } from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
const work = mkdtempSync(join(tmpdir(), 'zazemi-import-'));
const saveDir = join(work, 'saved');
const listFile = join(work, 'open.txt');

/** Which files the app "picks" in its open dialog next. */
function willOpen(...paths: string[]) {
  writeFileSync(listFile, paths.join('\n'));
}

function row(page: Page, name: string) {
  return page.locator(`[data-testid="drive-row"][data-name="${name}"]`);
}

/** A Google Takeout export in two parts, with invented content. */
function takeout(): string[] {
  const root = 'Takeout/Disk Google/Chýnice';
  const letter = strToU8('Milá hraběnko, ve Lipnově se nic neděje.');
  const part1 = zipSync({
    'Takeout/archive_browser.html': strToU8('<html></html>'),
    [`${root}/Pravidla.txt`]: strToU8('Pravidla hry'),
    [`${root}/Dopisy/Dopis.txt`]: letter,
    [`${root}/Dopisy/Dopis(1).txt`]: letter,
    [`${root}/Přihláška.gform`]: strToU8('{}'),
  });
  const part2 = zipSync({ [`${root}/Mapy/Popis mapy.txt`]: strToU8('Sever je nahoře.') });
  const paths = [join(work, 'takeout-001.zip'), join(work, 'takeout-002.zip')];
  writeFileSync(paths[0] ?? '', part1);
  writeFileSync(paths[1] ?? '', part2);
  return paths;
}

test.beforeAll(async () => {
  writeFileSync(listFile, '');
  mkdirSync(saveDir);
  organizer = await launchApp({
    env: { ZAZEMI_OPEN_FILES: listFile, ZAZEMI_SAVE_DIR: saveDir },
  });
});

test.afterAll(async () => {
  await organizer.close();
});

test('setup: a team', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer);
});

test('a two-part Takeout export comes in with its folders and a report', async () => {
  const { page } = organizer;
  willOpen(...takeout());
  await go(page, 'Disk');
  await page.getByRole('button', { name: 'Nahrát soubory' }).click();
  await page.getByRole('menuitem', { name: 'Importovat z Google Disku (.zip)' }).click();
  const preview = page.getByRole('dialog', { name: 'Import z Google Disku' });
  await expect(preview.getByTestId('import-count')).toHaveText('Soubory k načtení: 4');
  await preview.getByRole('button', { name: 'Načíst' }).click();

  const report = page.getByTestId('import-report');
  await expect(report).toContainText('Načteno: 3', { timeout: 30_000 });
  await expect(report).toContainText('Chýnice/Dopisy/Dopis(1).txt – stejná kopie jiného souboru');
  await expect(report).toContainText('Chýnice/Přihláška.gform – formulář Google');
  await expect(report).toContainText('archive_browser.html – rejstřík Google Takeout');
  await report.getByRole('button', { name: 'Uložit zprávu (.txt)' }).click();
  await expect
    .poll(() => existsSync(join(saveDir, 'Zpráva o importu.txt')), { timeout: 10_000 })
    .toBe(true);
  expect(readFileSync(join(saveDir, 'Zpráva o importu.txt'), 'utf8')).toContain('Načteno (3)');
  await report.getByRole('button', { name: 'Zavřít' }).click();

  await row(page, 'Chýnice').dblclick();
  await expect(row(page, 'Pravidla.txt')).toBeVisible();
  await row(page, 'Dopisy').dblclick();
  await expect(row(page, 'Dopis.txt')).toBeVisible();
  await expect(row(page, 'Dopis(1).txt')).toHaveCount(0);
});

test('importing the same archives again skips what is already there', async () => {
  const { page } = organizer;
  await page.getByRole('button', { name: 'Spolek Lipnov' }).click();
  await page.getByRole('button', { name: 'Nahrát soubory' }).click();
  await page.getByRole('menuitem', { name: 'Importovat z Google Disku (.zip)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Načíst' }).click();
  const report = page.getByTestId('import-report');
  await expect(report).toContainText('Načteno: 0', { timeout: 30_000 });
  await expect(report).toContainText('Chýnice/Pravidla.txt – už na disku je');
  await report.getByRole('button', { name: 'Zavřít' }).click();
});

test('a backup puts back what was deleted for good', async () => {
  const { page } = organizer;
  await go(page, 'Nastavení');
  await page.getByRole('button', { name: 'Stáhnout zálohu' }).click();
  await expect(page.getByText(/Záloha uložena/).first()).toBeVisible({ timeout: 30_000 });
  const backup = readdirSync(saveDir).find((name) => name.endsWith('.zip'));
  expect(backup).toBeDefined();

  // Delete the "Mapy" folder and its file for good.
  await go(page, 'Disk');
  await page.getByRole('button', { name: 'Spolek Lipnov' }).click();
  await row(page, 'Chýnice').dblclick();
  await row(page, 'Mapy').click();
  await page.getByTestId('detail-panel').getByRole('button', { name: 'Do koše' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Do koše' }).click();
  await expect(row(page, 'Mapy')).toHaveCount(0);
  await go(page, 'Koš');
  // Deleting the folder for good takes the file inside with it.
  await page
    .getByRole('row', { name: /^Mapy/ })
    .getByRole('button', { name: 'Smazat natrvalo' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Smazat natrvalo' }).click();
  await expect(page.getByText('Koš je prázdný.')).toBeVisible({ timeout: 15_000 });

  willOpen(join(saveDir, backup ?? ''));
  await go(page, 'Nastavení');
  await page.getByRole('button', { name: 'Obnovit ze zálohy' }).click();
  await expect(page.getByTestId('restore-summary')).toContainText(
    'Záznamy k obnovení: 2, soubory: 1',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Obnovit' }).click();
  await expect(page.getByText('Obnoveno – záznamy: 2, soubory: 1.')).toBeVisible({
    timeout: 30_000,
  });

  await go(page, 'Disk');
  await page.getByRole('button', { name: 'Spolek Lipnov' }).click();
  await row(page, 'Chýnice').dblclick();
  await row(page, 'Mapy').dblclick();
  await row(page, 'Popis mapy.txt').click();
  await expect(page.getByTestId('file-preview')).toContainText('Sever je nahoře.', {
    timeout: 15_000,
  });
});
