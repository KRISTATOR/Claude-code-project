import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Client } from '../data/supabase';
import { z } from 'zod';
import { deleteCache } from '../data/cache';
import { useBackend } from './backend';

export interface SessionUser {
  id: string;
  email: string;
}

type SessionState =
  | { state: 'loading' }
  | { state: 'signed-out' }
  /** `offline`: no usable session right now, but we know who used this computer last. */
  | { state: 'online' | 'offline'; user: SessionUser };

interface Session {
  session: SessionState;
  signOut: (options?: { wipe?: boolean }) => Promise<void>;
}

const LAST_USER_KEY = 'zazemi-last-user';
const lastUserSchema = z.object({ id: z.uuid(), email: z.string() });

const SessionContext = createContext<Session | null>(null);

async function readLastUser(): Promise<SessionUser | null> {
  const raw = await window.zazemi.secureStore.get(LAST_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = lastUserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { client } = useBackend();
  const [session, setSession] = useState<SessionState>({ state: 'loading' });

  useEffect(() => {
    const life = { cancelled: false };
    const cancelled = () => life.cancelled;
    const remember = (user: SessionUser) => {
      void window.zazemi.secureStore.set(LAST_USER_KEY, JSON.stringify(user));
      if (!cancelled()) setSession({ state: 'online', user });
    };

    void (async () => {
      const { data } = await client.auth.getSession();
      if (cancelled()) return;
      const user = data.session?.user;
      if (user) {
        remember({ id: user.id, email: user.email ?? '' });
        return;
      }
      // No valid session: if we cannot reach the server, open the last user's
      // cache read-only (the farm has poor signal).
      const last = await readLastUser();
      if (cancelled()) return;
      if (last && !navigator.onLine) setSession({ state: 'offline', user: last });
      else if (last && (await isUnreachable(client))) {
        setSession({ state: 'offline', user: last });
      } else setSession({ state: 'signed-out' });
    })();

    const { data: listener } = client.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        if (!cancelled()) setSession({ state: 'signed-out' });
        return;
      }
      const user = next?.user;
      if (
        user &&
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
      ) {
        remember({ id: user.id, email: user.email ?? '' });
      }
    });
    return () => {
      life.cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const signOut = useCallback(
    async (options: { wipe?: boolean } = {}) => {
      const current =
        session.state === 'online' || session.state === 'offline' ? session.user : null;
      await client.auth.signOut({ scope: 'local' });
      await window.zazemi.secureStore.remove(LAST_USER_KEY);
      if (options.wipe && current) await deleteCache(current.id);
      // The next person to sign in starts on the home page.
      window.location.hash = '#/';
      setSession({ state: 'signed-out' });
    },
    [client, session],
  );

  const value = useMemo(() => ({ session, signOut }), [session, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

async function isUnreachable(client: Client): Promise<boolean> {
  try {
    const { error } = await client.auth.getUser();
    return error !== null && (error.status === 0 || /fetch/i.test(error.message));
  } catch {
    return true;
  }
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}
