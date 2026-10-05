import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { recordRow, type MemberRole, type MemberRow, type TeamRow } from '@core/model';
import { call } from '../data/call';
import { openCache, type Cache } from '../data/cache';
import { Outbox } from '../data/outbox';
import { Repo } from '../data/repo';
import { SupabaseRemote } from '../data/supabase-remote';
import { SyncEngine, type SyncStatus } from '../data/sync';
import { useBackend } from './backend';
import type { SessionUser } from './session';

interface Workspace {
  user: SessionUser;
  cache: Cache;
  engine: SyncEngine;
  /** Teams I belong to, from the cache. `undefined` while loading. */
  teams: TeamRow[] | undefined;
  teamId: string | null;
  setTeamId: (teamId: string) => void;
  /** Re-sync now (e.g. after creating or joining a team). */
  refresh: (options?: { reconcile?: boolean }) => Promise<void>;
  offline: boolean;
}

const WorkspaceContext = createContext<Workspace | null>(null);

const FALLBACK_POLL_MS = 30_000;
const REALTIME_POLL_MS = 5 * 60_000;

export function WorkspaceProvider({
  user,
  offline,
  children,
}: {
  user: SessionUser;
  offline: boolean;
  children: ReactNode;
}) {
  const { client } = useBackend();
  const cache = useMemo(() => openCache(user.id), [user.id]);
  const engine = useMemo(
    () => new SyncEngine(cache, new SupabaseRemote(client), user.id),
    [cache, client, user.id],
  );
  const [teamId, setTeamIdState] = useState<string | null>(null);

  const teams = useLiveQuery(() => cache.teams.orderBy('id').toArray(), [cache]);
  const myMemberships = useLiveQuery(
    () => cache.members.where('user_id').equals(user.id).toArray(),
    [cache, user.id],
  );

  // Restore the last chosen team, or pick the first one.
  useEffect(() => {
    if (!myMemberships) return;
    void (async () => {
      const ids = myMemberships.map((m) => m.team_id);
      const saved = await cache.getMeta<string>('currentTeam');
      const next = saved && ids.includes(saved) ? saved : (ids[0] ?? null);
      setTeamIdState((current) => (current && ids.includes(current) ? current : next));
    })();
  }, [cache, myMemberships]);

  const setTeamId = (id: string) => {
    setTeamIdState(id);
    void cache.setMeta('currentTeam', id);
  };

  // Sync on start, on team change, on reconnect, on realtime pokes and on a timer.
  useEffect(() => {
    if (offline) return;
    void engine.loadLastSync();
    void engine.sync(teamId, { reconcile: true });

    let realtimeOk = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const poke = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void engine.sync(teamId), 400);
    };
    const channel = teamId
      ? client
          .channel(`team-${teamId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'records', filter: `team_id=eq.${teamId}` },
            poke,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'record_secrets',
              filter: `team_id=eq.${teamId}`,
            },
            poke,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'record_access',
              filter: `team_id=eq.${teamId}`,
            },
            poke,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'record_people',
              filter: `team_id=eq.${teamId}`,
            },
            poke,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'people', filter: `team_id=eq.${teamId}` },
            poke,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` },
            poke,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'registrations',
              filter: `team_id=eq.${teamId}`,
            },
            poke,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'event_log', filter: `team_id=eq.${teamId}` },
            poke,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'tracker_readings',
              filter: `team_id=eq.${teamId}`,
            },
            poke,
          )
          .subscribe((status) => {
            realtimeOk = status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED;
          })
      : null;

    let lastPoll = Date.now();
    const timer = setInterval(() => {
      const interval = realtimeOk ? REALTIME_POLL_MS : FALLBACK_POLL_MS;
      if (Date.now() - lastPoll >= interval) {
        lastPoll = Date.now();
        void engine.sync(teamId);
      }
    }, 5_000);
    const onOnline = () => void engine.sync(teamId, { reconcile: true });
    window.addEventListener('online', onOnline);
    // A sync attempt notices the lost connection and shows "Offline" at once.
    const onOffline = () => void engine.sync(teamId);
    window.addEventListener('offline', onOffline);

    return () => {
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (channel) void client.removeChannel(channel);
    };
  }, [client, engine, teamId, offline]);

  useEffect(() => {
    if (offline) void engine.loadLastSync();
  }, [engine, offline]);

  const value = useMemo<Workspace>(
    () => ({
      user,
      cache,
      engine,
      teams,
      teamId,
      setTeamId,
      refresh: (options) => engine.sync(teamId, options),
      offline,
    }),
    // setTeamId is stable enough (it closes over cache only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, cache, engine, teams, teamId, offline],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace outside WorkspaceProvider');
  return value;
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useWorkspace();
  return useSyncExternalStore(engine.subscribe, engine.getStatus);
}

export interface TeamContextValue {
  team: TeamRow;
  me: MemberRow;
  role: MemberRole;
  repo: Repo;
  /** Live-game writes that also work offline (event log, trackers, "doručeno"). */
  outbox: Outbox;
  /** Organizer and able to reach the server. */
  canEdit: boolean;
  /** Organizer or NPC actor: may log events and readings, online or not. */
  canLog: boolean;
  isOrganizer: boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({
  team,
  me,
  readOnly = false,
  children,
}: {
  team: TeamRow;
  me: MemberRow;
  /** "View as player": nothing can be edited. */
  readOnly?: boolean;
  children: ReactNode;
}) {
  const { client } = useBackend();
  const { cache, offline } = useWorkspace();
  const status = useSyncStatus();
  const { engine, user } = useWorkspace();
  const repo = useMemo(() => new Repo(client, cache, team.id), [client, cache, team.id]);
  const outbox = useMemo(
    () =>
      new Outbox(
        (fn, args) => client.rpc(fn, args),
        async (id) =>
          recordRow.parse(await call(client.from('records').select().eq('id', id).single())),
        cache,
        team.id,
        me.person_id,
        user.id,
        () => {
          void engine.sync(team.id);
        },
      ),
    [client, cache, team.id, me.person_id, user.id, engine],
  );
  // Send what waits in the outbox: now, when the connection returns, and
  // every 15 seconds while anything is queued.
  useEffect(() => {
    if (readOnly) return;
    const flush = () => void outbox.flush();
    flush();
    const timer = setInterval(flush, 15_000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
    };
  }, [outbox, readOnly]);
  const reachable = !offline && status.state !== 'offline' && status.state !== 'paused';
  const value = useMemo<TeamContextValue>(
    () => ({
      team,
      me,
      role: me.role,
      repo,
      outbox,
      isOrganizer: me.role === 'organizer',
      canEdit: me.role === 'organizer' && reachable && !readOnly,
      canLog: (me.role === 'organizer' || me.role === 'npc') && !readOnly,
    }),
    [team, me, repo, outbox, reachable, readOnly],
  );
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamContextValue {
  const value = useContext(TeamContext);
  if (!value) throw new Error('useTeam outside TeamProvider');
  return value;
}
