import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import { choose, go, named, setUpTeam } from './helpers';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
const saveDir = mkdtempSync(join(tmpdir(), 'zazemi-saved-'));

/** Opens an "Exportovat" menu and picks PDF or Word; waits for the file. */
async function exportAs(scope: Page | Locator, format: 'PDF' | 'Word (.docx)', file: string) {
  const page = 'keyboard' in scope ? scope : scope.page();
  await scope.getByRole('button', { name: 'Exportovat' }).first().click();
  await page.getByRole('menuitem', { name: format }).click();
  await expect.poll(() => existsSync(join(saveDir, file)), { timeout: 30_000 }).toBe(true);
  return readFileSync(join(saveDir, file));
}

async function pdfPages(bytes: Buffer) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return `${String(Math.round(width))}x${String(Math.round(height))}`;
  });
}

const A4 = '595x842';
const A5 = '420x595';
const A4_LANDSCAPE = '842x595';

test.beforeAll(async () => {
  organizer = await launchApp({ env: { ZAZEMI_SAVE_DIR: saveDir } });
});

test.afterAll(async () => {
  await organizer.close();
});

test('setup: a team, a game with a phase and a character', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer);
  const { page } = organizer;
  await go(page, 'Fáze a bloky');
  await page.getByRole('button', { name: 'Nová fáze' }).click();
  const phaseName = page.getByTestId('phases').getByLabel('Název');
  await phaseName.fill('Příjezd');
  await phaseName.press('Tab');
  await go(page, 'Postavy');
  await page.getByRole('button', { name: 'Nová postava' }).click();
  await page.getByRole('dialog').getByLabel('Jméno postavy').fill('Hraběnka z Lipnova');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByTestId('character-sheet')).toBeVisible();
  await page.getByLabel('Dům č.').fill('4');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
});

test('a writer profile gives documents their look', async () => {
  const { page } = organizer;
  await go(page, 'Pisatelé');
  await page.getByRole('button', { name: 'Nový pisatel' }).click();
  await named(page, 'Rychta Lipnov');
  await choose(page, 'Písmo', 'Grenze Gotisch');
  await page.getByLabel('Hlavička').fill('Rychta městečka Lipnov');
  await page.getByLabel('Podpis').fill('rychtář Ondřej');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
  await expect(page.getByTestId('paper-preview')).toContainText('Rychta městečka Lipnov');

  // The bundled fonts (with their licences) can be exported for Word.
  await page.getByRole('button', { name: 'Uložit písma do složky' }).click();
  await expect
    .poll(() => existsSync(join(saveDir, 'Zazemi pisma', 'licenses', 'caveat.txt')), {
      timeout: 30_000,
    })
    .toBe(true);
  expect(existsSync(join(saveDir, 'Zazemi pisma', 'grenze-gotisch.ttf'))).toBe(true);
});

test('documents are numbered, previewed and exported to PDF and Word in delivery order', async () => {
  const { page } = organizer;
  await go(page, 'Dokumenty');
  await page.getByRole('button', { name: 'Nový dokument' }).click();
  await named(page, 'Výzva k odevzdání obilí');
  await expect(page.getByLabel('Č.')).toHaveValue('1');
  await choose(page, 'Pisatel', 'Rychta Lipnov');
  await choose(page, 'Fáze', '0 Příjezd');
  await page.getByLabel('Komu ho dáme').first().click();
  await page.getByRole('option', { name: 'Hraběnka z Lipnova' }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('document-body').locator('.ProseMirror').click();
  await page.keyboard.type('Všem sedlákům: odevzdejte obilí do soboty.');
  await expect(page.getByTestId('paper-preview')).toContainText('Rychta městečka Lipnov');
  await expect(page.getByTestId('paper-preview')).toContainText('č. 1');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();

  await page.getByText('Zpět na dokumenty').click();
  await page.getByRole('button', { name: 'Nový dokument' }).click();
  await named(page, 'Dopis hraběnce');
  await expect(page.getByLabel('Č.')).toHaveValue('2');
  await choose(page, 'Formát', 'A5');
  await page.getByTestId('document-body').locator('.ProseMirror').click();
  await page.keyboard.type('Milá hraběnko, ve Lipnově se nic neděje.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
  await page.getByText('Zpět na dokumenty').click();
  await expect(page.getByTestId('document-row')).toHaveCount(2);

  const pdf = await exportAs(page, 'PDF', 'Dokumenty.pdf');
  // Phase 0 comes first, the document without a phase last; each on its own size.
  expect(await pdfPages(pdf)).toEqual([A4, A5]);
  expect(pdf.toString('latin1')).toMatch(/\/FontName\s*\/[A-Z]{6}\+GrenzeGotisch/);

  const docx = await exportAs(page, 'Word (.docx)', 'Dokumenty.docx');
  const xml = strFromU8(unzipSync(new Uint8Array(docx))['word/document.xml'] ?? new Uint8Array());
  expect(xml).toContain('Všem sedlákům: odevzdejte obilí do soboty.');
  expect(xml).toContain('Hraběnka z Lipnova');
  expect(xml).toContain('w:ascii="Grenze Gotisch"');
});

test('the print queue marks documents as printed', async () => {
  const { page } = organizer;
  await page.getByRole('button', { name: 'Do tiskové fronty' }).click();
  await go(page, 'Tisková fronta');
  const job = page.getByTestId('print-job');
  await expect(job).toHaveCount(1);
  await job.getByRole('button', { name: 'Vytištěno' }).click();
  await expect(job).toContainText('Vytištěno');
  await go(page, 'Dokumenty');
  await expect(page.getByTestId('document-row').first()).toContainText('Vytištěný');
});

test('a mail-merge form is filled from the roster', async () => {
  const { page } = organizer;
  await go(page, 'Formuláře');
  await page.getByRole('button', { name: 'Nový formulář' }).click();
  await named(page, 'Scitaci listek');
  await page.getByTestId('form-body').locator('.ProseMirror').click();
  await page.keyboard.type('Jméno: {jmeno}, dům č. {dum}');
  await expect(page.getByTestId('paper-preview')).toContainText(
    'Jméno: Hraběnka z Lipnova, dům č. 4',
  );
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  const pdf = await exportAs(page, 'PDF', 'Scitaci listek.pdf');
  expect(await pdfPages(pdf)).toEqual([A4]);
});

test('location signs print as cards, four to an A4 sheet', async () => {
  const { page } = organizer;
  await go(page, 'Cedule');
  for (const place of ['Sklep', 'Kovárna']) {
    await page.getByRole('button', { name: 'Nová cedule' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Název místa').fill(place);
    await dialog.locator('.ProseMirror').click();
    await page.keyboard.type('Odejít jen s klíčem.');
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId('sign')).toHaveCount(2);
  const pdf = await exportAs(page, 'PDF', 'Cedule.pdf');
  expect(await pdfPages(pdf)).toEqual([A4_LANDSCAPE]);
});

test('the archive numbers pages and a supplement continues without renumbering', async () => {
  const { page } = organizer;
  await go(page, 'Archiv');
  await page.getByRole('button', { name: 'Nový archiv' }).click();
  await named(page, 'Archiv obce');

  const addPart = async (source: 'Dokument' | 'Text', value: string) => {
    await page.getByRole('button', { name: 'Přidat část' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(source, { exact: true }).first().click();
    if (source === 'Dokument') {
      await choose(dialog, 'Dokument', value);
    } else {
      await dialog.getByLabel('Název').fill(value);
      await dialog.locator('.ProseMirror').click();
      await page.keyboard.type('Kronika obce od založení.');
    }
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  };
  await addPart('Dokument', 'Výzva k odevzdání obilí');
  await addPart('Text', 'Kronika');
  const parts = page.getByTestId('archive-parts');
  await expect(parts).toContainText('I/1');
  await expect(parts).toContainText('I/2');

  await page.getByRole('button', { name: 'Celý archiv (PDF)' }).click();
  await expect
    .poll(() => existsSync(join(saveDir, 'Archiv obce.pdf')), { timeout: 30_000 })
    .toBe(true);
  // An inventory page, then the two parts.
  expect(await pdfPages(readFileSync(join(saveDir, 'Archiv obce.pdf')))).toEqual([A4, A4, A4]);
  await page.getByRole('button', { name: 'Ano, označit' }).click();
  await expect(parts).toContainText('str. 1');
  await expect(parts).toContainText('str. 2');

  await addPart('Dokument', 'Dopis hraběnce');
  await page.getByRole('button', { name: 'Jen dodatek' }).click();
  const supplement = 'Archiv obce – dodatek.pdf';
  await expect.poll(() => existsSync(join(saveDir, supplement)), { timeout: 30_000 }).toBe(true);
  expect(await pdfPages(readFileSync(join(saveDir, supplement)))).toEqual([A4, A5]);
  await page.getByRole('button', { name: 'Ano, označit' }).click();
  await expect(parts).toContainText('str. 3');
});

test('character diaries print as A5 booklets imposed on A4', async () => {
  const { page } = organizer;
  await go(page, 'Postavy');
  await page.getByRole('tab', { name: 'Deník postavy' }).click();
  await page.getByRole('button', { name: 'Založit návrh deníku' }).click();
  await page.getByRole('button', { name: 'Vytisknout deníky (PDF)' }).click();
  const file = 'Deníky – Pevnost na hranici.pdf';
  await expect.poll(() => existsSync(join(saveDir, file)), { timeout: 30_000 }).toBe(true);
  // Front, 4 lined pages and back = 6 pages, padded to 8: two A4 sheets, both sides.
  expect(await pdfPages(readFileSync(join(saveDir, file)))).toEqual([
    A4_LANDSCAPE,
    A4_LANDSCAPE,
    A4_LANDSCAPE,
    A4_LANDSCAPE,
  ]);
});
