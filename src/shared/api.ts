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
}
