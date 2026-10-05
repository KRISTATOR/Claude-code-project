import {
  ActionIcon,
  Button,
  Grid,
  Group,
  NavLink,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { noteKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import { NONE, useCurrentGame, useRecords } from '../data/hooks';
import { useAskName, useRun } from '../tools/common';

/** A simple notes page ("Poznámky"): per game, plus team-wide notes. */
export function NotesPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const { game } = useCurrentGame();
  const run = useRun();
  const ask = useAskName();
  const notes = (useRecords('note') ?? NONE).filter(
    (row) => row.game_id === null || row.game_id === game?.id,
  );
  const selected = notes.find((row) => row.id === id);
  const create = (teamWide: boolean) =>
    ask(t('notes.newNote'), (title) => {
      void run(async () => {
        const row = await repo.createRecord({
          kind: 'note',
          title,
          game_id: teamWide ? null : (game?.id ?? null),
        });
        void navigate(`/poznamky/${row.id}`);
      });
    });
  const section = (label: string, rows: RecordRow[]) =>
    rows.length > 0 && (
      <Stack gap={0}>
        <Text size="xs" c="dimmed" fw={600} px="xs">
          {label}
        </Text>
        {rows.map((row) => (
          <NavLink
            key={row.id}
            label={row.title}
            active={row.id === selected?.id}
            onClick={() => void navigate(`/poznamky/${row.id}`)}
          />
        ))}
      </Stack>
    );
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('notes.title')}</Title>
        {canEdit && (
          <Group>
            <Button variant="light" onClick={() => create(true)}>
              {t('notes.teamWide')}
            </Button>
            {game && (
              <Button leftSection={<IconPlus size={14} />} onClick={() => create(false)}>
                {t('notes.newNote')}
              </Button>
            )}
          </Group>
        )}
      </Group>
      {notes.length === 0 ? (
        <Text c="dimmed">{t('notes.empty')}</Text>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Stack gap="xs">
              {game &&
                section(
                  game.title,
                  notes.filter((row) => row.game_id === game.id),
                )}
              {section(
                t('notes.teamWide'),
                notes.filter((row) => row.game_id === null),
              )}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {selected ? (
              <NoteEditor key={`${selected.id}:${String(selected.rev)}`} record={selected} />
            ) : (
              <Text c="dimmed">{t('notes.selectHint')}</Text>
            )}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}

function NoteEditor({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record.title);
  const [body, setBody] = useState(readData(noteKind, record).body);
  async function save() {
    await run(
      () =>
        repo.updateRecord(record.id, record.rev, {
          title: title.trim() || record.title,
          data: { ...record.data, body },
        }),
      t('common.saved'),
    );
  }
  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);
  return (
    <Paper withBorder p="md">
      <Stack>
        <TextInput
          size="lg"
          aria-label={t('common.name')}
          value={title}
          readOnly={!canEdit}
          variant={canEdit ? 'default' : 'unstyled'}
          onChange={(event) => setTitle(event.currentTarget.value)}
          styles={{ input: { fontWeight: 700, fontSize: 22 } }}
        />
        <RichText
          value={body}
          onChange={setBody}
          editable={canEdit}
          selfId={record.id}
          data-testid="note-body"
        />
        {canEdit && (
          <Group justify="space-between">
            <Button onClick={() => void save()}>{t('common.save')}</Button>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() =>
                void run(() => repo.trashRecord(record)).then(
                  (ok) => ok && void navigate('/poznamky'),
                )
              }
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
