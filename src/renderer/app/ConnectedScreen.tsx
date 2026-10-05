import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AppInfo, ConnectionConfig } from '@shared/api';

/** Placeholder until sign-in arrives in Milestone 1a. */
export function ConnectedScreen({
  config,
  info,
  onDisconnected,
}: {
  config: ConnectionConfig;
  info: AppInfo;
  onDisconnected: () => void;
}) {
  const { t } = useTranslation();

  async function disconnect() {
    if (!window.confirm(t('connected.disconnectConfirm'))) return;
    await window.zazemi.config.clear();
    onDisconnected();
  }

  return (
    <Paper withBorder p="xl" maw={560} mx="auto" mt="xl">
      <Stack>
        <Title order={2}>{t('connected.title')}</Title>
        <Text>{t('connected.server', { host: new URL(config.supabaseUrl).host })}</Text>
        <Text c="dimmed">{t('connected.comingSoon')}</Text>
        {!info.configFromBuild && (
          <Button variant="default" onClick={() => void disconnect()} w="fit-content">
            {t('connected.disconnect')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
