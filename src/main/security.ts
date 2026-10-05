import { app, shell } from 'electron';
import { APP_ORIGIN } from './protocol';

/**
 * Locks down every web contents: no new windows, no navigation away from the
 * app, no permission prompts, no <webview>. External https links open in the
 * user's browser instead.
 */
export function hardenWebContents(devServerUrl: string | undefined): void {
  const allowedOrigins = new Set([APP_ORIGIN]);
  if (devServerUrl) allowedOrigins.add(safeOrigin(devServerUrl));

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isHttps(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!allowedOrigins.has(safeOrigin(url))) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!allowedOrigins.has(safeOrigin(url))) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  });
}

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Node reports `origin === 'null'` for custom schemes, so build it by hand. */
function safeOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}
