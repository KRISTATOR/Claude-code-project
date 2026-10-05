import {
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash, IconUsersPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { parseBulkNpcs } from '@core/characters/bulk';
import { findClashes } from '@core/characters/schedule';
import {
  blockKind,
  npcAppearanceKind,
  npcKind,
  prepStatuses,
  readData,
  readSecret,
} from '@core/kinds';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { useAttachments, useGameRecords, usePeople, useRecord, useSecret } from '../data/hooks';
import { Field, GameGate, useRun } from './common';

export function NpcsPage() {
  const { id } = useParams();
  return (
    <GameGate>{(game) => (id ? <NpcDetailRoute id={id} /> : <NpcList game={game} />)}</GameGate>
  );
}

function NpcList({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const npcs = useGameRecords('npc', game.id) ?? [];
  const appearances = useGameRecords('npc_appearance', game.id) ?? [];
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const [bulkOpen, setBulkOpen] = useState(false);

  const actorsOf = (id: string) =>
    attachments
      .filter((row) => row.record_id === id && row.relation === 'actor')
      .map((row) => people.find((person) => person.id === row.person_id)?.display_name ?? '?')
      .join(', ');

  function create() {
    let name = '';
    modals.openConfirmModal({
      title: t('npcs.newNpc'),
      children: (
        <TextInput
          data-autofocus
          label={t('npcs.name')}
          onChange={(event) => {
            name = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.create'), cancel: t('common.cancel') },
      onConfirm: () => {
        if (!name.trim()) return;
        void run(async () => {
          const row = await repo.createRecord({
            kind: 'npc',
            title: name.trim(),
            game_id: game.id,
          });
          void navigate(`/cp/${row.id}`);
        });
      },
    });
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('npcs.title')} · {game.title}
        </Title>
        {canEdit && (
          <Group>
            <Button
              variant="light"
              leftSection={<IconUsersPlus size={14} />}
              onClick={() => setBulkOpen(true)}
            >
              {t('npcs.bulk')}
            </Button>
            <Button leftSection={<IconPlus size={14} />} onClick={create}>
              {t('npcs.newNpc')}
            </Button>
          </Group>
        )}
      </Group>
      {npcs.length === 0 ? (
        <Text c="dimmed">{t('npcs.empty')}</Text>
      ) : (
        <Table striped highlightOnHover verticalSpacing={4} data-testid="npc-list">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('npcs.name')}</Table.Th>
              <Table.Th>{t('npcs.rank')}</Table.Th>
              <Table.Th>{t('npcs.actors')}</Table.Th>
              <Table.Th>{t('npcs.appearances')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {npcs.map((npc) => (
              <Table.Tr key={npc.id} data-testid="npc-row">
                <Table.Td>
                  <Anchor component={Link} to={`/cp/${npc.id}`} size="sm">
                    {npc.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{readData(npcKind, npc).rank}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{actorsOf(npc.id)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {appearances.filter((row) => row.parent_id === npc.id).length}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {bulkOpen && <BulkDialog game={game} onClose={() => setBulkOpen(false)} />}
    </Stack>
  );
}

function BulkDialog({ game, onClose }: { game: RecordRow; onClose: () => void }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parseBulkNpcs(text);

  async function create() {
    setBusy(true);
    const ok = await run(async () => {
      for (const npc of parsed)
        await repo.createRecord({
          kind: 'npc',
          title: npc.name,
          game_id: game.id,
          data: { rank: npc.rank },
        });
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={t('npcs.bulk')} size="lg">
      <Stack>
        <Textarea
          data-autofocus
          label={t('npcs.bulkHint')}
          autosize
          minRows={8}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder={'Kapitán Horák; kapitán\nVoják {1-10}; vojín'}
          data-testid="bulk-input"
        />
        <Text size="xs" c="dimmed" lineClamp={3}>
          {parsed.map((npc) => npc.name + (npc.rank ? ` (${npc.rank})` : '')).join(', ')}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={parsed.length === 0} loading={busy} onClick={() => void create()}>
            {t('npcs.bulkCreate', { count: parsed.length })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function NpcDetailRoute({ id }: { id: string }) {
  const record = useRecord(id);
  const secret = useSecret(id);
  if (!record || record.kind !== 'npc') return null;
  return (
    <NpcDetail
      key={`${record.id}:${record.rev}:${secret?.rev ?? 0}`}
      record={record}
      secret={secret}
    />
  );
}

function NpcDetail({ record, secret }: { record: RecordRow; secret: RecordSecretRow | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const appearances = (useGameRecords('npc_appearance', record.game_id) ?? []).filter(
    (row) => row.parent_id === record.id,
  );
  const data = readData(npcKind, record);
  const notes = readSecret(npcKind, secret).notes;
  const actorIds = attachments
    .filter((row) => row.record_id === record.id && row.relation === 'actor')
    .map((row) => row.person_id);
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(data);
  const [secretNotes, setSecretNotes] = useState(notes);
  const [actors, setActors] = useState(actorIds);
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const set = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      });
      if (secretNotes !== notes) await repo.saveSecret(record.id, { notes: secretNotes });
      if (JSON.stringify([...actors].sort()) !== JSON.stringify([...actorIds].sort()))
        await repo.setAttached(record.id, 'actor', actors);
    }, t('common.saved'));
  }

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Stack>
          <Paper withBorder p="md">
            <Stack>
              <Group grow>
                <TextInput
                  label={t('npcs.name')}
                  value={title}
                  readOnly={!canEdit}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
                <TextInput
                  label={t('npcs.rank')}
                  value={fields.rank}
                  readOnly={!canEdit}
                  onChange={(event) => set('rank', event.currentTarget.value)}
                />
              </Group>
              {isOrganizer && (
                <MultiSelect
                  label={t('npcs.actors')}
                  data={people.map((person) => ({ value: person.id, label: person.display_name }))}
                  value={actors}
                  onChange={setActors}
                  searchable
                  disabled={!canEdit}
                />
              )}
              <Field
                label={t('npcs.description')}
                value={fields.description}
                onValue={(value) => set('description', value)}
              />
              <Field
                label={t('npcs.abilities')}
                value={fields.abilities}
                onValue={(value) => set('abilities', value)}
              />
              <Field
                label={t('npcs.costume')}
                value={fields.costume}
                onValue={(value) => set('costume', value)}
              />
              {isOrganizer && (
                <Field label={t('npcs.notes')} value={secretNotes} onValue={setSecretNotes} />
              )}
              {canEdit && (
                <Group justify="space-between">
                  <Button onClick={() => void save()}>{t('common.save')}</Button>
                  <Button
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() =>
                      modals.openConfirmModal({
                        title: t('npcs.delete'),
                        children: (
                          <Text size="sm">{t('npcs.deleteConfirm', { name: record.title })}</Text>
                        ),
                        labels: { confirm: t('npcs.delete'), cancel: t('common.cancel') },
                        confirmProps: { color: 'red' },
                        onConfirm: () =>
                          void run(async () => {
                            await repo.trashRecord(record);
                            void navigate('/cp');
                          }),
                      })
                    }
                  >
                    {t('npcs.delete')}
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
          <Paper withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>{t('npcs.appearances')}</Title>
              {canEdit && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setEditing('new')}
                >
                  {t('npcs.newAppearance')}
                </Button>
              )}
            </Group>
            <AppearanceTable
              rows={appearances}
              npcs={[record]}
              onEdit={(row) => canEdit && setEditing(row)}
            />
          </Paper>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        {isOrganizer && (
          <Paper withBorder p="md">
            <VisibilityEditor record={record} />
          </Paper>
        )}
      </Grid.Col>
      {editing && (
        <AppearanceDialog
          npc={record}
          record={editing === 'new' ? null : editing}
          defaultActor={actorIds[0] ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Grid>
  );
}

/** The schedule table, used on an NPC's page and on the schedule page. */
export function AppearanceTable({
  rows,
  npcs,
  onEdit,
  showNpc = false,
}: {
  rows: RecordRow[];
  npcs: RecordRow[];
  onEdit: (row: RecordRow) => void;
  showNpc?: boolean;
}) {
  const { t } = useTranslation();
  const people = usePeople() ?? [];
  const blocks = useGameRecords('block', rows[0]?.game_id) ?? [];
  const parsed = rows
    .map((row) => ({ row, data: readData(npcAppearanceKind, row) }))
    .sort((a, b) => a.data.starts_at.localeCompare(b.data.starts_at));
  const clashes = findClashes(
    parsed.map(({ row, data }) => ({
      id: row.id,
      actor: data.actor_person_id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
    })),
  );
  if (parsed.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('schedule.empty')}
      </Text>
    );
  }
  const time = (value: string) => value.replace('T', ' ');
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover fz="xs" data-testid="appearance-table">
        <Table.Thead>
          <Table.Tr>
            {showNpc && <Table.Th>{t('schedule.npc')}</Table.Th>}
            <Table.Th>{t('schedule.situation')}</Table.Th>
            <Table.Th>{t('schedule.stats')}</Table.Th>
            <Table.Th>{t('schedule.actor')}</Table.Th>
            <Table.Th>{t('schedule.block')}</Table.Th>
            <Table.Th>{t('schedule.scene')}</Table.Th>
            <Table.Th>{t('schedule.from')}</Table.Th>
            <Table.Th>{t('schedule.to')}</Table.Th>
            <Table.Th>{t('schedule.prep')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {parsed.map(({ row, data }) => {
            const clash = clashes.has(row.id);
            return (
              <Table.Tr
                key={row.id}
                onClick={() => onEdit(row)}
                style={{
                  cursor: 'pointer',
                  background: clash ? 'var(--mantine-color-red-light)' : undefined,
                }}
                data-testid="appearance-row"
                data-clash={clash ? 'yes' : 'no'}
                title={clash ? t('schedule.clash') : undefined}
              >
                {showNpc && (
                  <Table.Td>{npcs.find((npc) => npc.id === row.parent_id)?.title ?? '?'}</Table.Td>
                )}
                <Table.Td>{data.situation}</Table.Td>
                <Table.Td>
                  {data.health || '–'} / {data.speed || '–'} / {data.strength || '–'}
                </Table.Td>
                <Table.Td>
                  {people.find((person) => person.id === data.actor_person_id)?.display_name ??
                    t('schedule.noActor')}
                </Table.Td>
                <Table.Td>
                  {blocks.find((block) => block.id === data.block_id)?.title ?? ''}
                </Table.Td>
                <Table.Td>{data.scene}</Table.Td>
                <Table.Td>{time(data.starts_at)}</Table.Td>
                <Table.Td>{time(data.ends_at)}</Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    color={data.prep_status === 'done' ? 'teal' : 'gray'}
                    variant="light"
                  >
                    {t(`schedule.prepStatuses.${data.prep_status}`)}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function AppearanceDialog({
  npc,
  record,
  defaultActor,
  onClose,
}: {
  npc: RecordRow;
  record: RecordRow | null;
  defaultActor: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const blocks = (useGameRecords('block', npc.game_id) ?? []).sort(
    (a, b) => readData(blockKind, a).order - readData(blockKind, b).order,
  );
  const initial = readData(
    npcAppearanceKind,
    record ?? { data: { actor_person_id: defaultActor } },
  );
  const [fields, setFields] = useState(initial);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    const ok = await run(async () => {
      const title = `${npc.title}: ${fields.situation || fields.scene}`.slice(0, 300);
      const saved = record
        ? await repo.updateRecord(record.id, record.rev, {
            title,
            data: { ...record.data, ...fields },
          })
        : await repo.createRecord({
            kind: 'npc_appearance',
            title,
            game_id: npc.game_id,
            parent_id: npc.id,
            inherit_audience: true,
            data: fields,
          });
      // The appearance's own actor can read it even if they do not play the NPC (rule R4).
      await repo.setAttached(
        saved.id,
        'actor',
        fields.actor_person_id ? [fields.actor_person_id] : [],
      );
    });
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={`${t('schedule.edit')}: ${npc.title}`} size="lg">
      <Stack>
        <TextInput
          label={t('schedule.situation')}
          value={fields.situation}
          onChange={(event) => set('situation', event.currentTarget.value)}
          data-autofocus
        />
        <SimpleGrid cols={3}>
          <TextInput
            label={t('schedule.health')}
            value={fields.health}
            onChange={(event) => set('health', event.currentTarget.value)}
          />
          <TextInput
            label={t('schedule.speed')}
            value={fields.speed}
            onChange={(event) => set('speed', event.currentTarget.value)}
          />
          <TextInput
            label={t('schedule.strength')}
            value={fields.strength}
            onChange={(event) => set('strength', event.currentTarget.value)}
          />
        </SimpleGrid>
        <Field
          label={t('schedule.description')}
          value={fields.description}
          onValue={(value) => set('description', value)}
        />
        <Field
          label={t('schedule.abilities')}
          value={fields.abilities}
          onValue={(value) => set('abilities', value)}
        />
        <SimpleGrid cols={2}>
          <Select
            label={t('schedule.actor')}
            data={people.map((person) => ({ value: person.id, label: person.display_name }))}
            value={fields.actor_person_id}
            onChange={(value) => set('actor_person_id', value)}
            clearable
            searchable
          />
          <Select
            label={t('schedule.prep')}
            data={prepStatuses.map((value) => ({
              value,
              label: t(`schedule.prepStatuses.${value}`),
            }))}
            value={fields.prep_status}
            onChange={(value) => value && set('prep_status', value)}
            allowDeselect={false}
          />
          <Select
            label={t('schedule.block')}
            data={blocks.map((block) => ({ value: block.id, label: block.title }))}
            value={fields.block_id}
            onChange={(value) => set('block_id', value)}
            clearable
          />
          <TextInput
            label={t('schedule.scene')}
            value={fields.scene}
            onChange={(event) => set('scene', event.currentTarget.value)}
          />
          <TextInput
            type="datetime-local"
            label={t('schedule.from')}
            value={fields.starts_at}
            onChange={(event) => set('starts_at', event.currentTarget.value)}
          />
          <TextInput
            type="datetime-local"
            label={t('schedule.to')}
            value={fields.ends_at}
            onChange={(event) => set('ends_at', event.currentTarget.value)}
          />
        </SimpleGrid>
        <Group justify="space-between">
          {record ? (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() =>
                void run(() => repo.deleteRecord(record.id)).then((ok) => ok && onClose())
              }
            >
              {t('schedule.delete')}
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()}>{t('common.save')}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
