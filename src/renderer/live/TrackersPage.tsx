import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconMinus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatNumber } from '@core/format';
import { readData, trackerDefinitionKind, trackerSubjects, trackerTypes } from '@core/kinds';
import {
  clampTracker,
  isWarning,
  latestReadings,
  sortEvents,
  trackerValue,
  tracks,
} from '@core/live/live';
import type { RecordRow } from '@core/model';
import { matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useAttachments, useGameRecords, usePeople, useReadings } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

/** Per-character status during the game ("Stav postav"): wounds, blood loss, drunkenness… */
export function TrackersPage() {
  return <GameGate>{(game) => <Trackers game={game} />}</GameGate>;
}

function Trackers({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { isOrganizer } = useTeam();
  const definitions = useGameRecords('tracker_definition', game.id) ?? NONE;
  const [tab, setTab] = useState<string | null>('status');
  return (
    <Stack>
      <Title order={2}>
        {t('trackers.title')} · {game.title}
      </Title>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="status">{t('trackers.tabs.status')}</Tabs.Tab>
          {isOrganizer && <Tabs.Tab value="definitions">{t('trackers.tabs.definitions')}</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="status" pt="md">
          <Status game={game} definitions={definitions} />
        </Tabs.Panel>
        <Tabs.Panel value="definitions" pt="md">
          <Definitions game={game} definitions={definitions} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

/** "2", "1 – veselý", "ano" */
function useValueLabel() {
  const { t } = useTranslation();
  return (definition: RecordRow, value: number) => {
    const data = readData(trackerDefinitionKind, definition);
    if (data.type === 'flag') return value > 0 ? t('trackers.yes') : t('trackers.no');
    const label = data.type === 'level' ? data.levels[value] : undefined;
    return label ? `${formatNumber(value)} – ${label}` : formatNumber(value);
  };
}

function Status({ game, definitions }: { game: RecordRow; definitions: RecordRow[] }) {
  const { t } = useTranslation();
  const { outbox, canLog } = useTeam();
  const run = useRun();
  const characters = useGameRecords('character', game.id) ?? NONE;
  const npcs = useGameRecords('npc', game.id) ?? NONE;
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const readings = useReadings(game.id) ?? [];
  const latest = latestReadings(readings);
  const valueLabel = useValueLabel();
  const [filter, setFilter] = useState('');
  const [history, setHistory] = useState<RecordRow | null>(null);
  const [editing, setEditing] = useState<{ definition: RecordRow; subject: RecordRow } | null>(
    null,
  );
  const playedBy = (subject: RecordRow) =>
    attachments
      .filter((row) => row.record_id === subject.id)
      .map((row) => people.find((person) => person.id === row.person_id)?.display_name)
      .filter(Boolean)
      .join(', ');
  const subjects = [...characters, ...npcs].filter(
    (subject) =>
      definitions.some((definition) => tracks(definition, subject)) &&
      (!filter || matchesQuery(`${subject.title} ${playedBy(subject)}`, filter)),
  );
  const set = (definition: RecordRow, subject: RecordRow, value: number, text = '') =>
    void run(() =>
      outbox.recordReading({
        gameId: game.id,
        definitionId: definition.id,
        subjectId: subject.id,
        value: clampTracker(definition, value),
        text,
      }),
    );

  if (definitions.length === 0) return <Text c="dimmed">{t('trackers.none')}</Text>;
  return (
    <Stack>
      <TextInput
        placeholder={t('trackers.filter')}
        aria-label={t('trackers.filter')}
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
        maw={360}
        data-autofocus
      />
      <ScrollArea>
        <Table withColumnBorders data-testid="tracker-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('trackers.subject')}</Table.Th>
              {definitions.map((definition) => (
                <Table.Th key={definition.id}>{definition.title}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {subjects.map((subject) => (
              <Table.Tr key={subject.id} data-testid="tracker-row" data-name={subject.title}>
                <Table.Td>
                  <UnstyledButton onClick={() => setHistory(subject)}>
                    <Text fw={700} size="sm">
                      {subject.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {playedBy(subject)}
                    </Text>
                  </UnstyledButton>
                </Table.Td>
                {definitions.map((definition) => {
                  if (!tracks(definition, subject)) return <Table.Td key={definition.id} />;
                  const current = trackerValue(latest, definition, subject.id);
                  const warn = isWarning(definition, current.value);
                  return (
                    <Table.Td
                      key={definition.id}
                      {...(warn ? { bg: 'var(--mantine-color-red-light)' } : {})}
                    >
                      <Group gap={4} wrap="nowrap">
                        {canLog && (
                          <ActionIcon
                            variant="light"
                            size="lg"
                            aria-label={`${t('trackers.decrease')}: ${definition.title}, ${subject.title}`}
                            onClick={() => set(definition, subject, current.value - 1)}
                          >
                            <IconMinus size={16} />
                          </ActionIcon>
                        )}
                        <UnstyledButton
                          onClick={() => canLog && setEditing({ definition, subject })}
                          px={4}
                        >
                          <Text
                            fw={700}
                            {...(warn ? { c: 'red' } : {})}
                            data-testid="tracker-value"
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {valueLabel(definition, current.value)}
                          </Text>
                          {current.text && (
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {current.text}
                            </Text>
                          )}
                        </UnstyledButton>
                        {canLog && (
                          <ActionIcon
                            variant="light"
                            size="lg"
                            aria-label={`${t('trackers.increase')}: ${definition.title}, ${subject.title}`}
                            onClick={() => set(definition, subject, current.value + 1)}
                          >
                            <IconPlus size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {editing && (
        <SetValueDialog
          definition={editing.definition}
          subject={editing.subject}
          current={trackerValue(latest, editing.definition, editing.subject.id)}
          onSave={(value, text) => set(editing.definition, editing.subject, value, text)}
          onClose={() => setEditing(null)}
        />
      )}
      <Drawer
        opened={history !== null}
        onClose={() => setHistory(null)}
        position="right"
        title={history ? `${t('trackers.history')}: ${history.title}` : ''}
      >
        <Stack gap={6}>
          {history &&
            (() => {
              const rows = sortEvents(
                readings.filter((reading) => reading.subject_id === history.id),
              ).reverse();
              if (rows.length === 0) return <Text c="dimmed">{t('trackers.noHistory')}</Text>;
              return rows.map((reading) => {
                const definition = definitions.find((row) => row.id === reading.definition_id);
                return (
                  <Paper key={reading.id} withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      {formatDateTime(new Date(reading.at))}
                    </Text>
                    <Text size="sm">
                      <b>{definition?.title ?? '?'}</b>:{' '}
                      {definition && reading.value !== null
                        ? valueLabel(definition, reading.value)
                        : ''}
                      {reading.text ? ` – ${reading.text}` : ''}
                    </Text>
                  </Paper>
                );
              });
            })()}
        </Stack>
      </Drawer>
    </Stack>
  );
}

function SetValueDialog({
  definition,
  subject,
  current,
  onSave,
  onClose,
}: {
  definition: RecordRow;
  subject: RecordRow;
  current: { value: number; text: string };
  onSave: (value: number, text: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const data = readData(trackerDefinitionKind, definition);
  const [value, setValue] = useState(current.value);
  const [text, setText] = useState(current.text);
  return (
    <Modal opened onClose={onClose} title={`${definition.title}: ${subject.title}`}>
      <Stack>
        {data.type === 'level' && data.levels.length > 0 ? (
          <Select
            label={t('trackers.setValue')}
            data={data.levels.map((label, index) => ({ value: String(index), label }))}
            value={String(value)}
            onChange={(next) => next !== null && setValue(Number(next))}
            allowDeselect={false}
          />
        ) : (
          <NumberInput
            label={t('trackers.setValue')}
            value={value}
            decimalSeparator=","
            onChange={(next) => setValue(Number(next) || 0)}
            data-autofocus
          />
        )}
        <Textarea
          label={t('trackers.note')}
          autosize
          minRows={1}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          maxLength={500}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              onSave(value, text);
              onClose();
            }}
          >
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Definitions({ game, definitions }: { game: RecordRow; definitions: RecordRow[] }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  return (
    <Stack>
      {canEdit && (
        <Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('trackers.newDefinition')}
          </Button>
        </Group>
      )}
      {definitions.map((definition) => {
        const data = readData(trackerDefinitionKind, definition);
        return (
          <Paper
            key={definition.id}
            withBorder
            p="sm"
            style={{ cursor: canEdit ? 'pointer' : undefined }}
            onClick={() => canEdit && setEditing(definition)}
          >
            <Group gap="xs">
              <Text fw={700}>{definition.title}</Text>
              <Badge size="xs" variant="light">
                {t(`trackers.types.${data.type}`)}
              </Badge>
              <Badge size="xs" variant="light" color="gray">
                {t('trackers.appliesTo')} {t(`trackers.subjects.${data.applies_to}`)}
              </Badge>
            </Group>
            {data.type === 'level' && (
              <Text size="sm" c="dimmed">
                {data.levels.join(' → ')}
              </Text>
            )}
            {data.description && <Text size="sm">{data.description}</Text>}
          </Paper>
        );
      })}
      {editing && (
        <DefinitionDialog
          game={game}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function DefinitionDialog({
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
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(() =>
    readData(trackerDefinitionKind, record ?? { data: {} }),
  );
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
            kind: 'tracker_definition',
            title: title.trim(),
            game_id: game.id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }
  const number = (value: string | number) => (value === '' ? null : Number(value));
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('trackers.editDefinition') : t('trackers.newDefinition')}
    >
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <Select
            label={t('trackers.type')}
            data={trackerTypes.map((value) => ({ value, label: t(`trackers.types.${value}`) }))}
            value={fields.type}
            onChange={(value) => value && set('type', value)}
            allowDeselect={false}
          />
          <Select
            label={t('trackers.appliesTo')}
            data={trackerSubjects.map((value) => ({
              value,
              label: t(`trackers.subjects.${value}`),
            }))}
            value={fields.applies_to}
            onChange={(value) => value && set('applies_to', value)}
            allowDeselect={false}
          />
        </Group>
        {fields.type === 'level' && (
          <TagsInput
            label={t('trackers.levels')}
            description={t('trackers.levelsHint')}
            value={fields.levels}
            onChange={(value) => set('levels', value)}
          />
        )}
        {fields.type === 'number' && (
          <Group grow align="flex-start">
            <NumberInput
              label={t('trackers.min')}
              value={fields.min}
              onChange={(value) => set('min', Number(value) || 0)}
            />
            <NumberInput
              label={t('trackers.max')}
              description={t('trackers.maxHint')}
              value={fields.max ?? ''}
              onChange={(value) => set('max', number(value))}
            />
          </Group>
        )}
        <Group grow align="flex-start">
          <NumberInput
            label={t('trackers.initial')}
            value={fields.initial}
            onChange={(value) => set('initial', Number(value) || 0)}
          />
          <NumberInput
            label={t('trackers.warnAt')}
            description={t('trackers.warnAtHint')}
            value={fields.warn_at ?? ''}
            onChange={(value) => set('warn_at', number(value))}
          />
        </Group>
        <Textarea
          label={t('trackers.description')}
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
            <Button disabled={!title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
