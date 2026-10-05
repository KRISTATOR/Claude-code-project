import type { Client } from '../data/supabase';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppInfo, ConnectionConfig } from '@shared/api';
import { createSupabase } from '../data/supabase';

interface Backend {
  client: Client;
  config: ConnectionConfig;
  info: AppInfo;
  /** Forget the server and go back to the first-run screen. */
  disconnect: () => void;
}

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({
  config,
  info,
  onDisconnected,
  children,
}: {
  config: ConnectionConfig;
  info: AppInfo;
  onDisconnected: () => void;
  children: ReactNode;
}) {
  const value = useMemo<Backend>(
    () => ({
      client: createSupabase(config),
      config,
      info,
      disconnect: () => {
        void window.zazemi.config.clear().then(onDisconnected);
      },
    }),
    [config, info, onDisconnected],
  );
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): Backend {
  const value = useContext(BackendContext);
  if (!value) throw new Error('useBackend outside BackendProvider');
  return value;
}
