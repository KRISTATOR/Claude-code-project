import {
  Button,
  Grid,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { gameKind, gameStatuses, readData, worldKind } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { errorMessage } from '../../components/errors';
import { notifyError, notifySuccess } from '../../components/notify';
import { VisibilityBadge, VisibilityEditor } from '../../components/VisibilityEditor';
import { useRecord, useRecords } from '../../data/hooks';
import { useTeam } from '../workspace';
import { CloneGameButton } from '../../lore/CloneGameDialog';

export function WorldsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const worlds = useRecords('world') ?? [];
  const games = useRecords('game') ?? [];
  const selected = useRecord(id);

  function create(kind: 'world' | 'game', worldId?: string) {
    let title = '';
    modals.openConfirmModal({
      title: kind === 'world' ? t('worlds.newWorld') : t('worlds.newGame'),
      children: (
        <TextInput
          data-autofocus
          label={t('common.name')}
          placeholder={
            kind === 'world' ? t('worlds.worldNamePlaceholder') : t('worlds.gameNamePlaceholder')
          }
          onChange={(event) => {
            title = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.create'), cancel: t('common.cancel') },
      onConfirm: () => {
        if (!title.trim()) return;
        void (async () => {
          try {
            const row = await repo.createRecord({
              kind,
              title: title.trim(),
              world_id: worldId ?? null,
              visibility: (kind === 'world' ? worldKind : gameKind).defaultVisibility,
            });
            void navigate(`/svety/${row.id}`);
          } catch (error) {
            notifyError(errorMessage(t, error));
          }
        })();
      },
    });
  }

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="sm">
          <Group justify="space-between" mb="xs">
            <Title order={4}>{t('worlds.title')}</Title>
            {canEdit && (
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => create('world')}
              >
                {t('worlds.newWorld')}
              </Button>
            )}
          </Group>
          <ScrollArea.Autosize mah="calc(100vh - 200px)">
            {worlds.length === 0 && games.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('worlds.empty')}
              </Text>
            )}
            {worlds.map((world) => (
              <NavLink
                key={world.id}
                label={<Labeled title={world.title} visibility={world.visibility} />}
                active={world.id === id}
                defaultOpened
                onClick={() => void navigate(`/svety/${world.id}`)}
              >
                {games
                  .filter((game) => game.world_id === world.id)
                  .map((game) => (
                    <NavLink
                      key={game.id}
                      label={<Labeled title={game.title} visibility={game.visibility} />}
                      active={game.id === id}
                      onClick={() => void navigate(`/svety/${game.id}`)}
                    />
                  ))}
              </NavLink>
            ))}
            {/* Games whose world this user cannot see (players see public games of hidden worlds as orphans). */}
            {games
              .filter((game) => !worlds.some((world) => world.id === game.world_id))
              .map((game) => (
                <NavLink
                  key={game.id}
                  label={game.title}
                  active={game.id === id}
                  onClick={() => void navigate(`/svety/${game.id}`)}
                />
              ))}
          </ScrollArea.Autosize>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && (selected.kind === 'world' || selected.kind === 'game') ? (
          <RecordDetail
            key={`${selected.id}:${selected.rev}`}
            record={selected}
            games={games.filter((game) => game.world_id === selected.id)}
            onNewGame={() => create('game', selected.id)}
          />
        ) : (
          <Text c="dimmed">{t('worlds.selectHint')}</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}

function RecordDetail({
  record,
  games,
  onNewGame,
}: {
  record: RecordRow;
  games: RecordRow[];
  onNewGame: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const isGame = record.kind === 'game';
  const initial = isGame ? readData(gameKind, record) : { ...readData(worldKind, record) };
  const [title, setTitle] = useState(record.title);
  const [data, setData] = useState<Record<string, unknown>>(initial);
  const [busy, setBusy] = useState(false);

  const field = (key: string) => {
    const value = data[key];
    return typeof value === 'string' ? value : '';
  };
  const setField = (key: string, value: unknown) =>
    setData((current) => ({ ...current, [key]: value }));
  const dirty = title !== record.title || JSON.stringify(data) !== JSON.stringify({ ...initial });

  async function save() {
    setBusy(true);
    try {
      const schema = isGame ? gameKind.data : worldKind.data;
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...schema.parse(data) },
      });
      notifySuccess(t('common.saved'));
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  function trash() {
    modals.openConfirmModal({
      title: t('worlds.trash'),
      children: <Text size="sm">{t('worlds.trashConfirm', { title: record.title })}</Text>,
      labels: { confirm: t('worlds.trash'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        repo.trashRecord(record).then(
          () => void navigate('/svety'),
          (error: unknown) => notifyError(errorMessage(t, error)),
        );
      },
    });
  }

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Paper withBorder p="md">
          <Stack>
            <Text size="xs" c="dimmed" tt="uppercase">
              {isGame ? t('worlds.game') : t('worlds.world')}
            </Text>
            <TextInput
              label={t('common.name')}
              value={title}
              readOnly={!canEdit}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={300}
            />
            <Textarea
              label={t('common.description')}
              value={field('description')}
              readOnly={!canEdit}
              autosize
              minRows={3}
              onChange={(event) => setField('description', event.currentTarget.value)}
            />
            {isGame && (
              <>
                <Select
                  label={t('worlds.status')}
                  data={gameStatuses.map((status) => ({
                    value: status,
                    label: t(`worlds.statuses.${status}`),
                  }))}
                  value={field('status') || 'planning'}
                  readOnly={!canEdit}
                  onChange={(value) => setField('status', value ?? 'planning')}
                  allowDeselect={false}
                />
                <Group grow>
                  <TextInput
                    type="date"
                    label={t('worlds.startsOn')}
                    value={field('starts_on')}
                    readOnly={!canEdit}
                    onChange={(event) => setField('starts_on', event.currentTarget.value || null)}
                  />
                  <TextInput
                    type="date"
                    label={t('worlds.endsOn')}
                    value={field('ends_on')}
                    readOnly={!canEdit}
                    onChange={(event) => setField('ends_on', event.currentTarget.value || null)}
                  />
                </Group>
                <TextInput
                  label={t('worlds.venue')}
                  value={field('venue')}
                  readOnly={!canEdit}
                  onChange={(event) => setField('venue', event.currentTarget.value)}
                />
              </>
            )}
            {canEdit && (
              <Group justify="space-between">
                <Button onClick={() => void save()} loading={busy} disabled={!dirty}>
                  {t('common.save')}
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={trash}
                >
                  {t('worlds.trash')}
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>
        {isGame && canEdit && (
          <Group mt="md">
            <CloneGameButton game={record} />
          </Group>
        )}
        {!isGame && (
          <Paper withBorder p="md" mt="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>{t('worlds.gamesInWorld')}</Title>
              {canEdit && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={onNewGame}
                >
                  {t('worlds.newGame')}
                </Button>
              )}
            </Group>
            {games.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('worlds.noGamesInWorld')}
              </Text>
            ) : (
              games.map((game) => (
                <NavLink
                  key={game.id}
                  label={game.title}
                  onClick={() => void navigate(`/svety/${game.id}`)}
                />
              ))
            )}
          </Paper>
        )}
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Paper withBorder p="md">
          <VisibilityEditor record={record} />
        </Paper>
      </Grid.Col>
    </Grid>
  );
}

function Labeled({ title, visibility }: { title: string; visibility: RecordRow['visibility'] }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm" truncate>
        {title}
      </Text>
      <VisibilityBadge visibility={visibility} />
    </Group>
  );
}
