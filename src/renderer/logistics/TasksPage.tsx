import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '@core/format';
import { readData, taskKind, taskStatuses, type TaskStatus } from '@core/kinds';
import { isOverdue, localDay, sortTasks } from '@core/logistics/tasks';
import type { RecordRow } from '@core/model';
import { recordLink } from '../app/links';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, usePeople, useTeamRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

const STATUS_COLOR: Record<TaskStatus, string> = { todo: 'gray', doing: 'blue', done: 'teal' };

/** The organizers' to-do list ("Úkolníček"), per game. */
export function TasksPage() {
  return <GameGate>{(game) => <Tasks game={game} />}</GameGate>;
}

function dueLabel(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  return formatDate(new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1));
}

function Tasks({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit, me } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const tasks = sortTasks(useGameRecords('task', game.id) ?? NONE);
  const related =
    useTeamRecords((row) => row.game_id === game.id && row.kind !== 'task', `rel:${game.id}`) ??
    NONE;
  const [filter, setFilter] = useState('open');
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const today = localDay(new Date());
  const shown = tasks.filter((row) => {
    const data = readData(taskKind, row);
    if (filter === 'open') return data.status !== 'done';
    if (filter === 'mine') return data.assignee_id === me.person_id && data.status !== 'done';
    return true;
  });
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('tasks.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('tasks.newTask')}
          </Button>
        )}
      </Group>
      <SegmentedControl
        w="fit-content"
        value={filter}
        onChange={setFilter}
        data={(['open', 'mine', 'all'] as const).map((value) => ({
          value,
          label: t(`tasks.filter.${value}`),
        }))}
      />
      {shown.length === 0 ? (
        <Text c="dimmed">{t('tasks.empty')}</Text>
      ) : (
        <Table highlightOnHover data-testid="tasks">
          <Table.Tbody>
            {shown.map((row) => {
              const data = readData(taskKind, row);
              const record = related.find((item) => item.id === data.record_id);
              const overdue = isOverdue(row, today);
              return (
                <Table.Tr key={row.id}>
                  <Table.Td w={32}>
                    <Checkbox
                      aria-label={`${t('tasks.statuses.done')}: ${row.title}`}
                      checked={data.status === 'done'}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const status: TaskStatus = event.currentTarget.checked ? 'done' : 'todo';
                        void run(() =>
                          repo.updateRecord(row.id, row.rev, { data: { ...row.data, status } }),
                        );
                      }}
                    />
                  </Table.Td>
                  <Table.Td
                    style={{ cursor: canEdit ? 'pointer' : undefined }}
                    onClick={() => canEdit && setEditing(row)}
                  >
                    <Text
                      size="sm"
                      fw={600}
                      td={data.status === 'done' ? 'line-through' : undefined}
                    >
                      {row.title}
                    </Text>
                    {data.description && (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {data.description}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {people.find((person) => person.id === data.assignee_id)?.display_name ??
                        t('tasks.nobody')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {data.due && (
                      <Text size="sm" {...(overdue ? { c: 'red', fw: 700 } : {})}>
                        {dueLabel(data.due)}
                        {overdue ? ` · ${t('tasks.overdue')}` : ''}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {record && (
                      <Anchor component={Link} to={recordLink(record)} size="sm">
                        {record.title}
                      </Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={STATUS_COLOR[data.status]}>
                      {t(`tasks.statuses.${data.status}`)}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <TaskDialog
          game={game}
          related={related}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function TaskDialog({
  game,
  related,
  record,
  onClose,
}: {
  game: RecordRow;
  related: RecordRow[];
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(() => readData(taskKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function saveTask() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({ kind: 'task', title: title.trim(), game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('tasks.editTask') : t('tasks.newTask')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <Select
            label={t('tasks.assignee')}
            data={people.map((person) => ({ value: person.id, label: person.display_name }))}
            value={fields.assignee_id}
            onChange={(value) => set('assignee_id', value)}
            searchable
            clearable
          />
          <TextInput
            type="date"
            label={t('tasks.due')}
            value={fields.due ?? ''}
            onChange={(event) => set('due', event.currentTarget.value || null)}
          />
        </Group>
        <Select
          label={t('tasks.status')}
          data={taskStatuses.map((value) => ({ value, label: t(`tasks.statuses.${value}`) }))}
          value={fields.status}
          onChange={(value) => value && set('status', value)}
          allowDeselect={false}
        />
        <Select
          label={t('tasks.record')}
          data={related.map((row) => ({
            value: row.id,
            label: `${row.title} (${t(`kinds.${row.kind as 'page'}`, { defaultValue: row.kind })})`,
          }))}
          value={fields.record_id}
          onChange={(value) => set('record_id', value)}
          searchable
          clearable
          limit={50}
        />
        <Textarea
          label={t('tasks.description')}
          autosize
          minRows={2}
          value={fields.description}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
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
            <Button disabled={!title.trim()} onClick={() => void saveTask()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
