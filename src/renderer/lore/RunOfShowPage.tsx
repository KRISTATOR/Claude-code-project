import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toMinutes } from '@core/characters/schedule';
import {
  beatKind,
  beatTypes,
  blockKind,
  npcAppearanceKind,
  phaseKind,
  readData,
} from '@core/kinds';
import { phaseChecklist, type ChecklistItem } from '@core/lore/checklist';
import type { RecordRow } from '@core/model';
import { recordLink } from '../app/links';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, useTeamRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

const TYPE_COLOR = {
  scene: 'teal',
  announcement: 'grape',
  logistics: 'orange',
  other: 'gray',
} as const;

/** "2027-05-14T18:30" -> "18:30" (the day is clear from the phase). */
const time = (value: string) => (toMinutes(value) === null ? '' : value.slice(11, 16));

/** The run-of-show ("Průběh hry"): phases, their blocks and beats, and a checklist per phase. */
export function RunOfShowPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack maw={1100}>
          <Title order={2}>
            {t('runOfShow.title')} · {game.title}
          </Title>
          <RunOfShow game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function RunOfShow({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const phases = (useGameRecords('phase', game.id) ?? NONE)
    .slice()
    .sort((a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order);
  const [editing, setEditing] = useState<{
    record: RecordRow | null;
    phaseId: string | null;
    blockId: string | null;
  } | null>(null);

  if (phases.length === 0) {
    return (
      <Text c="dimmed">
        {t('runOfShow.noPhases')}{' '}
        <Anchor component={Link} to="/faze">
          {t('nav.phases')}
        </Anchor>
      </Text>
    );
  }
  return (
    <Stack>
      {phases.map((phase) => (
        <PhaseCard
          key={phase.id}
          game={game}
          phase={phase}
          onAdd={(blockId) => canEdit && setEditing({ record: null, phaseId: phase.id, blockId })}
          onEdit={(record) => canEdit && setEditing({ record, phaseId: phase.id, blockId: null })}
        />
      ))}
      {editing && (
        <BeatDialog
          game={game}
          phases={phases}
          record={editing.record}
          phaseId={editing.phaseId}
          blockId={editing.blockId}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function PhaseCard({
  game,
  phase,
  onAdd,
  onEdit,
}: {
  game: RecordRow;
  phase: RecordRow;
  onAdd: (blockId: string | null) => void;
  onEdit: (record: RecordRow) => void;
}) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const data = readData(phaseKind, phase);
  const blocks = (useGameRecords('block', game.id) ?? NONE)
    .filter((row) => readData(blockKind, row).phase_id === phase.id)
    .sort((a, b) => readData(blockKind, a).order - readData(blockKind, b).order);
  const beats = (useGameRecords('beat', game.id) ?? NONE).map((row) => ({
    row,
    data: readData(beatKind, row),
  }));
  const appearances = (useGameRecords('npc_appearance', game.id) ?? NONE).map((row) => ({
    row,
    data: readData(npcAppearanceKind, row),
  }));
  const loose = beats
    .filter(({ data: beat }) => beat.phase_id === phase.id && !beat.block_id)
    .sort((a, b) => a.data.at.localeCompare(b.data.at));

  const beatLine = ({ row, data: beat }: (typeof beats)[number]) => (
    <Group
      key={row.id}
      gap="xs"
      wrap="nowrap"
      align="baseline"
      data-testid="beat"
      style={{ cursor: canEdit ? 'pointer' : undefined, opacity: beat.done ? 0.6 : 1 }}
      onClick={() => onEdit(row)}
    >
      <Text size="sm" ff="monospace" w={48}>
        {time(beat.at)}
      </Text>
      <Badge size="xs" variant="light" color={TYPE_COLOR[beat.type]} w={90}>
        {t(`runOfShow.types.${beat.type}`)}
      </Badge>
      <Stack gap={0}>
        <Text size="sm" fw={600} td={beat.done ? 'line-through' : undefined}>
          {row.title}
        </Text>
        {(beat.location || beat.who) && (
          <Text size="xs" c="dimmed">
            {[beat.location, beat.who].filter(Boolean).join(' · ')}
          </Text>
        )}
      </Stack>
    </Group>
  );

  return (
    <Paper withBorder p="md" data-testid="phase-card" data-phase={phase.title}>
      <Tabs defaultValue="flow" keepMounted={false}>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <Badge size="lg" variant="filled">
              {data.label || '–'}
            </Badge>
            <Title order={4}>{phase.title}</Title>
            {data.trigger && (
              <Text size="sm" c="dimmed">
                {t('runOfShow.trigger')}: {data.trigger}
              </Text>
            )}
          </Group>
          <Tabs.List>
            <Tabs.Tab value="flow">{t('runOfShow.flow')}</Tabs.Tab>
            <Tabs.Tab value="checklist">{t('runOfShow.checklist')}</Tabs.Tab>
          </Tabs.List>
        </Group>
        <Tabs.Panel value="flow">
          <Stack gap="sm">
            {loose.length > 0 && <Stack gap={4}>{loose.map(beatLine)}</Stack>}
            {blocks.map((block) => {
              const blockData = readData(blockKind, block);
              const inBlock = beats
                .filter(({ data: beat }) => beat.block_id === block.id)
                .sort((a, b) => a.data.at.localeCompare(b.data.at));
              const npcs = appearances.filter(({ data: item }) => item.block_id === block.id);
              return (
                <Paper key={block.id} withBorder p="xs" bg="var(--mantine-color-default-hover)">
                  <Group justify="space-between" mb={4}>
                    <Text fw={600} size="sm">
                      {block.title}{' '}
                      <Text span c="dimmed" size="xs">
                        {[time(blockData.starts_at), time(blockData.ends_at)]
                          .filter(Boolean)
                          .join('–')}
                      </Text>
                    </Text>
                    {canEdit && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconPlus size={12} />}
                        onClick={() => onAdd(block.id)}
                      >
                        {t('runOfShow.newBeat')}
                      </Button>
                    )}
                  </Group>
                  <Stack gap={4}>
                    {inBlock.map(beatLine)}
                    {npcs.map(({ row, data: item }) => (
                      <Group key={row.id} gap="xs" wrap="nowrap" align="baseline">
                        <Text size="sm" ff="monospace" w={48}>
                          {time(item.starts_at)}
                        </Text>
                        <Badge size="xs" variant="outline" color="gray" w={90}>
                          {t('kinds.npc_appearance')}
                        </Badge>
                        <Anchor component={Link} to={recordLink(row)} size="sm">
                          {row.title}
                        </Anchor>
                      </Group>
                    ))}
                    {inBlock.length === 0 && npcs.length === 0 && (
                      <Text size="xs" c="dimmed">
                        {t('runOfShow.emptyBlock')}
                      </Text>
                    )}
                  </Stack>
                </Paper>
              );
            })}
            {canEdit && (
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => onAdd(null)}
                >
                  {t('runOfShow.newBeatInPhase')}
                </Button>
              </Group>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="checklist">
          <Checklist game={game} phase={phase} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}

function Checklist({ game, phase }: { game: RecordRow; phase: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const records =
    useTeamRecords(
      (row) =>
        row.game_id === game.id &&
        ['block', 'beat', 'clue', 'quest', 'npc_appearance'].includes(row.kind),
      `checklist:${game.id}`,
    ) ?? NONE;
  const [newTask, setNewTask] = useState('');
  const items = phaseChecklist(phase, records);
  const byId = new Map(records.map((row) => [row.id, row]));
  const done = items.filter((item) => item.done).length;

  function toggle(item: ChecklistItem) {
    if (!canEdit) return;
    if (item.type === 'task') {
      const tasks = readData(phaseKind, phase).tasks.map((task) =>
        task.id === item.task_id ? { ...task, done: !task.done } : task,
      );
      void run(() => repo.updateRecord(phase.id, phase.rev, { data: { ...phase.data, tasks } }));
      return;
    }
    const row = byId.get(item.record_id);
    if (!row) return;
    const patch =
      item.type === 'appearance'
        ? { prep_status: item.done ? 'not_started' : 'done' }
        : item.type === 'beat'
          ? { done: !item.done }
          : item.type === 'clue'
            ? { status: item.done ? 'planned' : 'placed' }
            : { status: item.done ? 'draft' : 'open' };
    void run(() => repo.updateRecord(row.id, row.rev, { data: { ...row.data, ...patch } }));
  }

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    const tasks = [
      ...readData(phaseKind, phase).tasks,
      { id: crypto.randomUUID(), text, done: false },
    ];
    void run(() => repo.updateRecord(phase.id, phase.rev, { data: { ...phase.data, tasks } })).then(
      (ok) => ok && setNewTask(''),
    );
  }

  function removeTask(taskId: string) {
    const tasks = readData(phaseKind, phase).tasks.filter((task) => task.id !== taskId);
    void run(() => repo.updateRecord(phase.id, phase.rev, { data: { ...phase.data, tasks } }));
  }

  const label = (item: ChecklistItem) => {
    switch (item.type) {
      case 'appearance':
        return t('runOfShow.items.appearance', { title: item.title });
      case 'beat':
        return t('runOfShow.items.beat', { title: item.title, time: time(item.at) });
      case 'clue':
        return t('runOfShow.items.clue', { title: item.title, location: item.location || '?' });
      case 'quest':
        return t('runOfShow.items.quest', { title: item.title });
      case 'task':
        return item.title;
    }
  };

  return (
    <Stack gap={6} data-testid="checklist">
      <Text size="sm" c="dimmed">
        {t('runOfShow.progress', { done, total: items.length })}
      </Text>
      {items.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('runOfShow.checklistEmpty')}
        </Text>
      )}
      {items.map((item) => (
        <Group key={item.key} gap="xs" wrap="nowrap" justify="space-between">
          <Checkbox
            checked={item.done}
            onChange={() => toggle(item)}
            disabled={!canEdit}
            label={label(item)}
            data-testid="checklist-item"
          />
          {item.type === 'task' && canEdit && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() => removeTask(item.task_id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
      ))}
      {canEdit && (
        <Group gap="xs">
          <TextInput
            size="xs"
            placeholder={t('runOfShow.newTask')}
            value={newTask}
            onChange={(event) => setNewTask(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && addTask()}
            flex={1}
          />
          <Button size="xs" variant="light" onClick={addTask} disabled={!newTask.trim()}>
            {t('runOfShow.addTask')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function BeatDialog({
  game,
  phases,
  record,
  phaseId,
  blockId,
  onClose,
}: {
  game: RecordRow;
  phases: RecordRow[];
  record: RecordRow | null;
  phaseId: string | null;
  blockId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const blocks = useGameRecords('block', game.id) ?? NONE;
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(
    readData(beatKind, record ?? { data: { phase_id: phaseId, block_id: blockId } }),
  );
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const phaseBlocks = blocks.filter(
    (block) => readData(blockKind, block).phase_id === fields.phase_id,
  );

  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({ kind: 'beat', title: title.trim(), game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('runOfShow.editBeat') : t('runOfShow.newBeat')}
      size="lg"
    >
      <Stack>
        <TextInput
          label={t('runOfShow.beatTitle')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <Select
            label={t('runOfShow.phase')}
            data={phases.map((phase) => ({ value: phase.id, label: phase.title }))}
            value={fields.phase_id}
            onChange={(value) =>
              setFields((current) => ({ ...current, phase_id: value, block_id: null }))
            }
          />
          <Select
            label={t('runOfShow.block')}
            data={phaseBlocks.map((block) => ({ value: block.id, label: block.title }))}
            value={fields.block_id}
            onChange={(value) => set('block_id', value)}
            clearable
          />
        </Group>
        <Group grow>
          <Select
            label={t('runOfShow.type')}
            data={beatTypes.map((value) => ({ value, label: t(`runOfShow.types.${value}`) }))}
            value={fields.type}
            onChange={(value) => value && set('type', value)}
            allowDeselect={false}
          />
          <TextInput
            type="datetime-local"
            label={t('runOfShow.at')}
            value={fields.at}
            onChange={(event) => set('at', event.currentTarget.value)}
          />
        </Group>
        <Group grow>
          <TextInput
            label={t('runOfShow.location')}
            value={fields.location}
            onChange={(event) => set('location', event.currentTarget.value)}
          />
          <TextInput
            label={t('runOfShow.who')}
            value={fields.who}
            onChange={(event) => set('who', event.currentTarget.value)}
          />
        </Group>
        <Textarea
          label={t('common.description')}
          autosize
          minRows={3}
          value={fields.description}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
        <Checkbox
          label={t('runOfShow.done')}
          checked={fields.done}
          onChange={(event) => set('done', event.currentTarget.checked)}
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
