import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { connect, launchApp, signIn, signUp, stackEnv, uniqueEmail, type LaunchedApp } from './app';

const stack = stackEnv();
test.skip(!stack, 'needs a Supabase stack (scripts/local-stack or CI)');
test.describe.configure({ mode: 'serial' });

let organizer: LaunchedApp;
let player: LaunchedApp;
const organizerEmail = uniqueEmail('org');
const playerEmail = uniqueEmail('hrac');
let inviteCode = '';

async function navigate(page: Page, label: string) {
  await page.getByRole('navigation').getByText(label, { exact: true }).click();
}

const cdpSessions = new Map<Page, CDPSession>();

/** Cuts the renderer's network (Electron ignores context.setOffline). */
async function setOffline(page: Page, offline: boolean) {
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

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'idle');
}

test.beforeAll(async () => {
  organizer = await launchApp();
  player = await launchApp();
});

test.afterAll(async () => {
  await organizer.close();
  await player.close();
});

test('an organizer creates a team, a world and a game', async () => {
  const { page } = organizer;
  if (!stack) return;
  await connect(page, stack);
  await signUp(page, organizerEmail);
  await page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Kvido Organizátor');
  await page.getByLabel('Název týmu').fill('Testovací spolek');
  await page.getByRole('button', { name: 'Založit tým' }).click();
  await expect(page.getByTestId('team-name')).toHaveText('Testovací spolek');
  await expect(page.getByRole('heading', { name: 'Ahoj, Kvido Organizátor' })).toBeVisible();

  await navigate(page, 'Světy a hry');
  await page.getByRole('button', { name: 'Nový svět' }).click();
  await page.getByLabel('Název').last().fill('Pohraničí');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByLabel('Název').first()).toHaveValue('Pohraničí');

  // New records are organizer-only; make the world public.
  const editor = page.getByTestId('visibility-editor');
  await editor.getByText('Všichni v týmu').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(editor.getByRole('button', { name: 'Uložit viditelnost' })).toBeHidden();

  await page.getByRole('button', { name: 'Nová hra' }).first().click();
  await page.getByRole('dialog').getByLabel('Název').fill('Pevnost na hranici');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await expect(page.getByLabel('Název').first()).toHaveValue('Pevnost na hranici');
  await expect(page.getByTestId('readers-panel')).toContainText('Kvido Organizátor');
});

test('the organizer invites a player', async () => {
  const { page } = organizer;
  await navigate(page, 'Lidé');
  await page.getByRole('tab', { name: 'Pozvánky' }).click();
  await page.getByRole('button', { name: 'Vytvořit pozvánku' }).click();
  const code = page.getByTestId('invite-code');
  await expect(code).toHaveText(/^[A-Z2-9]{5}-[A-Z2-9]{4}$/);
  inviteCode = (await code.textContent()) ?? '';
});

test('the player joins and sees only what is public', async () => {
  const { page } = player;
  if (!stack) return;
  await connect(page, stack);
  await signUp(page, playerEmail);
  await page.getByLabel('Vaše jméno, jak ho uvidí ostatní').fill('Hana Hráčka');
  await page.getByLabel('Kód pozvánky').fill(inviteCode.toLowerCase());
  await page.getByRole('button', { name: 'Připojit se k týmu' }).click();
  await expect(page.getByRole('heading', { name: 'Ahoj, Hana Hráčka' })).toBeVisible();
  await expect(page.getByText('Vaše role v týmu Testovací spolek: Hráč')).toBeVisible();

  // Organizer-only pages are not offered to players.
  await expect(page.getByRole('navigation').getByText('Lidé', { exact: true })).toHaveCount(0);

  await navigate(page, 'Světy a hry');
  await expect(page.getByText('Pohraničí')).toBeVisible();
  await expect(page.getByText('Pevnost na hranici')).toHaveCount(0);
  // Players cannot edit.
  await expect(page.getByRole('button', { name: 'Nový svět' })).toHaveCount(0);
});

test('a game becomes visible to the player once the organizer shares it', async () => {
  await organizer.page.getByRole('navigation').getByText('Světy a hry', { exact: true }).click();
  await organizer.page.getByRole('main').getByText('Pevnost na hranici').click();
  const editor = organizer.page.getByTestId('visibility-editor');
  await editor.getByText('Všichni v týmu').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(organizer.page.getByTestId('readers-panel')).toContainText('Hana Hráčka');

  await syncNow(player.page);
  await expect(player.page.getByRole('main').getByText('Pevnost na hranici')).toBeVisible();
});

test('hiding the game again removes it from the player’s computer', async () => {
  const editor = organizer.page.getByTestId('visibility-editor');
  await editor.getByText('Jen organizátoři').click();
  await editor.getByRole('button', { name: 'Uložit viditelnost' }).click();
  await expect(organizer.page.getByTestId('readers-panel')).not.toContainText('Hana Hráčka');

  await syncNow(player.page);
  await expect(player.page.getByRole('main').getByText('Pevnost na hranici')).toHaveCount(0);
});

test('offline, the app shows cached data read-only', async () => {
  const { page } = organizer;
  await setOffline(page, true);
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByText('Pohraničí').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nový svět' })).toHaveCount(0);
  await setOffline(page, false);
  await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByRole('button', { name: 'Nový svět' })).toBeVisible();
});

test('signing in again on a restarted app restores the session', async () => {
  const dir = player.userDataDir;
  await player.close({ keepData: true });
  player = await launchApp({ userDataDir: dir });
  // The stored (encrypted) session brings the player straight back in.
  await expect(player.page.getByRole('heading', { name: 'Ahoj, Hana Hráčka' })).toBeVisible();
  await player.page.getByRole('navigation').getByText('Nastavení', { exact: true }).click();
  await player.page.getByRole('button', { name: 'Odhlásit se', exact: true }).click();
  await expect(player.page.getByRole('heading', { name: 'Přihlášení do Zázemí' })).toBeVisible();
  await signIn(player.page, playerEmail);
  await expect(player.page.getByRole('heading', { name: 'Ahoj, Hana Hráčka' })).toBeVisible();
});
