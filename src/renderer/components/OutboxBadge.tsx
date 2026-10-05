import { ActionIcon, Badge, Group, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { IconRefresh, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@core/format';
import { useTeam } from '../app/workspace';
import { useOutbox } from '../data/hooks';

/** Live-game writes waiting for a connection, and the ones the server refused. */
export function OutboxBadge() {
  const { t } = useTranslation();
  const { outbox } = useTeam();
  const rows = useOutbox() ?? [];
  if (rows.length === 0) return null;
  const failed = rows.filter((row) => row.error !== null);
  return (
    <Popover position="bottom-end" width={340} withArrow>
      <Popover.Target>
        <Tooltip label={t('outbox.waitingHint')}>
          <Badge
            component="button"
            color={failed.length > 0 ? 'red' : 'yellow'}
            variant="light"
            style={{ cursor: 'pointer' }}
            data-testid="outbox-badge"
          >
            {failed.length > 0
              ? t('outbox.failed', { count: failed.length })
              : t('outbox.waiting', { count: rows.length })}
          </Badge>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Text fw={700} size="sm" mb="xs">
          {t('outbox.title')}
        </Text>
        <Stack gap={6}>
          {rows.map((row) => (
            <Group key={row.id} justify="space-between" wrap="nowrap" gap="xs">
              <Stack gap={0}>
                <Text size="sm">
                  {formatTime(new Date(row.created_at))} · {t(`outbox.ops.${row.op}`)}
                </Text>
                {row.error && (
                  <Text size="xs" c="red">
                    {row.error}
                  </Text>
                )}
              </Stack>
              {row.error && (
                <Group gap={2} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('outbox.retry')}
                    onClick={() => void outbox.retry(row.id)}
                  >
                    <IconRefresh size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t('outbox.discard')}
                    onClick={() => void outbox.discard(row.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
