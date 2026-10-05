import { join } from 'node:path';
import { app } from 'electron';

/**
 * Internal folders use ASCII names (CLAUDE.md, Electron conventions). Must run
 * before `app` is ready so Chromium stores its data in the same place.
 */
export function configurePaths(): void {
  const testDir = __ZAZEMI_TEST_BUILD__ ? process.env['ZAZEMI_USER_DATA_DIR'] : undefined;
  app.setPath('userData', testDir ?? join(app.getPath('appData'), 'Zazemi'));
}

/**
 * Electron puts the product name ("Zázemí") into the User-Agent. Header values
 * must be Latin-1, and the non-ASCII name breaks custom protocol requests, so
 * strip the accents.
 */
export function configureUserAgent(): void {
  app.userAgentFallback = app.userAgentFallback
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
}

export function configFilePath(): string {
  return join(app.getPath('userData'), 'config.json');
}
