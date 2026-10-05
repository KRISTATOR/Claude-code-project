import type { ConnectionConfig } from '@core/connection';

export type { ConnectionConfig };

export interface AppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
  /** True when the Supabase connection was baked in at build time. */
  configFromBuild: boolean;
  /** Computer name, shown on file locks ("Kvido – NOTEBOOK-KVIDO"). */
  machine: string;
}

export type OpenResult = { ok: true } | { ok: false; error: 'no-app' | 'io'; message: string };

export type FinishResult = { changed: false } | { changed: true; sha: string };

export type OfficeEvent =
  | { type: 'saved'; fileId: string; sessionId: string; sha: string }
  | { type: 'closed'; fileId: string }
  | { type: 'no-lock'; fileId: string };

export interface OfficeSessionInfo {
  fileId: string;
  sessionId: string;
  name: string;
  /** The local copy differs from what was last uploaded. */
  pendingChange: boolean;
  watching: boolean;
  lockPresent: boolean;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'disabled'; reason: 'not-packaged' | 'test-build' }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export type ConfigSetResult = { ok: true } | { ok: false; error: string };

export interface SaveFileRequest {
  defaultName: string;
  filters: { name: string; extensions: string[] }[];
  data: Uint8Array;
}

export type SaveFileResult = { saved: true; path: string } | { saved: false };

export interface PrintRequest {
  html: string;
  pageSize: 'A4' | 'A5' | 'A3';
  landscape: boolean;
}

/** The whole surface the renderer can reach: `window.zazemi`. Keep it narrow. */
export interface ZazemiApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  config: {
    get(): Promise<ConnectionConfig | null>;
    set(config: ConnectionConfig): Promise<ConfigSetResult>;
    clear(): Promise<void>;
  };
  updates: {
    getStatus(): Promise<UpdateStatus>;
    check(): Promise<void>;
    installNow(): Promise<void>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  /** Small values (the sign-in session) encrypted with the OS (DPAPI on Windows). */
  secureStore: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  dialogs: {
    saveFile(request: SaveFileRequest): Promise<SaveFileResult>;
  };
  /** Print to PDF in a hidden, script-less window (docs/PLAN.md §2.9). */
  print: {
    toPdf(request: PrintRequest): Promise<Uint8Array>;
    /** Copies the bundled fonts and their licences into a folder the user picks. */
    exportFonts(): Promise<SaveFileResult>;
  };
  /** Downloaded file versions, stored by their SHA-256 (docs/PLAN.md §2.3). */
  blobs: {
    has(sha: string): Promise<boolean>;
    get(sha: string): Promise<Uint8Array | null>;
    put(sha: string, data: Uint8Array): Promise<void>;
    usage(): Promise<number>;
  };
  /** Open in Word/Excel/PowerPoint with check-out (docs/PLAN.md §2.6). */
  office: {
    openForEdit(request: {
      fileId: string;
      sessionId: string;
      name: string;
      sha: string;
    }): Promise<OpenResult>;
    openReadOnly(request: { fileId: string; name: string; sha: string }): Promise<OpenResult>;
    readWorking(fileId: string): Promise<{ data: Uint8Array; sha: string } | null>;
    markUploaded(fileId: string, sha: string): Promise<void>;
    finish(fileId: string): Promise<FinishResult>;
    discard(fileId: string): Promise<void>;
    sessions(): Promise<OfficeSessionInfo[]>;
    onEvent(listener: (event: OfficeEvent) => void): () => void;
  };
  /** Streaming .zip export for "Záloha". */
  backup: {
    begin(defaultName: string): Promise<string | null>;
    add(token: string, path: string, data: Uint8Array): Promise<void>;
    finish(token: string): Promise<string>;
    abort(token: string): Promise<void>;
  };
  /** Zip archives picked by the user, read entry by entry (imports, restore). */
  archives: {
    open(): Promise<ArchiveListing | null>;
    read(token: string, archive: number, entry: number): Promise<Uint8Array>;
    close(token: string): Promise<void>;
  };
  deepLinks: {
    /** An invite code from a zazemi://pozvanka/… link opened while running. */
    onInvite(listener: (code: string) => void): () => void;
    /** An invite code from the link that started the app, if any (taken once). */
    takePendingInvite(): Promise<string | null>;
  };
}

export interface ArchiveListing {
  token: string;
  archives: { name: string; entries: { path: string; size: number }[] }[];
  /** Set when a picked file is not a zip archive (then nothing is open). */
  error?: 'not_zip';
}
