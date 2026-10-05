import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { connect, signUp, uniqueEmail, type LaunchedApp, type StackEnv } from './app';

/** Clicks a navigation item, opening its collapsed group first if needed. */
export async function go(page: Page, label: string): Promise<void> {
  const nav = page.getByRole('navigation');
  const item = nav.getByText(label, { exact: true });
  for (const group of ['Příběh', 'Svět hry', 'Tisk', 'Organizace']) {
    if (await item.isVisible()) break;
    const header = nav.getByText(group, { exact: true });
    if (!(await header.isVisible())) continue;
    await header.click();
    // Groups open with an animation; close it again if the item is not inside.
    const found = await item
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (!found) await header.click();
  }
  await item.click();
}

export async function syncNow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'idle');
}

export async function shareWithEveryone(page: Page | Locator): Promise<void> {
  const editor = page.getByTestId('visibility-editor');
  await editor.getByText('Všichni v týmu').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(editor.getByRole('button', { name: 'Uložit viditelnost' })).toBeHidden();
}

/** Picks an option of a Mantine Select (the options list is portalled to the page). */
export async function choose(scope: Page | Locator, label: string, option: string): Promise<void> {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  const page = 'keyboard' in scope ? scope : scope.page();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Answers the small "name" dialog used to create records. */
export async function named(page: Page, name: string): Promise<void> {
  // Only the name dialog: another dialog may open right after it.
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'Vytvořit' }) });
  await dialog.getByLabel('Název').fill(name);
  await dialog.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * An organizer with a team, a shared world "Pohraničí" and a shared game
 * "Pevnost na hranici"; optionally a player who joined with an invite.
 */
export async function setUpTeam(
  stack: StackEnv,
  organizer: LaunchedApp,
  player?: LaunchedApp,
): Promise<void> {
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
  if (!player) return;

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
}

/** Adds a phase named `name` (labelled 0, 1, 2… in order of creation). */
export async function createPhase(page: Page, name: string): Promise<void> {
  await go(page, 'Fáze a bloky');
  const fields = page.getByTestId('phases').getByLabel('Název');
  const before = await fields.count();
  await page.getByRole('button', { name: 'Nová fáze' }).click();
  // Wait for the new row, or the name would go into the previous phase.
  await expect(fields).toHaveCount(before + 1);
  const field = fields.last();
  await field.fill(name);
  await field.press('Tab');
}

/** Creates a character; optionally attaches a player to it. */
export async function createCharacter(page: Page, name: string, player?: string): Promise<void> {
  await go(page, 'Postavy');
  await page.getByRole('button', { name: 'Nová postava' }).click();
  await page.getByRole('dialog').getByLabel('Jméno postavy').fill(name);
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByTestId('character-sheet')).toBeVisible();
  if (player) {
    await choose(page, 'Hráč', player);
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await expect(page.getByText('Uloženo').first()).toBeVisible();
  }
}

const cdpSessions = new Map<Page, CDPSession>();

/** Cuts the renderer's network (Electron ignores context.setOffline). */
export async function setOffline(page: Page, offline: boolean): Promise<void> {
  let cdp = cdpSessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    cdpSessions.set(page, cdp);
  }
  await cdp.send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

/** Creates an invite with the given role and returns its code. */
export async function inviteCode(page: Page, role: 'Organizátor' | 'Hráč'): Promise<string> {
  await go(page, 'Lidé');
  await page.getByRole('tab', { name: 'Pozvánky' }).click();
  await page.getByRole('combobox', { name: 'Role', exact: true }).click();
  await page.getByRole('option', { name: role }).click();
  await page.getByRole('button', { name: 'Vytvořit pozvánku' }).click();
  return (await page.getByTestId('invite-code').textContent()) ?? '';
}

/** Signs a new account up and joins the team with an invite code. */
export async function joinTeam(
  stack: StackEnv,
  app: LaunchedApp,
  name: string,
  code: string,
): Promise<void> {
  await connect(app.page, stack);
  await signUp(app.page, uniqueEmail(name.toLowerCase().split(' ')[0] ?? 'x'));
  await app.page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill(name);
  await app.page.getByLabel('Kód pozvánky').fill(code);
  await app.page.getByRole('button', { name: 'Připojit se k týmu' }).click();
  await expect(app.page.getByRole('heading', { name: `Ahoj, ${name}` })).toBeVisible();
}
