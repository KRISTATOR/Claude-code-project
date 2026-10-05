import { expect, test, type Locator, type Page } from '@playwright/test';
import { connect, launchApp, signUp, stackEnv, uniqueEmail, type LaunchedApp } from './app';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
let player: LaunchedApp;

async function go(page: Page, label: string) {
  await page.getByRole('navigation').getByText(label, { exact: true }).click();
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'idle');
}

async function shareWithEveryone(page: Page) {
  const editor = page.getByTestId('visibility-editor');
  await editor.getByText('Všichni v týmu').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(editor.getByRole('button', { name: 'Uložit viditelnost' })).toBeHidden();
}

/** Picks an option of a Mantine Select (the options list is portalled to the page). */
async function choose(scope: Page | Locator, label: string, option: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  const page = 'keyboard' in scope ? scope : scope.page();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function createCharacter(page: Page, name: string) {
  await go(page, 'Postavy');
  await page.getByRole('button', { name: 'Nová postava' }).click();
  await page.getByRole('dialog').getByLabel('Jméno postavy').fill(name);
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByTestId('character-sheet')).toBeVisible();
  await expect(page.getByTestId('character-sheet').getByLabel('Jméno postavy')).toHaveValue(name);
}

async function addRelationship(
  page: Page,
  from: string,
  label: string,
  to: string,
  knownBy: 'Obě strany' | 'Jen první postava' | 'Jen druhá postava',
) {
  await page.getByRole('button', { name: 'Nový vztah' }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, 'Postava', from);
  await dialog.getByLabel('Vztah', { exact: true }).fill(label);
  await choose(dialog, 'Ke komu', to);
  await choose(dialog, 'Kdo o vztahu ví', knownBy);
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
}

async function addAppearance(page: Page, npc: string, situation: string, from: string, to: string) {
  await go(page, 'CP');
  await page.getByTestId('npc-list').getByRole('link', { name: npc, exact: true }).click();
  await page.getByRole('button', { name: 'Nový výstup' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Situace').fill(situation);
  await choose(dialog, 'Herec', 'Kvido Organizátor');
  await dialog.getByLabel('Od').fill(from);
  await dialog.getByLabel('Do').fill(to);
  await dialog.getByRole('button', { name: 'Uložit' }).click();
  await expect(dialog).toBeHidden();
}

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
  const { page } = organizer;
  await connect(page, stack);
  await signUp(page, uniqueEmail('kvido'));
  await page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Kvido Organizátor');
  await page.getByLabel('Název týmu').fill('Spolek Lipnov');
  await page.getByRole('button', { name: 'Založit tým' }).click();
  await expect(page.getByTestId('team-name')).toHaveText('Spolek Lipnov');

  await go(page, 'Světy a hry');
  await page.getByRole('button', { name: 'Nový svět' }).click();
  await page.getByLabel('Název').last().fill('Pohraničí');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await shareWithEveryone(page);
  await page.getByRole('button', { name: 'Nová hra' }).first().click();
  await page.getByRole('dialog').getByLabel('Název').fill('Pevnost na hranici');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByLabel('Název').first()).toHaveValue('Pevnost na hranici');
  await shareWithEveryone(page);

  await go(page, 'Lidé');
  await page.getByRole('tab', { name: 'Pozvánky' }).click();
  await page.getByRole('button', { name: 'Vytvořit pozvánku' }).click();
  const code = (await page.getByTestId('invite-code').textContent()) ?? '';

  await connect(player.page, stack);
  await signUp(player.page, uniqueEmail('hana'));
  await player.page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Hana Hráčka');
  await player.page.getByLabel('Kód pozvánky').fill(code);
  await player.page.getByRole('button', { name: 'Připojit se k týmu' }).click();
  await expect(player.page.getByRole('heading', { name: 'Ahoj, Hana Hráčka' })).toBeVisible();
  await syncNow(page);
});

test('the organizer writes a character sheet with player and organizer-only parts', async () => {
  const { page } = organizer;
  await createCharacter(page, 'Kovář Ondřej');
  await createCharacter(page, 'Hraběnka z Lipnova');
  await expect(page.getByText('Neherní materiál – nesdílet')).toBeVisible();
  await choose(page, 'Hráč', 'Hana Hráčka');
  await page.getByLabel('Funkce', { exact: true }).fill('správkyně panství');
  await page.getByRole('textbox', { name: 'Minulost' }).fill('Vyrostla na tvrzi u Lipnice.');
  await page
    .getByRole('textbox', { name: 'Poznámky organizátorů' })
    .fill('Ve fázi II zjistí, že kovář je její bratr.');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByText('Uloženo').first()).toBeVisible();

  await go(page, 'Postavy');
  const roster = page.getByTestId('roster');
  await expect(roster.getByTestId('roster-row')).toHaveCount(2);
  await expect(
    roster.locator('[data-testid="roster-row"][data-name="Hraběnka z Lipnova"]'),
  ).toContainText('Hana Hráčka');
});

test('relationships can be one-sided', async () => {
  const { page } = organizer;
  await go(page, 'Vztahy');
  await addRelationship(
    page,
    'Hraběnka z Lipnova',
    'tajně miluje',
    'Kovář Ondřej',
    'Jen první postava',
  );
  await addRelationship(page, 'Kovář Ondřej', 'dluží jí', 'Hraběnka z Lipnova', 'Obě strany');
  await addRelationship(
    page,
    'Kovář Ondřej',
    'sleduje ji',
    'Hraběnka z Lipnova',
    'Jen první postava',
  );
  await page.getByRole('tab', { name: 'Seznam' }).click();
  await expect(page.getByTestId('relationship-list').locator('tr')).toHaveCount(3);
});

test('the player sees only their own character, without organizer notes or hidden ties', async () => {
  const { page } = player;
  await syncNow(page);
  await go(page, 'Postavy');
  const roster = page.getByTestId('roster');
  await expect(roster.getByTestId('roster-row')).toHaveCount(1);
  await roster.getByRole('link', { name: 'Hraběnka z Lipnova' }).click();

  const sheet = page.getByTestId('character-sheet');
  await expect(sheet.getByRole('textbox', { name: 'Minulost' })).toHaveValue(
    'Vyrostla na tvrzi u Lipnice.',
  );
  await expect(sheet.getByText('Poznámky organizátorů')).toHaveCount(0);
  await expect(sheet.getByText('kovář je její bratr')).toHaveCount(0);
  const ties = sheet.getByTestId('sheet-relationship');
  await expect(ties).toHaveCount(2);
  await expect(ties.filter({ hasText: 'tajně miluje' })).toContainText('Kovář Ondřej');
  await expect(ties.filter({ hasText: 'dluží jí' })).toBeVisible();
  await expect(sheet.getByText('sleduje ji')).toHaveCount(0);
  // Players cannot edit.
  await expect(page.getByRole('button', { name: 'Uložit', exact: true })).toHaveCount(0);
});

test('NPCs are created in bulk and schedule clashes are flagged', async () => {
  const { page } = organizer;
  await go(page, 'CP');
  await page.getByRole('button', { name: 'Hromadně' }).click();
  await page.getByTestId('bulk-input').fill('Voják {1-3}; vojín\nRychtář; starosta');
  await page.getByRole('button', { name: 'Vytvořit 4' }).click();
  await expect(page.getByTestId('npc-row')).toHaveCount(4);

  await addAppearance(page, 'Voják 1', 'Hlídka u brány', '2027-05-14T18:00', '2027-05-14T19:00');
  await addAppearance(page, 'Voják 2', 'Výběr daní', '2027-05-14T18:30', '2027-05-14T19:30');
  await addAppearance(page, 'Rychtář', 'Provolání', '2027-05-14T20:00', '2027-05-14T20:30');

  await go(page, 'Harmonogram CP');
  await expect(page.getByTestId('clash-alert')).toContainText('Kolizí: 2');
  const rows = page.getByTestId('appearance-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.and(page.locator('[data-clash="yes"]'))).toHaveCount(2);
});

test('the organizer can view the app as the character’s player', async () => {
  const { page } = organizer;
  await go(page, 'Postavy');
  await page.getByTestId('roster').getByRole('link', { name: 'Hraběnka z Lipnova' }).click();
  await page.getByRole('button', { name: 'Zobrazit jako hráč této postavy' }).click();
  await expect(page.getByText(/Zobrazujete Zázemí tak, jak ho vidí Hana Hráčka/)).toBeVisible();

  const sheet = page.getByTestId('character-sheet');
  await expect(sheet.getByText('kovář je její bratr')).toHaveCount(0);
  await expect(sheet.getByText('sleduje ji')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Uložit', exact: true })).toHaveCount(0);
  await go(page, 'Postavy');
  await expect(page.getByTestId('roster-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ukončit náhled' }).click();
  await expect(page.getByTestId('roster-row')).toHaveCount(2);
});
