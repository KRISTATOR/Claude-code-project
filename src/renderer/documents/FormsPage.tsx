import {
  Badge,
  Button,
  Grid,
  Group,
  MultiSelect,
  NavLink,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { formModes, formTemplateKind, characterKind, paperSizes, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { formatDate } from '@core/format';
import { escapeHtml, richHtml, type PrintPiece } from '@core/print/html';
import {
  CHARACTER_FIELDS,
  GENERAL_FIELDS,
  characterFields,
  generalFields,
} from '@core/print/merge';
import { compareCzech } from '@core/text';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import {
  NONE,
  useAttachments,
  useGameRecords,
  usePeople,
  useRecord,
  useRecords,
  useTeamRecords,
} from '../data/hooks';
import { ExportMenu, PaperPreview, PdfPreviewButton } from '../print/components';
import { lookOf, usePrintContext } from '../print/pieces';
import { GameGate, inScope, useAskName, useRun } from '../tools/common';

/** Merge fields for every character of a game (sorted by name). */
export function useMergeRows(game: RecordRow) {
  const { team } = useTeam();
  const records =
    useTeamRecords(
      (row) =>
        row.id === game.world_id ||
        row.game_id === game.id ||
        (row.game_id === null && row.world_id === game.world_id),
      `merge:${game.id}`,
    ) ?? NONE;
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const byId = new Map(records.map((row) => [row.id, row]));
  const general = generalFields({
    team: team.name,
    world: byId.get(game.world_id ?? '')?.title ?? '',
    game: game.title,
    date: formatDate(new Date()),
  });
  const characters = records
    .filter((row) => row.kind === 'character')
    .sort((a, b) => compareCzech(a.title, b.title));
  return {
    general,
    rows: characters.map((character) => ({
      character,
      fields: { ...general, ...characterFields(character, byId, people, attachments) },
    })),
  };
}

/** Mail-merge forms ("Formuláře"): census slips, lists of names… */
export function FormsPage() {
  return <GameGate>{(game) => <Forms game={game} />}</GameGate>;
}

function Forms({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const forms = useGameRecords('form_template', game.id) ?? NONE;
  const selected = useRecord(id);
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Paper withBorder p="sm">
          <Title order={4} mb="xs">
            {t('forms.title')}
          </Title>
          {canEdit && (
            <Button
              size="xs"
              mb="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                ask(t('forms.newForm'), (name) => {
                  void run(async () => {
                    const row = await repo.createRecord({
                      kind: 'form_template',
                      title: name,
                      game_id: game.id,
                    });
                    void navigate(`/formulare/${row.id}`);
                  });
                })
              }
            >
              {t('forms.newForm')}
            </Button>
          )}
          {forms.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('forms.empty')}
            </Text>
          )}
          {forms.map((row) => (
            <NavLink
              key={row.id}
              label={row.title}
              description={t(`forms.modes.${readData(formTemplateKind, row).mode}`)}
              active={row.id === id}
              onClick={() => void navigate(`/formulare/${row.id}`)}
            />
          ))}
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 9 }}>
        {selected && selected.kind === 'form_template' ? (
          <FormEditor key={`${selected.id}:${selected.rev}`} game={game} record={selected} />
        ) : (
          <Text c="dimmed">{t('forms.selectHint')}</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}

function FormEditor({ game, record }: { game: RecordRow; record: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const context = usePrintContext(game);
  const factions = (useRecords('faction') ?? NONE).filter((row) => inScope(row, game));
  const { rows } = useMergeRows(game);
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(readData(formTemplateKind, record));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const look = lookOf(fields.writer_id ? context.writers.get(fields.writer_id) : undefined);
  const included = rows.filter(
    ({ character }) =>
      fields.faction_ids.length === 0 ||
      readData(characterKind, character).faction_ids.some((factionId) =>
        fields.faction_ids.includes(factionId),
      ),
  );
  const fieldLabel = (key: string) => t(`forms.fields.${key}`, { defaultValue: key });

  const pieces = (): PrintPiece[] => {
    if (fields.mode === 'list') {
      const head = fields.columns.map((key) => `<th>${escapeHtml(fieldLabel(key))}</th>`).join('');
      const body = included
        .map(
          ({ fields: values }) =>
            `<tr>${fields.columns.map((key) => `<td>${escapeHtml(values[key] ?? '')}</td>`).join('')}</tr>`,
        )
        .join('');
      return [
        {
          size: fields.paper_size,
          look,
          html: `${richHtml(fields.body, included[0]?.fields)}<table class="list"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
        },
      ];
    }
    return included.map(({ fields: values }) => ({
      size: fields.paper_size,
      look,
      html: richHtml(fields.body, values),
    }));
  };

  async function save() {
    await run(
      () =>
        repo.updateRecord(record.id, record.rev, {
          title: title.trim() || record.title,
          data: { ...record.data, ...fields },
        }),
      t('common.saved'),
    );
  }

  const preview = pieces()[0];
  const allFields = [...CHARACTER_FIELDS, ...GENERAL_FIELDS];
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
            <SegmentedControl
              value={fields.mode}
              onChange={(value) => set('mode', value)}
              data={formModes.map((value) => ({ value, label: t(`forms.modes.${value}`) }))}
              disabled={!canEdit}
            />
            <Group gap={4}>
              <Text size="xs" c="dimmed">
                {t('forms.fieldsHint')}
              </Text>
              {allFields.map((key) => (
                <Badge key={key} size="xs" variant="outline" tt="none">
                  {`{${key}}`} {fieldLabel(key)}
                </Badge>
              ))}
            </Group>
            <RichText
              value={fields.body}
              onChange={(value) => set('body', value)}
              editable={canEdit}
              selfId={record.id}
              data-testid="form-body"
            />
            {fields.mode === 'list' && (
              <MultiSelect
                label={t('forms.columns')}
                data={allFields.map((key) => ({ value: key, label: fieldLabel(key) }))}
                value={fields.columns}
                onChange={(value) => set('columns', value)}
                disabled={!canEdit}
              />
            )}
            <Group grow align="flex-start">
              <MultiSelect
                label={t('forms.onlyGroups')}
                description={t('forms.onlyGroupsHint')}
                data={factions.map((row) => ({ value: row.id, label: row.title }))}
                value={fields.faction_ids}
                onChange={(value) => set('faction_ids', value)}
                disabled={!canEdit}
              />
              <Select
                label={t('documents.writer')}
                data={[...context.writers.values()].map((row) => ({
                  value: row.id,
                  label: row.title,
                }))}
                value={fields.writer_id}
                onChange={(value) => set('writer_id', value)}
                clearable
                disabled={!canEdit}
              />
              <Select
                label={t('documents.paper')}
                data={paperSizes.map((value) => ({ value, label: value }))}
                value={fields.paper_size}
                onChange={(value) => value && set('paper_size', value)}
                allowDeselect={false}
                disabled={!canEdit}
                maw={100}
              />
            </Group>
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
                      void navigate('/formulare');
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
        <Stack>
          <Group justify="space-between">
            <Text size="sm" c="dimmed" data-testid="form-count">
              {t('forms.count', { count: fields.mode === 'list' ? 1 : included.length })}
            </Text>
            <Group gap="xs">
              <PdfPreviewButton pieces={pieces} />
              <ExportMenu title={title} pdf={pieces} disabled={included.length === 0} />
            </Group>
          </Group>
          {preview ? (
            <PaperPreview piece={preview} width={fields.paper_size === 'A5' ? 340 : 400} />
          ) : (
            <Text c="dimmed">{t('forms.noCharacters')}</Text>
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
