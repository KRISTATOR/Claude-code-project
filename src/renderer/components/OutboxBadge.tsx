import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Popover,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconRefresh, IconTrash } from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@core/format';
import type { RecordRow } from '@core/model';
import { fieldText } from '@core/richtext';
import { useTeam, useWorkspace } from '../app/workspace';
import type { OutboxRow } from '../data/cache';
import { useOutbox } from '../data/hooks';
import { CONFLICT } from '../data/outbox';

/** Writes waiting for a connection, the ones the server refused, and edit conflicts. */
export function OutboxBadge() {
  const { t } = useTranslation();
  const { outbox } = useTeam();
  const { cache } = useWorkspace();
  const rows = useOutbox() ?? [];
  const [comparing, setComparing] = useState<OutboxRow | null>(null);
  const titles = useLiveQuery(async () => {
    const ids = rows.map((row) => row.id);
    const records = await cache.records.bulkGet(ids);
    return new Map(records.flatMap((record) => (record ? [[record.id, record.title]] : [])));
  }, [cache, rows.map((row) => row.id).join(',')]);
  if (rows.length === 0) return null;
  const failed = rows.filter((row) => row.error !== null);
  return (
    <>
      <Popover position="bottom-end" width={360} withArrow>
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
                    {titles?.get(row.id) ? `: ${titles.get(row.id) ?? ''}` : ''}
                  </Text>
                  {row.error && (
                    <Text size="xs" c="red">
                      {row.error === CONFLICT ? t('outbox.conflict') : row.error}
                    </Text>
                  )}
                </Stack>
                {row.error === CONFLICT ? (
                  <Button size="compact-xs" variant="light" onClick={() => setComparing(row)}>
                    {t('outbox.compare')}
                  </Button>
                ) : (
                  row.error && (
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
                  )
                )}
              </Group>
            ))}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {comparing?.server && (
        <ConflictDialog
          entry={comparing}
          server={comparing.server}
          onClose={() => setComparing(null)}
        />
      )}
    </>
  );
}

/** Text of a field for comparison: rich text as plain text, other values as JSON. */
function show(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = fieldText(value);
  if (text || typeof value === 'string') return text;
  const json = JSON.stringify(value);
  return json.length > 300 ? `${json.slice(0, 300)}…` : json;
}

function ConflictDialog({
  entry,
  server,
  onClose,
}: {
  entry: OutboxRow;
  server: RecordRow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { outbox } = useTeam();
  const patch = entry.args['patch'] as Partial<RecordRow>;
  const mine = { ...server, ...patch };
  const rows: { field: string; mine: string; theirs: string }[] = [];
  if (mine.title !== server.title) {
    rows.push({ field: t('outbox.name'), mine: mine.title, theirs: server.title });
  }
  const keys = new Set([...Object.keys(mine.data), ...Object.keys(server.data)]);
  for (const key of keys) {
    const a = show(mine.data[key]);
    const b = show(server.data[key]);
    if (a !== b) rows.push({ field: key, mine: a, theirs: b });
  }
  const act = (action: () => Promise<void>) => void action().then(onClose);
  return (
    <Modal
      opened
      onClose={onClose}
      title={t('outbox.conflictTitle', { title: server.title })}
      size="xl"
    >
      <Stack data-testid="conflict-dialog">
        <Text size="sm" c="dimmed">
          {t('outbox.conflictHint')}
        </Text>
        <ScrollArea.Autosize mah={360}>
          <Table withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('outbox.field')}</Table.Th>
                <Table.Th>{t('outbox.mine')}</Table.Th>
                <Table.Th>{t('outbox.theirs')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.field}>
                  <Table.Td>{row.field}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{row.mine}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{row.theirs}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => act(() => outbox.discard(entry.id))}>
            {t('outbox.keepTheirs')}
          </Button>
          <Button
            variant="light"
            onClick={() =>
              act(() => outbox.keepBoth(entry.id, t('outbox.copyTitle', { title: mine.title })))
            }
          >
            {t('outbox.keepBoth')}
          </Button>
          <Button onClick={() => act(() => outbox.keepMine(entry.id))}>
            {t('outbox.keepMine')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
