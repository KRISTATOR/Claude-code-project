import {
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  MultiSelect,
  NavLink,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { characterKind, factionKind, factionTypes, readData, readSecret } from '@core/kinds';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { useCurrentGame, useGameRecords, useRecord, useRecords, useSecret } from '../data/hooks';
import { Field, GameGate, useRun } from './common';

/** Factions, opinion groups, clans, ethnic and religious groups (M2). */
export function GroupsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const { game } = useCurrentGame();
  const run = useRun();
  const groups = (useRecords('faction') ?? []).filter(
    (row) => row.game_id === game?.id || (row.game_id === null && row.world_id === game?.world_id),
  );
  const selected = useRecord(id);
  const secret = useSecret(id);

  function create(scope: 'game' | 'world') {
    if (!game) return;
    let name = '';
    modals.openConfirmModal({
      title: t('groups.newGroup'),
      children: (
        <TextInput
          data-autofocus
          label={t('common.name')}
          placeholder={t('groups.namePlaceholder')}
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
            kind: 'faction',
            title: name.trim(),
            ...(scope === 'game' ? { game_id: game.id } : { world_id: game.world_id }),
          });
          void navigate(`/skupiny/${row.id}`);
        });
      },
    });
  }

  return (
    <GameGate>
      {() => (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper withBorder p="sm">
              <Group justify="space-between" mb="xs">
                <Title order={4}>{t('groups.title')}</Title>
              </Group>
              {canEdit && (
                <Group gap="xs" mb="xs">
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => create('game')}
                  >
                    {t('groups.scopeGame')}
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => create('world')}
                  >
                    {t('groups.scopeWorld')}
                  </Button>
                </Group>
              )}
              {groups.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t('groups.empty')}
                </Text>
              )}
              {groups.map((row) => (
                <NavLink
                  key={row.id}
                  label={row.title}
                  description={t(`groups.types.${readData(factionKind, row).type}`)}
                  active={row.id === id}
                  onClick={() => void navigate(`/skupiny/${row.id}`)}
                  rightSection={
                    row.game_id === null ? (
                      <Badge size="xs" variant="outline">
                        {t('definitions.world')}
                      </Badge>
                    ) : null
                  }
                />
              ))}
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            {selected && selected.kind === 'faction' ? (
              <GroupDetail
                key={`${selected.id}:${selected.rev}:${secret?.rev ?? 0}`}
                record={selected}
                secret={secret}
              />
            ) : (
              <Text c="dimmed">{t('worlds.selectHint')}</Text>
            )}
          </Grid.Col>
        </Grid>
      )}
    </GameGate>
  );
}

function GroupDetail({
  record,
  secret,
}: {
  record: RecordRow;
  secret: RecordSecretRow | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const { game } = useCurrentGame();
  const run = useRun();
  const data = readData(factionKind, record);
  const notes = readSecret(factionKind, secret).notes;
  const characters = useGameRecords('character', game?.id) ?? [];
  const members = characters.filter((row) =>
    readData(characterKind, row).faction_ids.includes(record.id),
  );
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(data);
  const [secretNotes, setSecretNotes] = useState(notes);
  const [memberIds, setMemberIds] = useState(members.map((row) => row.id));
  const set = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      });
      if (secretNotes !== notes) await repo.saveSecret(record.id, { notes: secretNotes });
      // Membership is stored on each character.
      for (const character of characters) {
        const ids = readData(characterKind, character).faction_ids;
        const should = memberIds.includes(character.id);
        if (should === ids.includes(record.id)) continue;
        const next = should ? [...ids, record.id] : ids.filter((value) => value !== record.id);
        await repo.updateRecord(character.id, character.rev, {
          data: { ...character.data, faction_ids: next },
        });
      }
    }, t('common.saved'));
  }

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Paper withBorder p="md">
          <Stack>
            <TextInput
              label={t('common.name')}
              value={title}
              readOnly={!canEdit}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <Select
              label={t('groups.type')}
              data={factionTypes.map((value) => ({ value, label: t(`groups.types.${value}`) }))}
              value={fields.type}
              onChange={(value) => value && setFields((current) => ({ ...current, type: value }))}
              allowDeselect={false}
              disabled={!canEdit}
            />
            <Field
              label={t('groups.description')}
              value={fields.description}
              onValue={(value) => set('description', value)}
            />
            <Field
              label={t('groups.customs')}
              description={t('groups.customsHint')}
              value={fields.customs}
              onValue={(value) => set('customs', value)}
            />
            <Field
              label={t('groups.beliefs')}
              value={fields.beliefs}
              onValue={(value) => set('beliefs', value)}
            />
            <Field
              label={t('groups.laws')}
              value={fields.laws}
              onValue={(value) => set('laws', value)}
            />
            <Field
              label={t('groups.vocabulary')}
              value={fields.vocabulary}
              onValue={(value) => set('vocabulary', value)}
            />
            {isOrganizer && (
              <Field label={t('groups.notes')} value={secretNotes} onValue={setSecretNotes} />
            )}
            {isOrganizer ? (
              <MultiSelect
                label={t('groups.members')}
                data={characters.map((row) => ({ value: row.id, label: row.title }))}
                value={memberIds}
                onChange={setMemberIds}
                searchable
                disabled={!canEdit}
              />
            ) : (
              <Stack gap={2}>
                <Text size="sm" fw={500}>
                  {t('groups.members')}
                </Text>
                {members.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('groups.noMembers')}
                  </Text>
                ) : (
                  members.map((row) => (
                    <Anchor key={row.id} component={Link} to={`/postavy/${row.id}`} size="sm">
                      {row.title}
                    </Anchor>
                  ))
                )}
              </Stack>
            )}
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
                      void navigate('/skupiny');
                    })
                  }
                >
                  {t('worlds.trash')}
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        {isOrganizer && (
          <Paper withBorder p="md">
            <VisibilityEditor record={record} />
          </Paper>
        )}
      </Grid.Col>
    </Grid>
  );
}
