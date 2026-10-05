import type { ConnectionConfig } from '@core/connection';

export type { ConnectionConfig };

export interface AppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
  /** True when the Supabase connection was baked in at build time. */
  configFromBuild: boolean;
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
  deepLinks: {
    /** An invite code from a zazemi://pozvanka/… link opened while running. */
    onInvite(listener: (code: string) => void): () => void;
    /** An invite code from the link that started the app, if any (taken once). */
    takePendingInvite(): Promise<string | null>;
  };
}
