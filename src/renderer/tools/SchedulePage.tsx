import {
  Alert,
  Box,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assignLanes,
  bounds,
  findClashes,
  interval,
  minutesLabel,
} from '@core/characters/schedule';
import { npcAppearanceKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam } from '../app/workspace';
import { useGameRecords, usePeople } from '../data/hooks';
import { GameGate } from './common';
import { AppearanceDialog, AppearanceTable } from './NpcsPage';

export function SchedulePage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('schedule.title')} · {game.title}
          </Title>
          <Schedule game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Schedule({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const npcs = useGameRecords('npc', game.id) ?? [];
  const appearances = useGameRecords('npc_appearance', game.id) ?? [];
  const people = usePeople() ?? [];
  const [actor, setActor] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordRow | null>(null);

  const rows = appearances.filter(
    (row) => !actor || readData(npcAppearanceKind, row).actor_person_id === actor,
  );
  const clashCount = findClashes(
    appearances.map((row) => {
      const data = readData(npcAppearanceKind, row);
      return {
        id: row.id,
        actor: data.actor_person_id,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
      };
    }),
  ).size;
  const actorOptions = people
    .filter((person) =>
      appearances.some((row) => readData(npcAppearanceKind, row).actor_person_id === person.id),
    )
    .map((person) => ({ value: person.id, label: person.display_name }));

  return (
    <Stack>
      <Group align="flex-end">
        <Select
          label={t('schedule.filterActor')}
          data={actorOptions}
          value={actor}
          onChange={setActor}
          clearable
          w={240}
        />
        {clashCount > 0 && (
          <Alert color="red" variant="light" p="xs" data-testid="clash-alert">
            <Text size="sm">{t('schedule.clashes', { count: clashCount })}</Text>
          </Alert>
        )}
      </Group>
      <Tabs defaultValue="table" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="table">{t('schedule.table')}</Tabs.Tab>
          <Tabs.Tab value="timeline">{t('schedule.timeline')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="table" pt="md">
          <AppearanceTable
            rows={rows}
            npcs={npcs}
            showNpc
            onEdit={(row) => canEdit && setEditing(row)}
          />
        </Tabs.Panel>
        <Tabs.Panel value="timeline" pt="md">
          <Timeline rows={rows} npcs={npcs} onEdit={(row) => canEdit && setEditing(row)} />
        </Tabs.Panel>
      </Tabs>
      {editing && (
        <AppearanceDialog
          npc={npcs.find((npc) => npc.id === editing.parent_id) ?? editing}
          record={editing}
          defaultActor={null}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

const ROW = 34;
const LABEL = 150;
const PX_PER_MINUTE = 1.2;

/** One row per actor (taller when appearances overlap); clashing bars are red. */
function Timeline({
  rows,
  npcs,
  onEdit,
}: {
  rows: RecordRow[];
  npcs: RecordRow[];
  onEdit: (row: RecordRow) => void;
}) {
  const { t } = useTranslation();
  const people = usePeople() ?? [];
  const items = useMemo(
    () =>
      rows.map((row) => {
        const data = readData(npcAppearanceKind, row);
        return { row, data, range: interval(data) };
      }),
    [rows],
  );
  const slots = items.map(({ row, data }) => ({
    id: row.id,
    actor: data.actor_person_id,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
  }));
  const clashes = findClashes(slots);
  const { lane, lanes } = assignLanes(slots);
  const range = bounds(items.map(({ data }) => data));
  if (!range) {
    return (
      <Text size="sm" c="dimmed">
        {t('schedule.empty')}
      </Text>
    );
  }
  const [start, end] = range;
  const actors = [...new Set(items.map(({ data }) => data.actor_person_id ?? ''))].sort((a, b) =>
    compareCzech(
      people.find((p) => p.id === a)?.display_name ?? '~',
      people.find((p) => p.id === b)?.display_name ?? '~',
    ),
  );
  // Top of each actor's row; the first row holds the hour labels.
  const tops = new Map<string, number>();
  let height = ROW;
  for (const actorId of actors) {
    tops.set(actorId, height);
    height += (lanes.get(actorId) ?? 1) * ROW;
  }
  const width = Math.max(600, (end - start) * PX_PER_MINUTE);
  const hours: number[] = [];
  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += 60) hours.push(minute);

  return (
    <Paper withBorder data-testid="timeline">
      <ScrollArea>
        <Box pos="relative" w={LABEL + width + 20} h={height + 10}>
          {hours.map((minute) => (
            <Box
              key={minute}
              pos="absolute"
              left={LABEL + (minute - start) * PX_PER_MINUTE}
              top={0}
              h="100%"
              style={{ borderLeft: '1px dashed var(--mantine-color-default-border)' }}
            >
              <Text size="10px" c="dimmed" pl={2}>
                {minutesLabel(minute)}
              </Text>
            </Box>
          ))}
          {actors.map((actorId) => (
            <Text
              key={actorId || 'none'}
              pos="absolute"
              left={8}
              top={(tops.get(actorId) ?? 0) + 8}
              size="sm"
              w={LABEL - 12}
              truncate
            >
              {people.find((person) => person.id === actorId)?.display_name ??
                t('schedule.noActor')}
            </Text>
          ))}
          {items.map(({ row, data, range: span }) => {
            if (!span) return null;
            const top = (tops.get(data.actor_person_id ?? '') ?? 0) + (lane.get(row.id) ?? 0) * ROW;
            const clash = clashes.has(row.id);
            return (
              <Tooltip
                key={row.id}
                label={`${npcs.find((npc) => npc.id === row.parent_id)?.title ?? ''}: ${data.situation} (${data.starts_at.slice(11)}–${data.ends_at.slice(11)})${clash ? ` – ${t('schedule.clash')}` : ''}`}
              >
                <Box
                  pos="absolute"
                  left={LABEL + (span[0] - start) * PX_PER_MINUTE}
                  top={top + 4}
                  w={Math.max(6, (span[1] - span[0]) * PX_PER_MINUTE)}
                  h={ROW - 10}
                  bg={clash ? 'red.6' : 'teal.6'}
                  c="white"
                  px={4}
                  style={{
                    borderRadius: 4,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: `${ROW - 10}px`,
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => onEdit(row)}
                  data-testid="timeline-bar"
                  data-clash={clash ? 'yes' : 'no'}
                >
                  {npcs.find((npc) => npc.id === row.parent_id)?.title}
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </ScrollArea>
    </Paper>
  );
}
