import { createClient } from '@supabase/supabase-js';
import type { ConnectionConfig } from '@core/connection';

/** supabase-js keeps the sign-in session here: encrypted by the OS via main. */
const secureStorage = {
  getItem: (key: string) => window.zazemi.secureStore.get(key),
  setItem: (key: string, value: string) => window.zazemi.secureStore.set(key, value),
  removeItem: (key: string) => window.zazemi.secureStore.remove(key),
};

export function createSupabase(config: ConnectionConfig) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      storageKey: 'zazemi-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export type Client = ReturnType<typeof createSupabase>;

export { errorFields } from './call';
