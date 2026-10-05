import {
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  NavLink,
  Paper,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { pageKind, pageSubtypes, readData, readSecret, type PageSubtype } from '@core/kinds';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { compareCzech, matchesQuery } from '@core/text';
import { recordLink } from '../app/links';
import { useTeam, useWorkspace } from '../app/workspace';
import { RichText } from '../components/RichText';
import { VisibilityEditor } from '../components/VisibilityEditor';
import {
  NONE,
  useCurrentGame,
  useRecord,
  useRecords,
  useSecret,
  useTeamRecords,
} from '../data/hooks';
import { Field, GameGate, inScope, useAskName, useRun } from '../tools/common';

/** The lore wiki ("Encyklopedie"): places, people off stage, decrees, history… */
export function WikiPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const { game } = useCurrentGame();
  const run = useRun();
  const ask = useAskName();
  const [filter, setFilter] = useState('');
  const [subtype, setSubtype] = useState<string | null>(null);
  const all = useRecords('page') ?? NONE;
  const selected = useRecord(id);
  const secret = useSecret(id);
  const pages = game ? all.filter((row) => inScope(row, game)) : [];
  const shown = pages.filter((row) => {
    const data = readData(pageKind, row);
    return (
      (!subtype || data.subtype === subtype) &&
      (!filter || matchesQuery(`${row.title} ${data.summary} ${row.tags.join(' ')}`, filter))
    );
  });

  function create(scope: 'game' | 'world') {
    if (!game) return;
    ask(t('wiki.newPage'), (name) => {
      void run(async () => {
        const row = await repo.createRecord({
          kind: 'page',
          title: name,
          data: { subtype: subtype ?? 'place' },
          ...(scope === 'game' ? { game_id: game.id } : { world_id: game.world_id }),
        });
        void navigate(`/encyklopedie/${row.id}`);
      });
    });
  }

  return (
    <GameGate>
      {() => (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper withBorder p="sm">
              <Title order={4} mb="xs">
                {t('wiki.title')}
              </Title>
              {canEdit && (
                <Group gap="xs" mb="xs">
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => create('world')}
                  >
                    {t('wiki.newInWorld')}
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => create('game')}
                  >
                    {t('wiki.newInGame')}
                  </Button>
                </Group>
              )}
              <Group gap="xs" mb="xs" grow>
                <TextInput
                  size="xs"
                  placeholder={t('wiki.filter')}
                  value={filter}
                  onChange={(event) => setFilter(event.currentTarget.value)}
                />
                <Select
                  size="xs"
                  placeholder={t('wiki.allTypes')}
                  aria-label={t('wiki.subtype')}
                  data={pageSubtypes.map((value) => ({
                    value,
                    label: t(`wiki.subtypes.${value}`),
                  }))}
                  value={subtype}
                  onChange={setSubtype}
                  clearable
                />
              </Group>
              {shown.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t('wiki.empty')}
                </Text>
              )}
              <Stack gap={0} data-testid="wiki-list">
                {shown.map((row) => (
                  <NavLink
                    key={row.id}
                    label={row.title}
                    description={t(`wiki.subtypes.${readData(pageKind, row).subtype}`)}
                    active={row.id === id}
                    onClick={() => void navigate(`/encyklopedie/${row.id}`)}
                    rightSection={
                      row.game_id === null ? (
                        <Badge size="xs" variant="outline">
                          {t('definitions.world')}
                        </Badge>
                      ) : null
                    }
                  />
                ))}
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            {selected && selected.kind === 'page' ? (
              <PageDetail
                key={`${selected.id}:${selected.rev}:${secret?.rev ?? 0}`}
                record={selected}
                secret={secret}
              />
            ) : (
              <Text c="dimmed">{t('wiki.selectHint')}</Text>
            )}
          </Grid.Col>
        </Grid>
      )}
    </GameGate>
  );
}

function PageDetail({
  record,
  secret,
}: {
  record: RecordRow;
  secret: RecordSecretRow | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const data = readData(pageKind, record);
  const notes = readSecret(pageKind, secret).notes;
  const [title, setTitle] = useState(record.title);
  const [subtype, setSubtype] = useState<PageSubtype>(data.subtype);
  const [summary, setSummary] = useState(data.summary);
  const [tags, setTags] = useState(record.tags);
  const [body, setBody] = useState(data.body);
  const [secretNotes, setSecretNotes] = useState(notes);

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        tags,
        data: { ...record.data, subtype, summary, body },
      });
      if (secretNotes !== notes) await repo.saveSecret(record.id, { notes: secretNotes });
    }, t('common.saved'));
  }
  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 8 }}>
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
            <Group grow align="flex-start">
              <Select
                label={t('wiki.subtype')}
                data={pageSubtypes.map((value) => ({ value, label: t(`wiki.subtypes.${value}`) }))}
                value={subtype}
                onChange={(value) => value && setSubtype(value)}
                allowDeselect={false}
                disabled={!canEdit}
              />
              <TagsInput
                label={t('wiki.tags')}
                value={tags}
                onChange={setTags}
                disabled={!canEdit}
                clearable
              />
            </Group>
            <TextInput
              label={t('wiki.summary')}
              value={summary}
              readOnly={!canEdit}
              onChange={(event) => setSummary(event.currentTarget.value)}
            />
            <RichText
              value={body}
              onChange={setBody}
              editable={canEdit}
              selfId={record.id}
              data-testid="page-body"
            />
            {isOrganizer && (
              <Field label={t('wiki.notes')} value={secretNotes} onValue={setSecretNotes} />
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
                      void navigate('/encyklopedie');
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
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Stack>
          <Backlinks recordId={record.id} />
          {isOrganizer && (
            <Paper withBorder p="md">
              <VisibilityEditor record={record} />
            </Paper>
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

/** Records whose text links here (kept by the database trigger). */
export function Backlinks({ recordId }: { recordId: string }) {
  const { t } = useTranslation();
  const { cache } = useWorkspace();
  const links = useLiveQuery(
    () => cache.links.where('to_id').equals(recordId).toArray(),
    [cache, recordId],
  );
  const fromIds = new Set((links ?? []).map((link) => link.from_id));
  const sources = (
    useTeamRecords((row) => fromIds.has(row.id), `backlinks:${[...fromIds].join(',')}`) ?? NONE
  ).sort((a, b) => compareCzech(a.title, b.title));
  return (
    <Paper withBorder p="md" data-testid="backlinks">
      <Text fw={600} size="sm" mb={4}>
        {t('wiki.backlinks')}
      </Text>
      {sources.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('wiki.noBacklinks')}
        </Text>
      ) : (
        <Stack gap={2}>
          {sources.map((row) => (
            <Anchor key={row.id} component={Link} to={recordLink(row)} size="sm">
              {row.title}{' '}
              <Text span size="xs" c="dimmed">
                ({t(`kinds.${row.kind}`, { defaultValue: row.kind })})
              </Text>
            </Anchor>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
