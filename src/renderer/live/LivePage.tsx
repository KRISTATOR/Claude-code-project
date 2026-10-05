import {
  Badge,
  Button,
  Grid,
  Group,
  Menu,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconChevronDown, IconClockHour4, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@core/format';
import { beatKind, npcAppearanceKind, propDocumentKind, readData } from '@core/kinds';
import {
  following,
  liveState,
  nextUp,
  phaseBlocks,
  sortEvents,
  sortPhases,
  type NextItem,
} from '@core/live/live';
import type { EventKind, RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { NONE, useEvents, useGameRecords, useOutbox, usePeople, useRecords } from '../data/hooks';
import { phaseLabel } from '../print/pieces';
import { GameGate, useRun } from '../tools/common';

/** The big-button dashboard for the backstage tent ("Živá hra"). */
export function LivePage() {
  return <GameGate>{(game) => <Live game={game} />}</GameGate>;
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const time = (iso: string | null) => (iso ? formatTime(new Date(iso)) : '');

function Live({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { outbox, canLog } = useTeam();
  const run = useRun();
  const now = useClock();
  const phases = sortPhases(useGameRecords('phase', game.id) ?? NONE);
  const blocks = useGameRecords('block', game.id) ?? NONE;
  const events = useEvents(game.id) ?? [];
  const state = liveState(events, phases, blocks);
  const blocksNow = phaseBlocks(blocks, state.phase);
  const nextPhase = following(phases, state.phase);
  const nextBlock = following(blocksNow, state.block);
  const items = nextUp({
    state,
    documents: useGameRecords('prop_document', game.id) ?? NONE,
    beats: useGameRecords('beat', game.id) ?? NONE,
    appearances: useGameRecords('npc_appearance', game.id) ?? NONE,
  });
  const start = (kind: 'phase' | 'block', record: RecordRow) =>
    void run(() =>
      outbox.appendEvent({
        gameId: game.id,
        kind,
        text: kind === 'phase' ? phaseLabel(record) : record.title,
        recordId: record.id,
      }),
    );

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('live.title')} · {game.title}
        </Title>
        <Group gap={6} c="dimmed">
          <IconClockHour4 size={20} />
          <Text size="xl" fw={700} data-testid="clock">
            {formatTime(now)}
          </Text>
        </Group>
      </Group>
      <Paper withBorder p="md">
        {phases.length === 0 ? (
          <Text c="dimmed">{t('live.noPhases')}</Text>
        ) : (
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              {state.phase ? (
                <>
                  <Text size="sm" c="dimmed">
                    {t('live.phase')} {t('live.since', { time: time(state.phaseSince) })}
                  </Text>
                  <Text fz={32} fw={800} lh={1.1} data-testid="current-phase">
                    {phaseLabel(state.phase)}
                  </Text>
                  <Text size="lg" data-testid="current-block">
                    {state.block
                      ? `${t('live.block')}: ${state.block.title} (${t('live.since', { time: time(state.blockSince) })})`
                      : t('live.noBlock')}
                  </Text>
                </>
              ) : (
                <Text fz={24} fw={700} data-testid="current-phase">
                  {t('live.notStarted')}
                </Text>
              )}
            </Stack>
            {canLog && (
              <Stack gap="xs" align="flex-end">
                {nextPhase && (
                  <Button
                    size="lg"
                    leftSection={<IconPlayerPlay size={20} />}
                    onClick={() => start('phase', nextPhase)}
                  >
                    {state.phase
                      ? t('live.startPhase', { name: phaseLabel(nextPhase) })
                      : t('live.startFirst', { name: phaseLabel(nextPhase) })}
                  </Button>
                )}
                {state.phase && nextBlock && (
                  <Button size="md" variant="light" onClick={() => start('block', nextBlock)}>
                    {t('live.nextBlock', { name: nextBlock.title })}
                  </Button>
                )}
                <Group gap="xs">
                  <JumpMenu
                    label={t('live.jumpPhase')}
                    items={phases}
                    labelOf={phaseLabel}
                    onPick={(record) => start('phase', record)}
                  />
                  {blocksNow.length > 0 && (
                    <JumpMenu
                      label={t('live.jumpBlock')}
                      items={blocksNow}
                      labelOf={(record) => record.title}
                      onPick={(record) => start('block', record)}
                    />
                  )}
                </Group>
              </Stack>
            )}
          </Group>
        )}
      </Paper>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <NextUp game={game} items={items} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Log game={game} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function JumpMenu({
  label,
  items,
  labelOf,
  onPick,
}: {
  label: string;
  items: RecordRow[];
  labelOf: (record: RecordRow) => string;
  onPick: (record: RecordRow) => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="xs" variant="subtle" rightSection={<IconChevronDown size={12} />}>
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((record) => (
          <Menu.Item key={record.id} onClick={() => onPick(record)}>
            {labelOf(record)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function NextUp({ game, items }: { game: RecordRow; items: NextItem[] }) {
  const { t } = useTranslation();
  const { outbox, canLog } = useTeam();
  const run = useRun();
  const characters = useGameRecords('character', game.id) ?? NONE;
  const npcs = useRecords('npc') ?? NONE;
  const people = usePeople() ?? [];
  const details = (item: NextItem): string => {
    if (item.kind === 'document') {
      const data = readData(propDocumentKind, item.record);
      const names = data.character_ids
        .map((id) => characters.find((row) => row.id === id)?.title)
        .filter(Boolean)
        .join(', ');
      return [
        data.number ? t('live.documentNo', { number: data.number }) : '',
        names ? t('live.for', { names }) : data.recipient,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (item.kind === 'beat') {
      const data = readData(beatKind, item.record);
      return [data.at.slice(11, 16), data.location, data.who].filter(Boolean).join(' · ');
    }
    const data = readData(npcAppearanceKind, item.record);
    const npc = npcs.find((row) => row.id === item.record.parent_id)?.title;
    const actor = people.find((person) => person.id === data.actor_person_id)?.display_name;
    return [data.starts_at.slice(11, 16), npc, actor, data.scene].filter(Boolean).join(' · ');
  };
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        {t('live.nextUp')}
      </Title>
      {items.length === 0 ? (
        <Text c="dimmed">{t('live.nothingNext')}</Text>
      ) : (
        <Stack gap="xs" data-testid="next-up">
          {items.map((item) => (
            <Paper key={item.record.id} withBorder p="sm" data-testid="next-item">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2}>
                  <Group gap={6}>
                    <Badge size="sm" variant="light">
                      {t(`live.kinds.${item.kind}`)}
                    </Badge>
                    <Text fw={700}>{item.record.title}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {details(item)}
                  </Text>
                </Stack>
                {canLog && (
                  <Button
                    size="lg"
                    color="teal"
                    onClick={() => void run(() => outbox.markDelivered(item.record))}
                  >
                    {item.kind === 'document' ? t('live.delivered') : t('live.done')}
                  </Button>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

const KIND_COLOR: Record<EventKind, string> = {
  note: 'gray',
  phase: 'grape',
  block: 'violet',
  delivered: 'teal',
  incident: 'red',
};

function Log({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { outbox, canLog } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const events = sortEvents(useEvents(game.id) ?? []).reverse();
  const pending = new Set((useOutbox() ?? []).map((row) => row.id));
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'note' | 'incident'>('note');
  const write = () => {
    if (!text.trim()) return;
    void run(() => outbox.appendEvent({ gameId: game.id, kind, text: text.trim() })).then((ok) => {
      if (ok) {
        setText('');
        setKind('note');
      }
    });
  };
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        {t('live.log')}
      </Title>
      {canLog && (
        <Stack gap="xs" mb="sm">
          <Textarea
            aria-label={t('live.log')}
            placeholder={t('live.logPlaceholder')}
            autosize
            minRows={2}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                write();
              }
            }}
          />
          <Group justify="space-between">
            <SegmentedControl
              size="xs"
              value={kind}
              onChange={(value) => setKind(value === 'incident' ? 'incident' : 'note')}
              data={[
                { value: 'note', label: t('live.eventKinds.note') },
                { value: 'incident', label: t('live.incident') },
              ]}
            />
            <Button onClick={write} disabled={!text.trim()}>
              {t('live.write')}
            </Button>
          </Group>
        </Stack>
      )}
      {events.length === 0 ? (
        <Text c="dimmed">{t('live.emptyLog')}</Text>
      ) : (
        <ScrollArea.Autosize mah={420}>
          <Stack gap={6} data-testid="event-log">
            {events.map((event) => (
              <Group key={event.id} gap="xs" wrap="nowrap" align="flex-start" data-testid="event">
                <Text size="sm" fw={700} w={44} style={{ flexShrink: 0 }}>
                  {time(event.at)}
                </Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={KIND_COLOR[event.kind]}
                  mt={3}
                  style={{ flexShrink: 0 }}
                >
                  {t(`live.eventKinds.${event.kind}`)}
                </Badge>
                <Stack gap={0}>
                  <Text size="sm">{event.text}</Text>
                  <Text size="xs" c="dimmed">
                    {people.find((person) => person.id === event.author_person)?.display_name ?? ''}
                    {pending.has(event.id) ? ` · ${t('live.pending')}` : ''}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
