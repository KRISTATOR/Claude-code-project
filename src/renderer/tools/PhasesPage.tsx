import {
  ActionIcon,
  Button,
  Group,
  Paper,
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
import { blockKind, phaseKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { useGameRecords } from '../data/hooks';
import { GameGate, useRun } from './common';

/** Phases (0–VI, each triggered by an announcement) and time blocks (basic, M2). */
export function PhasesPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('phases.title')} · {game.title}
          </Title>
          <Text size="sm" c="dimmed">
            {t('phases.later')}
          </Text>
          <Phases game={game} />
          <Blocks game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Phases({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const phases = (useGameRecords('phase', game.id) ?? []).sort(
    (a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order,
  );

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Title order={4}>{t('phases.phases')}</Title>
        {canEdit && (
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              void run(() =>
                repo.createRecord({
                  kind: 'phase',
                  title: t('phases.newPhase'),
                  game_id: game.id,
                  data: { label: String(phases.length), order: phases.length },
                }),
              )
            }
          >
            {t('phases.newPhase')}
          </Button>
        )}
      </Group>
      {phases.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('phases.empty')}
        </Text>
      ) : (
        <Table data-testid="phases">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>{t('phases.label')}</Table.Th>
              <Table.Th>{t('phases.name')}</Table.Th>
              <Table.Th>{t('phases.trigger')}</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {phases.map((phase) => (
              <PhaseRow key={`${phase.id}:${phase.rev}`} phase={phase} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}

function PhaseRow({ phase }: { phase: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const data = readData(phaseKind, phase);
  const [label, setLabel] = useState(data.label);
  const [title, setTitle] = useState(phase.title);
  const [trigger, setTrigger] = useState(data.trigger);
  const save = () => {
    if (label === data.label && title === phase.title && trigger === data.trigger) return;
    void run(() =>
      repo.updateRecord(phase.id, phase.rev, { title, data: { ...phase.data, label, trigger } }),
    );
  };
  return (
    <Table.Tr>
      <Table.Td>
        <TextInput
          size="xs"
          aria-label={t('phases.label')}
          value={label}
          readOnly={!canEdit}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onBlur={save}
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          size="xs"
          aria-label={t('phases.name')}
          value={title}
          readOnly={!canEdit}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={save}
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          size="xs"
          aria-label={t('phases.trigger')}
          placeholder={t('phases.triggerHint')}
          value={trigger}
          readOnly={!canEdit}
          onChange={(e) => setTrigger(e.currentTarget.value)}
          onBlur={save}
        />
      </Table.Td>
      <Table.Td>
        {canEdit && (
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t('common.delete')}
            onClick={() => void run(() => repo.trashRecord(phase))}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

function Blocks({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const phases = useGameRecords('phase', game.id) ?? [];
  const blocks = (useGameRecords('block', game.id) ?? []).sort((a, b) =>
    readData(blockKind, a).starts_at.localeCompare(readData(blockKind, b).starts_at),
  );

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Title order={4}>{t('phases.blocks')}</Title>
        {canEdit && (
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              void run(() =>
                repo.createRecord({
                  kind: 'block',
                  title: t('phases.newBlock'),
                  game_id: game.id,
                  data: { order: blocks.length },
                }),
              )
            }
          >
            {t('phases.newBlock')}
          </Button>
        )}
      </Group>
      {blocks.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('phases.emptyBlocks')}
        </Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('phases.name')}</Table.Th>
              <Table.Th>{t('phases.phase')}</Table.Th>
              <Table.Th>{t('phases.from')}</Table.Th>
              <Table.Th>{t('phases.to')}</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {blocks.map((block) => (
              <BlockRow key={`${block.id}:${block.rev}`} block={block} phases={phases} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}

function BlockRow({ block, phases }: { block: RecordRow; phases: RecordRow[] }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const data = readData(blockKind, block);
  const [title, setTitle] = useState(block.title);
  const [startsAt, setStartsAt] = useState(data.starts_at);
  const [endsAt, setEndsAt] = useState(data.ends_at);
  const save = (patch: Record<string, unknown> = {}) =>
    void run(() =>
      repo.updateRecord(block.id, block.rev, {
        title,
        data: { ...block.data, starts_at: startsAt, ends_at: endsAt, ...patch },
      }),
    );
  return (
    <Table.Tr>
      <Table.Td>
        <TextInput
          size="xs"
          aria-label={t('phases.name')}
          value={title}
          readOnly={!canEdit}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={() => title !== block.title && save()}
        />
      </Table.Td>
      <Table.Td>
        <Select
          size="xs"
          aria-label={t('phases.phase')}
          data={phases.map((phase) => ({
            value: phase.id,
            label: `${readData(phaseKind, phase).label} ${phase.title}`,
          }))}
          value={data.phase_id}
          onChange={(value) => save({ phase_id: value })}
          clearable
          disabled={!canEdit}
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          size="xs"
          type="datetime-local"
          aria-label={t('phases.from')}
          value={startsAt}
          readOnly={!canEdit}
          onChange={(e) => setStartsAt(e.currentTarget.value)}
          onBlur={() => startsAt !== data.starts_at && save()}
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          size="xs"
          type="datetime-local"
          aria-label={t('phases.to')}
          value={endsAt}
          readOnly={!canEdit}
          onChange={(e) => setEndsAt(e.currentTarget.value)}
          onBlur={() => endsAt !== data.ends_at && save()}
        />
      </Table.Td>
      <Table.Td>
        {canEdit && (
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t('common.delete')}
            onClick={() => void run(() => repo.trashRecord(block))}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
