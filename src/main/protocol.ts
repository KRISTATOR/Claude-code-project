import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { protocol } from 'electron';
import { PRINT_CSP, PRINT_HOST, printPage, setFontsRoot } from './print';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://zazemi`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/** Must be called before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Serves the built renderer from `rendererRoot` over `app://zazemi/…`, adding
 * the CSP header, and pages being printed over `app://print/doc/<token>` with
 * the bundled fonts at `app://print/fonts/…` (from `fontsRoot`). In
 * development the renderer comes from the dev server, so `rendererRoot` is
 * null. Requests that would escape their folder are refused.
 */
export function handleAppScheme(
  rendererRoot: string | null,
  fontsRoot: string,
  getCsp: () => string,
): void {
  setFontsRoot(fontsRoot);
  const fonts = normalize(fontsRoot + sep);
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host === PRINT_HOST) return servePrint(url, fonts);
    if (!rendererRoot) return new Response('Not found', { status: 404 });
    const root = normalize(rendererRoot + sep);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(root, relative));
    if (url.host !== 'zazemi' || !filePath.startsWith(root)) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const body = await readFile(filePath);
      return new Response(body, {
        headers: {
          'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
          'content-security-policy': getCsp(),
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function servePrint(url: URL, fontsRoot: string): Promise<Response> {
  const headers = { 'content-security-policy': PRINT_CSP, 'x-content-type-options': 'nosniff' };
  const doc = /^\/doc\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (doc?.[1]) {
    const html = printPage(doc[1]);
    if (html === undefined) return new Response('Not found', { status: 404 });
    return new Response(html, {
      headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
    });
  }
  const font = /^\/fonts\/([a-z0-9-]+\.ttf)$/.exec(url.pathname);
  if (font?.[1]) {
    const filePath = normalize(join(fontsRoot, font[1]));
    if (!filePath.startsWith(fontsRoot)) return new Response('Not found', { status: 404 });
    try {
      return new Response(await readFile(filePath), {
        headers: { ...headers, 'content-type': 'font/ttf' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
  return new Response('Not found', { status: 404 });
}
