import {
  Alert,
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  characterKind,
  characterProfileKind,
  costumeStatuses,
  definitionKind,
  factionKind,
  hookKind,
  readData,
  readSecret,
  relationshipKind,
  sheetStatuses,
  type SheetSection,
} from '@core/kinds';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { usePreviewControls } from '../app/preview-controls';
import { useTeam } from '../app/workspace';
import { VisibilityEditor } from '../components/VisibilityEditor';
import {
  useAttachments,
  useGameRecords,
  usePeople,
  useRecord,
  useRecords,
  useSecret,
  useTeamRecords,
} from '../data/hooks';
import { useSheetTemplate } from './CharactersPage';
import { HookDialog } from '../lore/PlotsPage';
import { Field, useRun } from './common';

export function CharacterPage() {
  const { id } = useParams();
  const record = useRecord(id);
  const secret = useSecret(id);
  const profile = useTeamRecords(
    (row) => row.kind === 'character_profile' && row.parent_id === id,
    `profile:${id ?? ''}`,
  )?.[0];
  if (!record || record.kind !== 'character') return null;
  const key = `${record.id}:${record.rev}:${secret?.rev ?? 0}:${profile?.rev ?? 0}`;
  return <CharacterSheet key={key} record={record} secret={secret} profile={profile} />;
}

function CharacterSheet({
  record,
  secret,
  profile,
}: {
  record: RecordRow;
  secret: RecordSecretRow | undefined;
  profile: RecordRow | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const preview = usePreviewControls();
  const game = useRecord(record.game_id);
  const data = readData(characterKind, record);
  const secretData = readSecret(characterKind, secret);
  const profileData = profile ? readData(characterProfileKind, profile) : { sections: {} };
  const { template } = useSheetTemplate(game, data.template_id);
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const factions = (useRecords('faction') ?? []).filter(
    (row) =>
      row.game_id === record.game_id || (row.game_id === null && row.world_id === game?.world_id),
  );
  const definitions = (useRecords('definition') ?? []).filter(
    (row) => row.world_id === game?.world_id,
  );
  const playerIds = attachments
    .filter((row) => row.record_id === record.id && row.relation === 'player')
    .map((row) => row.person_id);

  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState({
    post: data.post,
    house_number: data.house_number,
    sheet_status: data.sheet_status,
    costume_status: data.costume_status,
    faction_ids: data.faction_ids,
    definition_ids: data.definition_ids,
  });
  const [texts, setTexts] = useState<Record<string, string>>({
    ...profileData.sections,
    ...data.sections,
    ...secretData.sections,
  });
  const [playerId, setPlayerId] = useState<string | null>(playerIds[0] ?? null);
  const [busy, setBusy] = useState(false);

  const textSections = template.sections.filter((section) => section.type === 'text');
  const sectionsFor = (audience: SheetSection['audience']) =>
    Object.fromEntries(
      textSections
        .filter((section) => section.audience === audience)
        .map((section) => [section.key, texts[section.key] ?? '']),
    );

  async function save() {
    setBusy(true);
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields, sections: sectionsFor('player') },
      });
      const organizerSections = sectionsFor('organizers');
      if (JSON.stringify(organizerSections) !== JSON.stringify(secretData.sections)) {
        await repo.saveSecret(record.id, { ...(secret?.data ?? {}), sections: organizerSections });
      }
      const publicSections = sectionsFor('public');
      const hasPublic = Object.values(publicSections).some((value) => value.trim() !== '');
      if (profile) {
        if (
          JSON.stringify(publicSections) !== JSON.stringify(profileData.sections) ||
          profile.title !== title
        ) {
          await repo.updateRecord(profile.id, profile.rev, {
            title: title.trim(),
            data: { sections: publicSections },
          });
        }
      } else if (hasPublic) {
        await repo.createRecord({
          kind: 'character_profile',
          title: title.trim(),
          parent_id: record.id,
          game_id: record.game_id,
          visibility: 'everyone',
          data: { sections: publicSections },
        });
      }
      if ((playerIds[0] ?? null) !== playerId) {
        await repo.setAttached(record.id, 'player', playerId ? [playerId] : []);
      }
    }, t('common.saved'));
    setBusy(false);
  }

  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);

  function trash() {
    modals.openConfirmModal({
      title: t('characters.delete'),
      children: <Text size="sm">{t('characters.deleteConfirm', { name: record.title })}</Text>,
      labels: { confirm: t('characters.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        void run(async () => {
          await repo.trashRecord(record);
          void navigate('/postavy');
        });
      },
    });
  }

  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Stack data-testid="character-sheet">
          {template.warning && (
            <Paper bg="var(--mantine-color-red-light)" p={6} radius="sm">
              <Text fw={700} ta="center" c="red" tt="uppercase" size="sm">
                {template.warning}
              </Text>
            </Paper>
          )}
          <TextInput
            size="lg"
            aria-label={t('characters.name')}
            value={title}
            readOnly={!canEdit}
            variant={canEdit ? 'default' : 'unstyled'}
            onChange={(event) => setTitle(event.currentTarget.value)}
            styles={{ input: { fontWeight: 700, fontSize: 24 } }}
          />
          <Group grow align="flex-start">
            {isOrganizer && (
              <Select
                label={t('characters.player')}
                placeholder={t('characters.noPlayer')}
                data={people.map((person) => ({ value: person.id, label: person.display_name }))}
                value={playerId}
                onChange={setPlayerId}
                clearable
                searchable
                disabled={!canEdit}
              />
            )}
            <TextInput
              label={t('characters.post')}
              value={fields.post}
              readOnly={!canEdit}
              onChange={(event) => set('post', event.currentTarget.value)}
            />
            <TextInput
              label={t('characters.house')}
              value={fields.house_number}
              readOnly={!canEdit}
              onChange={(event) => set('house_number', event.currentTarget.value)}
              maw={110}
            />
          </Group>
          {isOrganizer && (
            <Group grow>
              <Select
                label={t('characters.sheetStatus')}
                data={sheetStatuses.map((value) => ({
                  value,
                  label: t(`characters.sheetStatuses.${value}`),
                }))}
                value={fields.sheet_status}
                onChange={(value) => value && set('sheet_status', value)}
                allowDeselect={false}
                disabled={!canEdit}
              />
              <Select
                label={t('characters.costumeStatus')}
                data={costumeStatuses.map((value) => ({
                  value,
                  label: t(`characters.costumeStatuses.${value}`),
                }))}
                value={fields.costume_status}
                onChange={(value) => value && set('costume_status', value)}
                allowDeselect={false}
                disabled={!canEdit}
              />
            </Group>
          )}
          {isOrganizer && (
            <Group grow align="flex-start">
              <MultiSelect
                label={t('characters.groups')}
                data={factions.map((row) => ({ value: row.id, label: row.title }))}
                value={fields.faction_ids}
                onChange={(value) => set('faction_ids', value)}
                searchable
                disabled={!canEdit}
              />
              <MultiSelect
                label={t('characters.definitions')}
                data={definitions.map((row) => ({ value: row.id, label: row.title }))}
                value={fields.definition_ids}
                onChange={(value) => set('definition_ids', value)}
                searchable
                disabled={!canEdit}
              />
            </Group>
          )}

          {template.sections
            .filter((section) => isOrganizer || section.audience !== 'organizers')
            .map((section) => (
              <Paper
                key={section.key}
                withBorder
                p="sm"
                data-testid="sheet-section"
                data-section={section.key}
              >
                <Group justify="space-between" mb={4}>
                  <Title order={5}>{section.title}</Title>
                  {isOrganizer && section.type === 'text' && (
                    <Badge
                      size="xs"
                      variant="light"
                      color={
                        section.audience === 'organizers'
                          ? 'red'
                          : section.audience === 'public'
                            ? 'teal'
                            : 'blue'
                      }
                    >
                      {t(`characters.audience.${section.audience}`)}
                    </Badge>
                  )}
                </Group>
                {section.type === 'text' && (
                  <Field
                    aria-label={section.title}
                    description={canEdit ? section.hint : undefined}
                    value={texts[section.key] ?? ''}
                    onValue={(value) =>
                      setTexts((current) => ({ ...current, [section.key]: value }))
                    }
                  />
                )}
                {section.type === 'relationships' && <CharacterRelationships record={record} />}
                {section.type === 'groups' && (
                  <CharacterGroups ids={fields.faction_ids} factions={factions} />
                )}
                {section.type === 'definitions' && (
                  <CharacterDefinitions ids={fields.definition_ids} definitions={definitions} />
                )}
                {section.type === 'property' && (
                  <Text size="sm" c="dimmed">
                    {t('characters.propertyLater')}
                  </Text>
                )}
              </Paper>
            ))}

          {canEdit && (
            <Group>
              <Button onClick={() => void save()} loading={busy}>
                {t('common.save')}
              </Button>
            </Group>
          )}
          {game && <CharacterHooks game={game} character={record} />}
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Stack>
          {isOrganizer && (
            <Paper withBorder p="md">
              <VisibilityEditor record={record} />
            </Paper>
          )}
          {isOrganizer && playerIds[0] && preview && (
            <Button
              variant="light"
              leftSection={<IconEye size={14} />}
              onClick={() => void preview.start(playerIds[0] ?? '', `/postavy/${record.id}`)}
            >
              {t('characters.viewAsPlayer')}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={trash}
            >
              {t('characters.delete')}
            </Button>
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

/** Personal hooks (M3): organizers manage them; the player sees the shared ones. */
function CharacterHooks({ game, character }: { game: RecordRow; character: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit, isOrganizer } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const hooks = (useGameRecords('hook', game.id) ?? []).filter(
    (row) => row.parent_id === character.id,
  );
  if (hooks.length === 0 && !canEdit) return null;
  return (
    <Paper withBorder p="sm" data-testid="hooks">
      <Group justify="space-between" mb={4}>
        <Title order={5}>{t('hooks.title')}</Title>
        {canEdit && (
          <Button size="compact-xs" variant="light" onClick={() => setEditing('new')}>
            {t('hooks.newHook')}
          </Button>
        )}
      </Group>
      {hooks.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('hooks.empty')}
        </Text>
      )}
      <Stack gap={4}>
        {hooks.map((row) => {
          const data = readData(hookKind, row);
          return (
            <Group
              key={row.id}
              gap="xs"
              wrap="nowrap"
              style={{ cursor: canEdit ? 'pointer' : undefined }}
              onClick={() => canEdit && setEditing(row)}
            >
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {data.text}
              </Text>
              {isOrganizer && (
                <Badge size="xs" variant="light" color={row.inherit_audience ? 'blue' : 'red'}>
                  {row.inherit_audience ? t('hooks.sharedBadge') : t('hooks.secretBadge')}
                </Badge>
              )}
              {isOrganizer && data.delivered && (
                <Badge size="xs" variant="light" color="teal">
                  {t('hooks.delivered')}
                </Badge>
              )}
            </Group>
          );
        })}
      </Stack>
      {editing && (
        <HookDialog
          game={game}
          record={editing === 'new' ? null : editing}
          threadId={null}
          characterId={character.id}
          onClose={() => setEditing(null)}
        />
      )}
    </Paper>
  );
}

function CharacterRelationships({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const relationships = useGameRecords('relationship', record.game_id) ?? [];
  const characters = useGameRecords('character', record.game_id) ?? [];
  const profiles = useGameRecords('character_profile', record.game_id) ?? [];
  const mine = relationships
    .map((row) => ({ row, data: readData(relationshipKind, row) }))
    .filter(({ data }) => data.from_id === record.id || data.to_id === record.id);
  if (mine.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('characters.noRelationships')}
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {mine.map(({ row, data }) => {
        const otherId = data.from_id === record.id ? data.to_id : data.from_id;
        const other = characters.find((character) => character.id === otherId);
        // A player usually cannot read the other character, only its public
        // profile or the name saved in the relationship's title ("A → B").
        const otherName =
          profiles.find((profile) => profile.parent_id === otherId)?.title ??
          row.title.split(' → ')[data.from_id === record.id ? 1 : 0] ??
          '?';
        return (
          <Group
            key={row.id}
            gap={6}
            align="baseline"
            wrap="nowrap"
            data-testid="sheet-relationship"
          >
            <Text size="sm" fw={600}>
              {other ? (
                <Anchor component={Link} to={`/postavy/${other.id}`}>
                  {other.title}
                </Anchor>
              ) : (
                otherName
              )}
            </Text>
            <Text size="sm">– {data.label}</Text>
            {data.note && (
              <Text size="sm" c="dimmed">
                ({data.note})
              </Text>
            )}
            {data.known_by !== 'both' && (
              <Badge size="xs" variant="outline" color="grape">
                {t('relationships.secretBadge')}
              </Badge>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}

function CharacterGroups({ ids, factions }: { ids: string[]; factions: RecordRow[] }) {
  const { t } = useTranslation();
  const mine = factions.filter((row) => ids.includes(row.id));
  if (mine.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('characters.noGroups')}
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {mine.map((row) => {
        const data = readData(factionKind, row);
        return (
          <Stack key={row.id} gap={2}>
            <Anchor component={Link} to={`/skupiny/${row.id}`} fw={600} size="sm">
              {row.title}
            </Anchor>
            {data.customs && (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                <b>{t('characters.customs')}:</b> {data.customs}
              </Text>
            )}
            {data.vocabulary && (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                <b>{t('characters.vocabulary')}:</b> {data.vocabulary}
              </Text>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

function CharacterDefinitions({ ids, definitions }: { ids: string[]; definitions: RecordRow[] }) {
  const { t } = useTranslation();
  const mine = definitions.filter((row) => ids.includes(row.id));
  return (
    <Stack gap={4}>
      {mine.map((row) => {
        const data = readData(definitionKind, row);
        return (
          <Text key={row.id} size="sm">
            <b>{row.title}</b> ({t(`definitions.types.${data.type}`)})
            {data.description ? ` – ${data.description}` : ''}
          </Text>
        );
      })}
      {mine.length === 0 && (
        <Alert variant="light" color="gray" p="xs">
          <Text size="xs">—</Text>
        </Alert>
      )}
    </Stack>
  );
}
