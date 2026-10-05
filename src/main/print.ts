import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { PrintRequest } from '../shared/api';

/**
 * Print to PDF (docs/PLAN.md §2.9). The renderer builds the page as HTML; a
 * hidden window with JavaScript disabled loads it from app://print/… (fonts
 * come from the same origin) and Chromium's printToPDF makes the pages. Jobs
 * run one at a time to keep memory low.
 */
const pages = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

export const PRINT_HOST = 'print';

let fonts = '';
/** Where the bundled fonts are (set once at start-up). */
export function setFontsRoot(path: string): void {
  fonts = path;
}
export function fontsRoot(): string {
  return fonts;
}

/** The HTML of a page being printed, for the app:// protocol handler. */
export function printPage(token: string): string | undefined {
  return pages.get(token);
}

/** CSP of print pages: no scripts, nothing from outside the app. */
export const PRINT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src app://print; img-src data: app://print; base-uri 'none'; form-action 'none'";

export function renderPdf(request: PrintRequest): Promise<Uint8Array> {
  const job = queue.then(() => render(request));
  queue = job.catch(() => undefined);
  return job;
}

async function render(request: PrintRequest): Promise<Uint8Array> {
  const token = randomUUID();
  pages.set(token, request.html);
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  try {
    await window.loadURL(`app://${PRINT_HOST}/doc/${token}`);
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: request.pageSize,
      landscape: request.landscape,
      // Margins come from CSS @page.
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return new Uint8Array(pdf);
  } finally {
    pages.delete(token);
    window.destroy();
  }
}
