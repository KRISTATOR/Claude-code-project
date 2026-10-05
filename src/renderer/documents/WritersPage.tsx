import {
  Button,
  ColorInput,
  Grid,
  Group,
  NavLink,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconDownload, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { paperStyles, readData, writerProfileKind } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { BUNDLED_FONTS, fontById, fontCategories } from '@core/print/fonts';
import { escapeHtml } from '@core/print/html';
import { useTeam } from '../app/workspace';
import { NONE, useRecord, useRecords } from '../data/hooks';
import { PaperPreview } from '../print/components';
import { GameGate, useAskName, useRun } from '../tools/common';

export const SAMPLE = 'Příliš žluťoučký kůň úpěl ďábelské ódy. ĚŠČŘŽÝÁÍÉÚŮ ďťň 1621';

/** Writer profiles ("Pisatelé"): one consistent look per in-world author. */
export function WritersPage() {
  return <GameGate>{(game) => <Writers game={game} />}</GameGate>;
}

function Writers({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const selected = useRecord(id);
  const writers = (useRecords('writer_profile') ?? NONE).filter(
    (row) => row.world_id === game.world_id,
  );
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="sm">
          <Title order={4} mb="xs">
            {t('writers.title')}
          </Title>
          <Text size="xs" c="dimmed" mb="xs">
            {t('writers.intro')}
          </Text>
          {canEdit && (
            <Button
              size="xs"
              mb="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                ask(
                  t('writers.newWriter'),
                  (name) => {
                    void run(async () => {
                      const row = await repo.createRecord({
                        kind: 'writer_profile',
                        title: name,
                        world_id: game.world_id,
                      });
                      void navigate(`/pisatele/${row.id}`);
                    });
                  },
                  t('writers.namePlaceholder'),
                )
              }
            >
              {t('writers.newWriter')}
            </Button>
          )}
          {writers.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('writers.empty')}
            </Text>
          )}
          {writers.map((row) => (
            <NavLink
              key={row.id}
              label={row.title}
              description={fontById(readData(writerProfileKind, row).font_id).name}
              active={row.id === id}
              onClick={() => void navigate(`/pisatele/${row.id}`)}
            />
          ))}
          <FontsExport />
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && selected.kind === 'writer_profile' ? (
          <WriterEditor key={`${selected.id}:${selected.rev}`} record={selected} />
        ) : (
          <Text c="dimmed">{t('writers.selectHint')}</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}

function FontsExport() {
  const { t } = useTranslation();
  const run = useRun();
  return (
    <Stack gap={4} mt="md">
      <Text size="xs" c="dimmed">
        {t('writers.fontsHint')}
      </Text>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconDownload size={14} />}
        onClick={() =>
          void run(async () => {
            const result = await window.zazemi.print.exportFonts();
            if (!result.saved) throw new Error('cancelled');
          }, t('writers.fontsSaved'))
        }
      >
        {t('writers.exportFonts')}
      </Button>
    </Stack>
  );
}

function WriterEditor({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(readData(writerProfileKind, record));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const fontOptions = fontCategories.map((category) => ({
    group: t(`writers.categories.${category}`),
    items: BUNDLED_FONTS.filter((font) => font.category === category).map((font) => ({
      value: font.id,
      label: font.name,
    })),
  }));

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

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper withBorder p="md">
          <Stack>
            <TextInput
              label={t('writers.name')}
              value={title}
              readOnly={!canEdit}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <Select
              label={t('writers.font')}
              description={t('writers.fontHint')}
              data={fontOptions}
              value={fields.font_id}
              onChange={(value) => value && set('font_id', value)}
              allowDeselect={false}
              disabled={!canEdit}
              renderOption={({ option }) => (
                <Text style={{ fontFamily: `"${fontById(option.value).family}"` }} size="lg">
                  {option.label}
                </Text>
              )}
            />
            <Group grow>
              <ColorInput
                label={t('writers.ink')}
                value={fields.ink}
                onChange={(value) => /^#[0-9a-f]{6}$/i.test(value) && set('ink', value)}
                swatches={['#1a1a1a', '#2b3a67', '#5b2a1a', '#6b1e1e', '#1f4d2b']}
                disabled={!canEdit}
              />
              <Select
                label={t('writers.paper')}
                data={paperStyles.map((value) => ({ value, label: t(`writers.papers.${value}`) }))}
                value={fields.paper}
                onChange={(value) => value && set('paper', value)}
                allowDeselect={false}
                disabled={!canEdit}
              />
              <NumberInput
                label={t('writers.size')}
                value={fields.size_pt}
                min={6}
                max={36}
                onChange={(value) => set('size_pt', Number(value) || 13)}
                readOnly={!canEdit}
                maw={110}
              />
            </Group>
            <TextInput
              label={t('writers.letterhead')}
              description={t('writers.letterheadHint')}
              value={fields.letterhead}
              readOnly={!canEdit}
              onChange={(event) => set('letterhead', event.currentTarget.value)}
            />
            <TextInput
              label={t('writers.signature')}
              value={fields.signature}
              readOnly={!canEdit}
              onChange={(event) => set('signature', event.currentTarget.value)}
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
                      void navigate('/pisatele');
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
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <PaperPreview
          width={380}
          piece={{
            size: 'A5',
            look: {
              fontId: fields.font_id,
              ink: fields.ink,
              paper: fields.paper,
              sizePt: fields.size_pt,
            },
            html: [
              fields.letterhead
                ? `<div class="letterhead">${escapeHtml(fields.letterhead)}</div>`
                : '',
              `<p>${escapeHtml(SAMPLE)}</p>`,
              `<p>${escapeHtml(t('writers.sampleLetter'))}</p>`,
              fields.signature
                ? `<div class="signature">${escapeHtml(fields.signature)}</div>`
                : '',
            ].join(''),
          }}
        />
      </Grid.Col>
    </Grid>
  );
}
