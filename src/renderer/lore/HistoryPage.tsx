import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { historyEventKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

/** In-world history ("Dějiny"): dated relative to the game, year 0 is the game itself. */
export function HistoryPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack maw={900}>
          <Title order={2}>{t('history.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('history.intro')}
          </Text>
          <History game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

export function sortHistory(rows: RecordRow[]) {
  return rows
    .map((row) => ({ row, data: readData(historyEventKind, row) }))
    .sort(
      (a, b) =>
        (a.data.year ?? Number.MAX_SAFE_INTEGER) - (b.data.year ?? Number.MAX_SAFE_INTEGER) ||
        a.data.order - b.data.order,
    );
}

function History({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const events = sortHistory(
    (useRecords('history_event') ?? NONE).filter(
      (row) => row.world_id === game.world_id || row.game_id === game.id,
    ),
  );
  const yearLabel = (year: number | null) =>
    year === null
      ? t('history.undated')
      : year === 0
        ? t('history.gameYear')
        : year < 0
          ? t('history.before', { count: -year })
          : t('history.after', { count: year });

  return (
    <Stack>
      {canEdit && (
        <Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('history.newEvent')}
          </Button>
        </Group>
      )}
      {events.length === 0 ? (
        <Text c="dimmed">{t('history.empty')}</Text>
      ) : (
        <Timeline bulletSize={14} lineWidth={2} data-testid="history">
          {events.map(({ row, data }) => (
            <Timeline.Item
              key={row.id}
              title={
                <Group gap="xs" justify="space-between" wrap="nowrap">
                  <Group gap="xs">
                    <Text fw={600}>{row.title}</Text>
                    <Badge size="sm" variant="light" color="gray">
                      {data.when_label || yearLabel(data.year)}
                    </Badge>
                    {data.when_label && data.year !== null && (
                      <Text size="xs" c="dimmed">
                        {yearLabel(data.year)}
                      </Text>
                    )}
                  </Group>
                  {canEdit && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={t('common.edit')}
                      onClick={() => setEditing(row)}
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  )}
                </Group>
              }
            >
              <RichText key={`${row.id}:${row.rev}`} value={data.body} editable={false} />
            </Timeline.Item>
          ))}
        </Timeline>
      )}
      {editing && (
        <EventDialog
          game={game}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function EventDialog({
  game,
  record,
  onClose,
}: {
  game: RecordRow;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo, isOrganizer } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(readData(historyEventKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'history_event',
            title: title.trim(),
            world_id: game.world_id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('history.edit') : t('history.newEvent')}
      size="xl"
    >
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow align="flex-start">
          <NumberInput
            label={t('history.year')}
            description={t('history.yearHint')}
            value={fields.year ?? ''}
            onChange={(value) => set('year', value === '' ? null : Number(value))}
            allowDecimal={false}
          />
          <TextInput
            label={t('history.whenLabel')}
            description={t('history.whenLabelHint')}
            value={fields.when_label}
            onChange={(event) => set('when_label', event.currentTarget.value)}
          />
          <NumberInput
            label={t('history.order')}
            description={t('history.orderHint')}
            value={fields.order}
            onChange={(value) => set('order', Number(value) || 0)}
            allowDecimal={false}
            maw={140}
          />
        </Group>
        <RichText
          value={fields.body}
          onChange={(value) => set('body', value)}
          editable
          {...(record ? { selfId: record.id } : {})}
        />
        {record && isOrganizer && (
          <Paper withBorder p="sm">
            <VisibilityEditor record={record} />
          </Paper>
        )}
        <Group justify="space-between">
          {record ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() => void run(() => repo.trashRecord(record)).then((ok) => ok && onClose())}
            >
              <IconTrash size={16} />
            </ActionIcon>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
