import { AppShell, Center, Group, Loader, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppInfo, ConnectionConfig } from '@shared/api';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UpdateBanner } from '../components/UpdateBanner';
import { ConnectedScreen } from './ConnectedScreen';
import { FirstRunScreen } from './FirstRunScreen';

type State =
  { phase: 'loading' } | { phase: 'ready'; info: AppInfo; config: ConnectionConfig | null };

export function App() {
  const { t } = useTranslation();
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
            {state.phase === 'ready' && (
              <Text size="xs" c="dimmed" data-testid="app-version">
                {t('app.version', { version: state.info.version })}
              </Text>
            )}
            <ThemeSwitch />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <UpdateBanner />
        {state.phase === 'loading' ? (
          <Center h={200}>
            <Loader aria-label={t('common.loading')} />
          </Center>
        ) : state.config ? (
          <ConnectedScreen config={state.config} info={state.info} onDisconnected={reload} />
        ) : (
          <FirstRunScreen onConnected={reload} />
        )}
      </AppShell.Main>
    </AppShell>
  );
}
