import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  Modal,
  MultiSelect,
  NavLink,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  clueKind,
  clueStatuses,
  hookKind,
  phaseKind,
  plotThreadKind,
  questKind,
  readData,
  readSecret,
  threadStatuses,
} from '@core/kinds';
import { isReachable, threadReach, unreachableThreads } from '@core/lore/plots';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { RichText, useLinkTargets } from '../components/RichText';
import { NONE, useGameRecords, useRecord, useSecret } from '../data/hooks';
import { Field, GameGate, useAskName, useRun } from '../tools/common';

const STATUS_COLOR = { idea: 'gray', active: 'blue', resolved: 'teal', cut: 'red' } as const;

/** Plot threads ("Zápletky") with their clues, quests and personal hooks. */
export function PlotsPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('plots.title')} · {game.title}
          </Title>
          <Plots game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Plots({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const threads = useGameRecords('plot_thread', game.id) ?? NONE;
  const clues = useGameRecords('clue', game.id) ?? NONE;
  const selected = useRecord(id);
  const secret = useSecret(id);
  const all = [...threads, ...clues];
  const reach = threadReach(all);
  const lost = new Set(unreachableThreads(all));

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="sm">
          {canEdit && (
            <Button
              size="xs"
              mb="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                ask(t('plots.newThread'), (name) => {
                  void run(async () => {
                    const row = await repo.createRecord({
                      kind: 'plot_thread',
                      title: name,
                      game_id: game.id,
                    });
                    void navigate(`/zapletky/${row.id}`);
                  });
                })
              }
            >
              {t('plots.newThread')}
            </Button>
          )}
          {lost.size > 0 && (
            <Alert
              color="orange"
              variant="light"
              p="xs"
              mb="xs"
              icon={<IconAlertTriangle size={16} />}
              data-testid="unreachable"
            >
              <Text size="sm">{t('plots.unreachable', { count: lost.size })}</Text>
            </Alert>
          )}
          {threads.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('plots.empty')}
            </Text>
          )}
          {threads.map((row) => {
            const data = readData(plotThreadKind, row);
            const counts = reach.get(row.id) ?? { clues: 0, reachable: 0 };
            return (
              <NavLink
                key={row.id}
                label={row.title}
                description={t('plots.clueCount', { count: counts.reachable, total: counts.clues })}
                active={row.id === id}
                onClick={() => void navigate(`/zapletky/${row.id}`)}
                leftSection={
                  lost.has(row.id) ? (
                    <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                  ) : null
                }
                rightSection={
                  <Badge size="xs" variant="light" color={STATUS_COLOR[data.status]}>
                    {t(`plots.statuses.${data.status}`)}
                  </Badge>
                }
                data-testid="thread"
              />
            );
          })}
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && selected.kind === 'plot_thread' ? (
          <ThreadDetail
            key={`${selected.id}:${selected.rev}:${secret?.rev ?? 0}`}
            game={game}
            record={selected}
            secret={secret}
            clues={clues.filter((clue) =>
              readData(clueKind, clue).thread_ids.includes(selected.id),
            )}
          />
        ) : (
          <Text c="dimmed">{t('plots.selectHint')}</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}

function ThreadDetail({
  game,
  record,
  secret,
  clues,
}: {
  game: RecordRow;
  record: RecordRow;
  secret: RecordSecretRow | undefined;
  clues: RecordRow[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const targets = useLinkTargets();
  const phases = (useGameRecords('phase', game.id) ?? NONE)
    .slice()
    .sort((a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order);
  const quests = (useGameRecords('quest', game.id) ?? NONE).filter(
    (row) => readData(questKind, row).thread_id === record.id,
  );
  const hooks = (useGameRecords('hook', game.id) ?? NONE).filter(
    (row) => readData(hookKind, row).thread_id === record.id,
  );
  const characters = useGameRecords('character', game.id) ?? NONE;
  const data = readData(plotThreadKind, record);
  const resolution = readSecret(plotThreadKind, secret).resolution;
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(data);
  const [secretText, setSecretText] = useState(resolution);
  const [clue, setClue] = useState<RecordRow | 'new' | null>(null);
  const [hook, setHook] = useState<RecordRow | 'new' | null>(null);

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      });
      if (secretText !== resolution) await repo.saveSecret(record.id, { resolution: secretText });
    }, t('common.saved'));
  }
  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);
  const holderName = (id: string | null) => targets.find((target) => target.id === id)?.title ?? '';

  return (
    <Stack>
      <Paper withBorder p="md">
        <Stack>
          <TextInput
            size="lg"
            aria-label={t('common.name')}
            value={title}
            readOnly={!canEdit}
            onChange={(event) => setTitle(event.currentTarget.value)}
            styles={{ input: { fontWeight: 700 } }}
          />
          <Group grow align="flex-start">
            <Select
              label={t('plots.status')}
              data={threadStatuses.map((value) => ({ value, label: t(`plots.statuses.${value}`) }))}
              value={fields.status}
              onChange={(value) =>
                value &&
                setFields((current) => ({
                  ...current,
                  status: value,
                }))
              }
              allowDeselect={false}
              disabled={!canEdit}
            />
            <MultiSelect
              label={t('plots.phases')}
              data={phases.map((phase) => ({ value: phase.id, label: phase.title }))}
              value={fields.phase_ids}
              onChange={(value) => setFields((current) => ({ ...current, phase_ids: value }))}
              disabled={!canEdit}
            />
          </Group>
          <RichText
            value={fields.summary}
            onChange={(value) => setFields((current) => ({ ...current, summary: value }))}
            editable={canEdit}
            selfId={record.id}
          />
          <Field
            label={t('plots.resolution')}
            description={t('plots.resolutionHint')}
            value={secretText}
            onValue={setSecretText}
          />
          {canEdit && (
            <Group justify="space-between">
              <Button onClick={() => void save()}>{t('common.save')}</Button>
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() =>
                  void run(async () => {
                    await repo.trashRecord(record);
                    void navigate('/zapletky');
                  })
                }
              >
                {t('worlds.trash')}
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Title order={5}>{t('plots.clues')}</Title>
          {canEdit && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setClue('new')}
            >
              {t('plots.newClue')}
            </Button>
          )}
        </Group>
        {clues.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('plots.noClues')}
          </Text>
        ) : (
          <Table data-testid="clue-table" highlightOnHover>
            <Table.Tbody>
              {clues.map((row) => {
                const clueData = readData(clueKind, row);
                return (
                  <Table.Tr
                    key={row.id}
                    style={{ cursor: canEdit ? 'pointer' : undefined }}
                    onClick={() => canEdit && setClue(row)}
                  >
                    <Table.Td>
                      <Group gap={6}>
                        {!isReachable(row) && (
                          <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
                        )}
                        <Text size="sm" fw={600}>
                          {row.title}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {[holderName(clueData.holder_id), clueData.location]
                          .filter(Boolean)
                          .join(' · ') || t('plots.nowhere')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {phases.find((phase) => phase.id === clueData.phase_id)?.title ?? ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light">
                        {t(`plots.clueStatuses.${clueData.status}`)}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Title order={5}>{t('plots.hooks')}</Title>
          {canEdit && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setHook('new')}
            >
              {t('hooks.newHook')}
            </Button>
          )}
        </Group>
        {hooks.length === 0 && quests.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('plots.noHooks')}
          </Text>
        ) : (
          <Stack gap={4}>
            {hooks.map((row) => {
              const hookData = readData(hookKind, row);
              const character = characters.find((item) => item.id === row.parent_id);
              return (
                <Group
                  key={row.id}
                  gap="xs"
                  style={{ cursor: canEdit ? 'pointer' : undefined }}
                  onClick={() => canEdit && setHook(row)}
                >
                  <Badge size="xs" variant="outline">
                    {character?.title ?? '?'}
                  </Badge>
                  <Text size="sm" td={hookData.delivered ? 'line-through' : undefined}>
                    {hookData.text || row.title}
                  </Text>
                </Group>
              );
            })}
            {quests.map((row) => (
              <Group key={row.id} gap="xs">
                <Badge size="xs" variant="outline" color="grape">
                  {t('kinds.quest')}
                </Badge>
                <Anchor component={Link} to={`/ukoly?q=${row.id}`} size="sm">
                  {row.title}
                </Anchor>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      {clue && (
        <ClueDialog
          game={game}
          threadId={record.id}
          record={clue === 'new' ? null : clue}
          onClose={() => setClue(null)}
        />
      )}
      {hook && (
        <HookDialog
          game={game}
          record={hook === 'new' ? null : hook}
          threadId={record.id}
          characterId={null}
          onClose={() => setHook(null)}
        />
      )}
    </Stack>
  );
}

function ClueDialog({
  game,
  threadId,
  record,
  onClose,
}: {
  game: RecordRow;
  threadId: string;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const targets = useLinkTargets();
  const holders = [
    ...targets.filter((target) => ['character', 'npc', 'page'].includes(target.kind)),
  ];
  const threads = useGameRecords('plot_thread', game.id) ?? NONE;
  const phases = useGameRecords('phase', game.id) ?? NONE;
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(
    readData(clueKind, record ?? { data: { thread_ids: [threadId] } }),
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
        : repo.createRecord({ kind: 'clue', title: title.trim(), game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('plots.editClue') : t('plots.newClue')}
      size="lg"
    >
      <Stack>
        <TextInput
          label={t('plots.clueTitle')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Textarea
          label={t('common.description')}
          autosize
          minRows={2}
          value={fields.description}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <Select
            label={t('plots.holder')}
            description={t('plots.holderHint')}
            data={holders.map((target) => ({ value: target.id, label: target.title }))}
            value={fields.holder_id}
            onChange={(value) => set('holder_id', value)}
            searchable
            clearable
          />
          <TextInput
            label={t('plots.location')}
            description={t('plots.locationHint')}
            value={fields.location}
            onChange={(event) => set('location', event.currentTarget.value)}
          />
        </Group>
        <Group grow>
          <Select
            label={t('runOfShow.phase')}
            data={phases.map((phase) => ({ value: phase.id, label: phase.title }))}
            value={fields.phase_id}
            onChange={(value) => set('phase_id', value)}
            clearable
          />
          <Select
            label={t('plots.status')}
            data={clueStatuses.map((value) => ({ value, label: t(`plots.clueStatuses.${value}`) }))}
            value={fields.status}
            onChange={(value) => value && set('status', value)}
            allowDeselect={false}
          />
        </Group>
        <MultiSelect
          label={t('plots.threads')}
          data={threads.map((thread) => ({ value: thread.id, label: thread.title }))}
          value={fields.thread_ids}
          onChange={(value) => set('thread_ids', value)}
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

/** A personal hook for one character; "show to the player" makes its player able to read it. */
export function HookDialog({
  game,
  record,
  threadId,
  characterId,
  onClose,
}: {
  game: RecordRow;
  record: RecordRow | null;
  threadId: string | null;
  characterId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const characters = useGameRecords('character', game.id) ?? NONE;
  const threads = useGameRecords('plot_thread', game.id) ?? NONE;
  const [character, setCharacter] = useState<string | null>(record?.parent_id ?? characterId);
  const [shared, setShared] = useState(record?.inherit_audience ?? false);
  const [fields, setFields] = useState(
    readData(hookKind, record ?? { data: { thread_id: threadId } }),
  );
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!character) return;
    const title = fields.text.trim().slice(0, 80) || t('kinds.hook');
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title,
            parent_id: character,
            inherit_audience: shared,
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'hook',
            title,
            game_id: game.id,
            parent_id: character,
            inherit_audience: shared,
            data: fields,
          }),
    );
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={record ? t('hooks.edit') : t('hooks.newHook')}>
      <Stack>
        <Select
          label={t('kinds.character')}
          data={characters.map((row) => ({ value: row.id, label: row.title }))}
          value={character}
          onChange={setCharacter}
          searchable
        />
        <Textarea
          label={t('hooks.text')}
          description={t('hooks.textHint')}
          autosize
          minRows={2}
          value={fields.text}
          onChange={(event) => set('text', event.currentTarget.value)}
          data-autofocus
        />
        <Select
          label={t('kinds.plot_thread')}
          data={threads.map((row) => ({ value: row.id, label: row.title }))}
          value={fields.thread_id}
          onChange={(value) => set('thread_id', value)}
          clearable
        />
        <Switch
          label={t('hooks.shared')}
          description={t('hooks.sharedHint')}
          checked={shared}
          onChange={(event) => setShared(event.currentTarget.checked)}
        />
        <Checkbox
          label={t('hooks.delivered')}
          checked={fields.delivered}
          onChange={(event) => set('delivered', event.currentTarget.checked)}
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
            <Button disabled={!character || !fields.text.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
