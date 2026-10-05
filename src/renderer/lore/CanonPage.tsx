import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { canonEntryKind, canonFields, readData, type CanonField } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { compareCzech, matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { NONE, useRecords } from '../data/hooks';
import { GameGate, inScope, useRun } from '../tools/common';

/** The canon registry ("Kánon"): facts that must stay the same everywhere. */
export function CanonPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>{t('canon.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('canon.intro')}
          </Text>
          <Canon game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Canon({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const targets = useLinkTargets();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const entries = (useRecords('canon_entry') ?? NONE)
    .filter((row) => inScope(row, game))
    .map((row) => {
      const data = readData(canonEntryKind, row);
      const subject = data.subject_id
        ? targets.find((target) => target.id === data.subject_id)
        : undefined;
      return { row, data, subject, subjectName: subject?.title ?? data.subject_name };
    })
    .filter(
      ({ data, subjectName }) =>
        !filter || matchesQuery(`${subjectName} ${data.label} ${data.value}`, filter),
    )
    .sort((a, b) => compareCzech(a.subjectName, b.subjectName));
  const fieldLabel = (field: CanonField, label: string) =>
    field === 'other' ? label : t(`canon.fields.${field}`);

  return (
    <Stack>
      <Group justify="space-between">
        <TextInput
          placeholder={t('canon.filter')}
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('canon.newFact')}
          </Button>
        )}
      </Group>
      {entries.length === 0 ? (
        <Text c="dimmed">{t('canon.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="canon-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('canon.subject')}</Table.Th>
              <Table.Th>{t('canon.field')}</Table.Th>
              <Table.Th>{t('canon.value')}</Table.Th>
              <Table.Th>{t('canon.source')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map(({ row, data, subject, subjectName }) => (
              <Table.Tr
                key={row.id}
                style={{ cursor: canEdit ? 'pointer' : undefined }}
                onClick={() => canEdit && setEditing(row)}
              >
                <Table.Td>
                  {subject ? (
                    <Anchor
                      component={Link}
                      to={subject.path}
                      size="sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {subjectName}
                    </Anchor>
                  ) : (
                    subjectName
                  )}
                </Table.Td>
                <Table.Td>{fieldLabel(data.field, data.label)}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {data.value}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {data.source}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <CanonDialog
          game={game}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function CanonDialog({
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
  const targets = useLinkTargets().filter((target) =>
    ['character', 'npc', 'page', 'faction'].includes(target.kind),
  );
  const [fields, setFields] = useState(readData(canonEntryKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const subjectTitle =
    targets.find((target) => target.id === fields.subject_id)?.title ?? fields.subject_name;
  const valid = subjectTitle.trim() !== '' && fields.value.trim() !== '';

  async function save() {
    const what = fields.field === 'other' ? fields.label : t(`canon.fields.${fields.field}`);
    const title = `${subjectTitle} – ${what}`.slice(0, 300);
    const data = { ...fields, subject_name: subjectTitle };
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title, data: { ...record.data, ...data } })
        : repo.createRecord({ kind: 'canon_entry', title, game_id: game.id, data }),
    );
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={record ? t('canon.edit') : t('canon.newFact')}>
      <Stack>
        <Select
          label={t('canon.subject')}
          description={t('canon.subjectHint')}
          data={targets.map((target) => ({ value: target.id, label: target.title }))}
          value={fields.subject_id}
          onChange={(value) => set('subject_id', value)}
          searchable
          clearable
        />
        {!fields.subject_id && (
          <TextInput
            label={t('canon.subjectName')}
            value={fields.subject_name}
            onChange={(event) => set('subject_name', event.currentTarget.value)}
          />
        )}
        <Group grow align="flex-start">
          <Select
            label={t('canon.field')}
            data={canonFields.map((value) => ({ value, label: t(`canon.fields.${value}`) }))}
            value={fields.field}
            onChange={(value) => value && set('field', value)}
            allowDeselect={false}
          />
          {fields.field === 'other' && (
            <TextInput
              label={t('canon.label')}
              value={fields.label}
              onChange={(event) => set('label', event.currentTarget.value)}
            />
          )}
        </Group>
        <TextInput
          label={t('canon.value')}
          value={fields.value}
          onChange={(event) => set('value', event.currentTarget.value)}
        />
        <TextInput
          label={t('canon.source')}
          placeholder={t('canon.sourceHint')}
          value={fields.source}
          onChange={(event) => set('source', event.currentTarget.value)}
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
            <Button disabled={!valid} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
