import { expect, test } from '@playwright/test';
import { launchApp, stackEnv, type LaunchedApp } from './app';
import { choose, go, named, setUpTeam, shareWithEveryone, syncNow } from './helpers';

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

test('setup: a team with a shared world and game, and a player', async () => {
  if (!stack) return;
  await setUpTeam(stack, organizer, player);
});

test('wiki pages link to each other with [[ and show backlinks', async () => {
  const { page } = organizer;
  await go(page, 'Encyklopedie');
  await page.getByRole('button', { name: 'Do světa' }).click();
  await named(page, 'Lipnov');
  await shareWithEveryone(page);

  await page.getByRole('button', { name: 'Do světa' }).click();
  await named(page, 'Kronika Lipnice');
  const editor = page.getByTestId('page-body').locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Ves založena u [[Lipn');
  await expect(page.getByTestId('link-suggestions')).toContainText('Lipnov');
  await page.keyboard.press('Enter');
  await page.keyboard.type('roku 1352.');
  await expect(editor.locator('[data-wikilink]')).toHaveText('Lipnov');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo')).toBeVisible();

  // The backlink is written by the database trigger and arrives with the next sync.
  await syncNow(page);
  await page.getByTestId('wiki-list').getByText('Lipnov', { exact: true }).click();
  await expect(page.getByTestId('backlinks')).toContainText('Kronika Lipnice');
});

test('a player sees shared pages only, and no backlinks from hidden ones', async () => {
  const { page } = player;
  await syncNow(page);
  await go(page, 'Encyklopedie');
  const list = page.getByTestId('wiki-list');
  await expect(list.getByText('Lipnov', { exact: true })).toBeVisible();
  await expect(list.getByText('Kronika Lipnice')).toHaveCount(0);
  await list.getByText('Lipnov', { exact: true }).click();
  await expect(page.getByTestId('backlinks')).toContainText('Zatím sem nic neodkazuje.');
  // Organizer-only pages are not in the player's navigation.
  await expect(page.getByRole('navigation').getByText('Zápletky')).toHaveCount(0);
});

test('the consistency checker flags confusable names', async () => {
  const { page } = organizer;
  await go(page, 'Kontrola');
  const similar = page.locator('[data-testid="finding"][data-type="similar_names"]');
  await expect(similar).toContainText('Lipnov');
  await expect(similar).toContainText('Lipnice');
});

test('a plot thread without a reachable clue is flagged until a clue is placed', async () => {
  const { page } = organizer;
  await go(page, 'Zápletky');
  await page.getByRole('button', { name: 'Nová zápletka' }).click();
  await named(page, 'Ztracený prsten');
  await expect(page.getByTestId('unreachable')).toBeVisible();

  await page.getByRole('button', { name: 'Nová stopa' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Stopa', { exact: true }).fill('Dopis v truhle');
  await dialog.getByLabel('Kde je').fill('truhla ve mlýně');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('clue-table')).toContainText('Dopis v truhle');
  await expect(page.getByTestId('unreachable')).toHaveCount(0);
});

test('the rulebook keeps versions and shows what changed', async () => {
  const { page } = organizer;
  await go(page, 'Pravidla');
  await page.getByRole('button', { name: 'Nová pravidla' }).click();
  await named(page, 'Pravidla Pevnosti');
  await page.getByRole('button', { name: 'Nová kapitola' }).click();
  await named(page, 'Boj');
  const editor = page.locator('.richtext .ProseMirror').first();
  await editor.click();
  await page.keyboard.type('Boj probíhá na dotek.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo')).toBeVisible();

  await page.getByRole('tab', { name: 'Verze' }).click();
  await page.getByRole('button', { name: 'Vydat verzi' }).click();
  await named(page, 'v1');
  await expect(page.getByTestId('no-changes')).toBeVisible();

  await page.getByRole('tab', { name: 'Pravidla', exact: true }).click();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Zásah do hlavy neplatí.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Verze' }).click();
  await expect(page.getByTestId('diff').locator('ins')).toContainText('Zásah do hlavy neplatí');
});

test('a game can be cloned as a sequel with its plots', async () => {
  const { page } = organizer;
  await go(page, 'Světy a hry');
  await page.getByRole('main').getByText('Pevnost na hranici').click();
  await page.getByRole('button', { name: 'Klonovat jako pokračování' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název nové hry').fill('Pevnost na hranici II');
  await dialog.getByRole('button', { name: 'Vytvořit pokračování' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Název').first()).toHaveValue('Pevnost na hranici II');
  await expect(page.getByTestId('game-switcher')).toHaveValue('Pevnost na hranici II');

  await go(page, 'Zápletky');
  await expect(page.getByTestId('thread')).toHaveText(/Ztracený prsten/);
  await page.getByTestId('thread').click();
  await expect(page.getByTestId('clue-table')).toContainText('Dopis v truhle');

  // The original game still has its own copy.
  await choose(page, 'Hra', 'Pevnost na hranici');
  await go(page, 'Zápletky');
  await expect(page.getByTestId('thread')).toHaveCount(1);
});

test('canon, history, open questions and quests', async () => {
  const { page } = organizer;
  await go(page, 'Kánon');
  for (const age of ['52', '61']) {
    await page.getByRole('button', { name: 'Nový fakt' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Jméno', { exact: true }).fill('Rychtář');
    await choose(dialog, 'Údaj', 'Věk');
    await dialog.getByLabel('Hodnota').fill(age);
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId('canon-table').locator('tbody tr')).toHaveCount(2);
  await go(page, 'Kontrola');
  await expect(
    page.locator('[data-testid="finding"][data-type="canon_contradiction"]'),
  ).toContainText('„52“ a „61“');

  await go(page, 'Dějiny');
  await page.getByRole('button', { name: 'Nová událost' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Založení Lipnova');
  await dialog.getByLabel('Rok vůči hře').fill('-120');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('history')).toContainText('před 120 lety');

  await go(page, 'Otevřené otázky');
  await page.getByRole('button', { name: 'Nová otázka' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Otázka').fill('Kdo hraje rychtáře?');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByTestId('issue-table')).toContainText('Kdo hraje rychtáře?');

  await go(page, 'Úkoly a nástěnka');
  await page.getByRole('button', { name: 'Nový úkol' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Název').fill('Najít kozu');
  await choose(dialog, 'Druh', 'Nabídka práce');
  await dialog.getByLabel('Odměna').fill('3 groše');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByTestId('quest')).toContainText('3 groše');
});

test('the run-of-show lists beats by phase and block, with a checklist', async () => {
  const { page } = organizer;
  await go(page, 'Fáze a bloky');
  await page.getByRole('button', { name: 'Nová fáze' }).click();
  const phaseName = page.getByTestId('phases').getByLabel('Název');
  await phaseName.fill('Příjezd');
  await phaseName.press('Tab');
  await page.getByRole('button', { name: 'Nový blok' }).click();
  await choose(page, 'Fáze', '0 Příjezd');

  await go(page, 'Průběh hry');
  const card = page.locator('[data-testid="phase-card"][data-phase="Příjezd"]');
  await card.getByRole('button', { name: 'Nový bod' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Co se děje').fill('Zvonění na poplach');
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByTestId('beat')).toContainText('Zvonění na poplach');

  await card.getByRole('tab', { name: 'Kontrolní seznam' }).click();
  await card.getByPlaceholder('Další úkol pro tuto fázi…').fill('Koupit svíčky');
  await card.getByRole('button', { name: 'Přidat' }).click();
  const items = card.getByTestId('checklist-item');
  await expect(items).toHaveCount(2);
  await card.getByRole('checkbox', { name: 'Koupit svíčky' }).click();
  await expect(card.getByRole('checkbox', { name: 'Koupit svíčky' })).toBeChecked();
  await expect(card.getByTestId('checklist')).toContainText('Hotovo 1 z 2');
});
