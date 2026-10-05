import { ActionIcon, Badge, Group, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@core/format';
import { useSyncStatus, useWorkspace } from '../app/workspace';

const COLORS = {
  idle: 'teal',
  syncing: 'blue',
  offline: 'gray',
  paused: 'orange',
  error: 'red',
} as const;

export function SyncBadge() {
  const { t } = useTranslation();
  const status = useSyncStatus();
  const { refresh, offline } = useWorkspace();
  const state = offline ? 'offline' : status.state;
  const last = status.lastSyncAt
    ? t('sync.lastSync', { when: formatDateTime(new Date(status.lastSyncAt)) })
    : t('sync.never');
  return (
    <Group gap={4}>
      <Tooltip label={status.message ? `${last} – ${status.message}` : last}>
        <Badge color={COLORS[state]} variant="light" data-testid="sync-state" data-state={state}>
          {t(`sync.${state}`)}
        </Badge>
      </Tooltip>
      <Tooltip label={t('sync.now')}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={t('sync.now')}
          disabled={offline || status.state === 'syncing'}
          onClick={() => void refresh({ reconcile: true })}
        >
          <IconRefresh size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
