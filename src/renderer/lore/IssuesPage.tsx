import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
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
import { issueKind, issuePriorities, issueStatuses, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { NONE, useMembers, usePeople, useRecords } from '../data/hooks';
import { GameGate, inScope, useRun } from '../tools/common';

const PRIORITY_COLOR = { low: 'gray', normal: 'blue', high: 'red' } as const;
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

/** Open issues ("Problémy"): questions the organizers still have to settle. */
export function IssuesPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>{t('issues.title')}</Title>
          <Issues game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Issues({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const people = usePeople() ?? [];
  const targets = useLinkTargets();
  const [status, setStatus] = useState<string>('open');
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const issues = (useRecords('issue') ?? NONE)
    .filter((row) => inScope(row, game))
    .map((row) => ({ row, data: readData(issueKind, row) }))
    .filter(({ data }) => status === 'all' || data.status === status)
    .sort((a, b) => PRIORITY_ORDER[a.data.priority] - PRIORITY_ORDER[b.data.priority]);

  return (
    <Stack>
      <Group justify="space-between">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          data={[
            { value: 'open', label: t('issues.statuses.open') },
            { value: 'resolved', label: t('issues.statuses.resolved') },
            { value: 'all', label: t('issues.all') },
          ]}
        />
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('issues.newIssue')}
          </Button>
        )}
      </Group>
      {issues.length === 0 ? (
        <Text c="dimmed">{t('issues.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="issue-table">
          <Table.Tbody>
            {issues.map(({ row, data }) => (
              <Table.Tr
                key={row.id}
                style={{ cursor: canEdit ? 'pointer' : undefined }}
                onClick={() => canEdit && setEditing(row)}
              >
                <Table.Td w={90}>
                  <Badge size="sm" variant="light" color={PRIORITY_COLOR[data.priority]}>
                    {t(`issues.priorities.${data.priority}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="sm"
                    fw={600}
                    td={data.status === 'resolved' ? 'line-through' : undefined}
                  >
                    {row.title}
                  </Text>
                  {data.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {data.description}
                    </Text>
                  )}
                  <Group gap={6}>
                    {data.related_ids.map((id) => {
                      const target = targets.find((item) => item.id === id);
                      return target ? (
                        <Anchor
                          key={id}
                          component={Link}
                          to={target.path}
                          size="xs"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {target.title}
                        </Anchor>
                      ) : null;
                    })}
                  </Group>
                </Table.Td>
                <Table.Td w={180}>
                  <Text size="sm">
                    {people.find((person) => person.id === data.assignee_id)?.display_name ?? ''}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <IssueDialog
          game={game}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function IssueDialog({
  game,
  record,
  onClose,
}: {
  game: RecordRow;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const members = useMembers() ?? [];
  const organizers = people.filter((person) =>
    members.some((member) => member.person_id === person.id && member.role === 'organizer'),
  );
  const targets = useLinkTargets();
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(readData(issueKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({ kind: 'issue', title: title.trim(), game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('issues.edit') : t('issues.newIssue')}
      size="lg"
    >
      <Stack>
        <TextInput
          label={t('issues.question')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Textarea
          label={t('common.description')}
          autosize
          minRows={3}
          value={fields.description}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
        <Group grow>
          <Select
            label={t('issues.priority')}
            data={issuePriorities.map((value) => ({
              value,
              label: t(`issues.priorities.${value}`),
            }))}
            value={fields.priority}
            onChange={(value) => value && set('priority', value)}
            allowDeselect={false}
          />
          <Select
            label={t('issues.status')}
            data={issueStatuses.map((value) => ({ value, label: t(`issues.statuses.${value}`) }))}
            value={fields.status}
            onChange={(value) => value && set('status', value)}
            allowDeselect={false}
          />
          <Select
            label={t('issues.assignee')}
            data={organizers.map((person) => ({ value: person.id, label: person.display_name }))}
            value={fields.assignee_id}
            onChange={(value) => set('assignee_id', value)}
            clearable
          />
        </Group>
        <MultiSelect
          label={t('issues.related')}
          data={targets.map((target) => ({ value: target.id, label: target.title }))}
          value={fields.related_ids}
          onChange={(value) => set('related_ids', value)}
          searchable
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
            <Button disabled={!title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
