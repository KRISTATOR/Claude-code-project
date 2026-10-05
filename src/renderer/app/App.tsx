import { AppShell, Button, Center, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter } from 'react-router';
import type { AppInfo, ConnectionConfig } from '@shared/api';
import { errorMessage } from '../components/errors';
import { notifyError } from '../components/notify';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UpdateBanner } from '../components/UpdateBanner';
import { joinTeam } from '../data/repo';
import { DriveProvider } from '../drive/context';
import { AuthScreen } from './AuthScreen';
import { BackendProvider, useBackend } from './backend';
import { FirstRunScreen } from './FirstRunScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { SessionProvider, useSession } from './session';
import { Shell } from './Shell';
import { TeamProvider, useWorkspace, WorkspaceProvider } from './workspace';

type State =
  { phase: 'loading' } | { phase: 'ready'; info: AppInfo; config: ConnectionConfig | null };

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.zazemi.app.getInfo(), window.zazemi.config.get()]).then(
      ([info, config]) => {
        if (!cancelled) setState({ phase: 'ready', info, config });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (state.phase === 'loading') return <Splash />;
  if (!state.config) {
    return (
      <Bare info={state.info}>
        <FirstRunScreen onConnected={reload} />
      </Bare>
    );
  }
  return (
    <BackendProvider config={state.config} info={state.info} onDisconnected={reload}>
      <SessionProvider>
        <SessionGate />
      </SessionProvider>
    </BackendProvider>
  );
}

function Splash() {
  const { t } = useTranslation();
  return (
    <Center h="100vh">
      <Loader aria-label={t('common.loading')} />
    </Center>
  );
}

/** Minimal frame for screens shown before the main navigation exists. */
function Bare({ info, children }: { info: AppInfo; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs" align="baseline">
            <Title order={3}>{t('app.name')}</Title>
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {t('app.tagline')}
            </Text>
          </Group>
          <Group gap="md">
            <Text size="xs" c="dimmed" data-testid="app-version">
              {t('app.version', { version: info.version })}
            </Text>
            <ThemeSwitch />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <UpdateBanner />
        {children}
      </AppShell.Main>
    </AppShell>
  );
}

function SessionGate() {
  const { session } = useSession();
  const { info } = useBackend();
  if (session.state === 'loading') return <Splash />;
  if (session.state === 'signed-out') {
    return (
      <Bare info={info}>
        <AuthScreen />
      </Bare>
    );
  }
  return (
    <WorkspaceProvider
      key={session.user.id}
      user={session.user}
      offline={session.state === 'offline'}
    >
      <TeamGate />
    </WorkspaceProvider>
  );
}

/** Picks the current team, or shows onboarding when the user has none. */
function TeamGate() {
  const { t } = useTranslation();
  const { info, client } = useBackend();
  const { cache, user, teams, teamId, refresh, setTeamId, engine } = useWorkspace();
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [firstSyncDone, setFirstSyncDone] = useState(false);

  const me = useLiveQuery(
    async () => (teamId ? cache.members.get([teamId, user.id]) : undefined),
    [cache, teamId, user.id],
  );
  const team = teams?.find((item) => item.id === teamId);

  useEffect(() => {
    void refresh().finally(() => setFirstSyncDone(true));
    // Only once per workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invite links: zazemi://pozvanka/CODE
  useEffect(() => {
    void window.zazemi.deepLinks.takePendingInvite().then((code) => code && setPendingInvite(code));
    return window.zazemi.deepLinks.onInvite(setPendingInvite);
  }, []);

  if (teams === undefined || (!firstSyncDone && teams.length === 0)) return <Splash />;
  if (!team || !me) {
    return (
      <Bare info={info}>
        <OnboardingScreen initialCode={pendingInvite} />
      </Bare>
    );
  }
  return (
    <TeamProvider team={team} me={me}>
      <DriveProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </DriveProvider>
      {pendingInvite && (
        <InvitePrompt
          code={pendingInvite}
          onClose={() => setPendingInvite(null)}
          onJoin={() => {
            const code = pendingInvite;
            setPendingInvite(null);
            joinTeam(client, code, user.email.split('@')[0] ?? user.email)
              .then(async (joined) => {
                await engine.sync(joined, { reconcile: true });
                setTeamId(joined);
              })
              .catch((error: unknown) => notifyError(errorMessage(t, error)));
          }}
        />
      )}
    </TeamProvider>
  );
}

/** Shown when an invite link is opened while already in a team. */
function InvitePrompt({
  code,
  onJoin,
  onClose,
}: {
  code: string;
  onJoin: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened onClose={onClose} title={t('invite.title')}>
      <Stack>
        <Text size="sm">{t('invite.body', { code })}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onJoin}>{t('invite.join')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
