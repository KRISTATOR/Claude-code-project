import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { connect, launchApp, signUp, stackEnv, uniqueEmail, type LaunchedApp } from './app';
import { makeDocx, makePdf, makeXlsx, tinyPng } from './fixtures';
import { inviteCode, joinTeam } from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let kvido: LaunchedApp;
let bara: LaunchedApp;
let player: LaunchedApp;
const files = mkdtempSync(join(tmpdir(), 'zazemi-files-'));

async function go(page: Page, label: string) {
  await page.getByRole('navigation').getByText(label, { exact: true }).click();
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'idle');
}

function row(page: Page, name: string) {
  return page.locator(`[data-testid="drive-row"][data-name="${name}"]`);
}

const invite = inviteCode;
const joinTeamAs = (app: LaunchedApp, name: string, code: string) =>
  stack ? joinTeam(stack, app, name, code) : Promise.resolve();

test.beforeAll(async () => {
  writeFileSync(
    join(files, 'Dopis č. 12.docx'),
    makeDocx(['Milá hraběnko,', 've Lipnově se nic neděje.']),
  );
  writeFileSync(
    join(files, 'Rozpočet.xlsx'),
    await makeXlsx([
      ['Položka', 'Cena'],
      ['Mouka', 120],
    ]),
  );
  writeFileSync(join(files, 'Pravidla.pdf'), makePdf('Boj probiha na dotek'));
  writeFileSync(join(files, 'Mapa.png'), tinyPng);
  writeFileSync(join(files, 'Poznámky.md'), '# Lipnice\n\nVesnice u **hranice**.');
  // Playwright drops non-ASCII file *paths* when filling an Electron file input
  // (a harness limitation), so the folder upload uses ASCII names and the
  // Czech-named files are passed as in-memory buffers below.
  const archive = join(files, 'Archiv');
  mkdirSync(join(archive, 'Faze III'), { recursive: true });
  writeFileSync(join(archive, 'Uvod.txt'), 'Archiv obce.');
  writeFileSync(join(archive, 'Faze III', 'Dopis 40.txt'), 'Rekvírovat obilí.');

  kvido = await launchApp({ env: { ZAZEMI_FAKE_OFFICE: 'keep-open' } });
  bara = await launchApp();
  player = await launchApp();
});

test.afterAll(async () => {
  await kvido.close();
  await bara.close();
  await player.close();
});

test('an organizer uploads files and a whole folder', async () => {
  const { page } = kvido;
  if (!stack) return;
  await connect(page, stack);
  await signUp(page, uniqueEmail('kvido'));
  await page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Kvido');
  await page.getByLabel('Název týmu').fill('Disk test');
  await page.getByRole('button', { name: 'Založit tým' }).click();
  await expect(page.getByTestId('team-name')).toHaveText('Disk test');

  await go(page, 'Disk');
  const names = ['Dopis č. 12.docx', 'Rozpočet.xlsx', 'Pravidla.pdf', 'Mapa.png', 'Poznámky.md'];
  await page.getByTestId('upload-input').setInputFiles(
    names.map((name) => ({
      name,
      mimeType: 'application/octet-stream',
      buffer: readFileSync(join(files, name)),
    })),
  );
  for (const name of [
    'Dopis č. 12.docx',
    'Rozpočet.xlsx',
    'Pravidla.pdf',
    'Mapa.png',
    'Poznámky.md',
  ]) {
    await expect(row(page, name)).toBeVisible({ timeout: 20_000 });
  }

  await page.getByTestId('upload-folder-input').setInputFiles(join(files, 'Archiv'));
  await expect(row(page, 'Archiv')).toBeVisible({ timeout: 20_000 });
  await row(page, 'Archiv').dblclick();
  await expect(row(page, 'Uvod.txt')).toBeVisible();
  await row(page, 'Faze III').dblclick();
  await expect(row(page, 'Dopis 40.txt')).toBeVisible();
});

test('previews render inside the app', async () => {
  const { page } = kvido;
  await page.getByRole('button', { name: 'Disk test' }).click();
  await row(page, 'Dopis č. 12.docx').click();
  await expect(page.getByTestId('file-preview')).toContainText('ve Lipnově se nic neděje', {
    timeout: 15_000,
  });
  await row(page, 'Rozpočet.xlsx').click();
  await expect(page.getByTestId('file-preview')).toContainText('Mouka');
  await row(page, 'Poznámky.md').click();
  await expect(
    page.getByTestId('file-preview').getByRole('heading', { name: 'Lipnice' }),
  ).toBeVisible();
  await row(page, 'Pravidla.pdf').click();
  await expect(page.getByTestId('file-preview').locator('canvas')).toBeVisible({ timeout: 15_000 });
  await row(page, 'Mapa.png').click();
  await expect(page.getByTestId('file-preview').getByRole('img')).toBeVisible();
});

test('search finds words inside files, ignoring diacritics', async () => {
  const { page } = kvido;
  await go(page, 'Hledání');
  await page.getByTestId('search-input').fill('lipnov');
  await expect(
    page.getByTestId('search-hit').filter({ hasText: 'Dopis č. 12.docx' }),
  ).toBeVisible();
  await page.getByTestId('search-input').fill('dotek');
  await expect(page.getByTestId('search-hit').filter({ hasText: 'Pravidla.pdf' })).toBeVisible();
  await page.getByTestId('search-hit').first().click();
  await expect(page.getByTestId('detail-panel')).toContainText('Pravidla.pdf');
});

test('a second organizer joins', async () => {
  const code = await invite(kvido.page, 'Organizátor');
  await joinTeamAs(bara, 'Bára', code);
});

test('opening in Office checks the file out; saves become a version', async () => {
  const { page } = kvido;
  await go(page, 'Disk');
  await row(page, 'Dopis č. 12.docx').click();
  await page.getByRole('button', { name: 'Otevřít v aplikaci' }).click();
  await expect(page.getByTestId('editing-indicator')).toBeVisible();
  // The fake Word saves a change after a moment; it becomes version 2.
  await expect(page.getByText('„Dopis č. 12.docx“ uloženo jako nová verze.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('version-row')).toHaveCount(2);

  // Bára sees the lock and can only open it read-only.
  await go(bara.page, 'Disk');
  await syncNow(bara.page);
  await row(bara.page, 'Dopis č. 12.docx').click();
  await expect(bara.page.getByTestId('lock-alert')).toContainText('Upravuje Kvido');
  await expect(bara.page.getByRole('button', { name: 'Otevřít v aplikaci' })).toHaveCount(0);
  await expect(bara.page.getByRole('button', { name: 'Otevřít jen ke čtení' })).toBeVisible();
});

test('"Hotovo" checks the file in and frees it for others', async () => {
  const { page } = kvido;
  await page.getByTestId('editing-indicator').click();
  await page.getByTestId('editing-done').click();
  await expect(page.getByText('„Dopis č. 12.docx“ je zpět k dispozici ostatním.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('editing-indicator')).toHaveCount(0);

  await syncNow(bara.page);
  await expect(bara.page.getByTestId('lock-alert')).toHaveCount(0);
  await expect(bara.page.getByRole('button', { name: 'Otevřít v aplikaci' })).toBeVisible();
  // The fake Word appends bytes to the archive: a new version, same visible text.
  await expect(bara.page.getByTestId('version-row')).toHaveCount(2);
});

test('a player sees a shared file whose folder is hidden', async () => {
  const code = await invite(kvido.page, 'Hráč');
  await joinTeamAs(player, 'Hana', code);

  const { page } = kvido;
  await go(page, 'Disk');
  await page.getByRole('button', { name: 'Disk test' }).click();
  await row(page, 'Archiv').dblclick();
  await row(page, 'Uvod.txt').click();
  const editor = page.getByTestId('visibility-editor');
  await editor.getByText('Všichni v týmu').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(page.getByTestId('readers-panel')).toContainText('Hana');

  await go(player.page, 'Disk');
  await syncNow(player.page);
  await player.page.getByText('Sdíleno se mnou').click();
  await row(player.page, 'Uvod.txt').click();
  await expect(player.page.getByTestId('file-preview')).toContainText('Archiv obce.');
  // Nothing organizer-only leaks into the player's drive.
  await player.page.getByText('Společné').click();
  await expect(player.page.getByTestId('drive-row')).toHaveCount(0);
});
