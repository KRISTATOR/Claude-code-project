import {
  Button,
  Grid,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { characterKind, characterProfileKind, diaryDesignKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { bookletOrder, bookletPageCount } from '@core/print/booklet';
import { escapeHtml, fillFields, textHtml, type Look, type PrintPiece } from '@core/print/html';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords } from '../data/hooks';
import { PaperPreview } from '../print/components';
import { lookOf, usePrintContext } from '../print/pieces';
import { imposeBooklet, mergePdfs, pageCount, save, toPdf } from '../print/service';
import { useSheetTemplate } from '../tools/CharactersPage';
import { useRun } from '../tools/common';
import { useMergeRows } from './FormsPage';

/** A page of ruled lines for the player's notes (real borders print reliably). */
const LINED = `<div>${'<div style="height:8.5mm;border-bottom:0.25mm solid rgba(0,0,0,.35)"></div>'.repeat(19)}</div>`;

/** "Deník postavy": a printable A5 booklet per character, front and back designs. */
export function DiaryTab({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const design = (useGameRecords('diary_design', game.id) ?? NONE)[0];
  if (!design) {
    return (
      <Stack align="flex-start">
        <Text c="dimmed">{t('diary.none')}</Text>
        {canEdit && (
          <Button
            onClick={() =>
              void run(() =>
                repo.createRecord({
                  kind: 'diary_design',
                  title: t('diary.title'),
                  game_id: game.id,
                }),
              )
            }
          >
            {t('diary.create')}
          </Button>
        )}
      </Stack>
    );
  }
  return <DiaryEditor key={`${design.id}:${design.rev}`} game={game} design={design} />;
}

function DiaryEditor({ game, design }: { game: RecordRow; design: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const context = usePrintContext(game);
  const { template } = useSheetTemplate(game);
  const profiles = useGameRecords('character_profile', game.id) ?? NONE;
  const { rows } = useMergeRows(game);
  const [fields, setFields] = useState(readData(diaryDesignKind, design));
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  // Never organizer-only sections: the diary is handed to the player.
  const sections = template.sections.filter(
    (section) => section.type === 'text' && section.audience !== 'organizers',
  );
  const look: Look = lookOf(fields.writer_id ? context.writers.get(fields.writer_id) : undefined);

  /** The pages of one character's booklet, padded with lined pages to a multiple of four. */
  function booklet(
    character: RecordRow,
    values: Record<string, string>,
    padding: number,
  ): PrintPiece[] {
    const data = readData(characterKind, character);
    const profile = profiles.find((row) => row.parent_id === character.id);
    const texts = {
      ...(profile ? readData(characterProfileKind, profile).sections : {}),
      ...data.sections,
    };
    const content = sections
      .filter(
        (section) => fields.section_keys.includes(section.key) && (texts[section.key] ?? '').trim(),
      )
      .map(
        (section) => `<h2>${escapeHtml(section.title)}</h2>${textHtml(texts[section.key] ?? '')}`,
      )
      .join('');
    const page = (html: string): PrintPiece => ({ size: 'A5', look, html });
    return [
      page(
        `<div style="text-align:center;padding-top:45mm"><h1 style="font-size:26pt">${escapeHtml(fillFields(fields.front_title, values))}</h1>${textHtml(fields.front_text, values)}</div>`,
      ),
      ...(content ? [page(content)] : []),
      ...Array.from({ length: fields.blank_pages + padding }, () => page(LINED)),
      page(
        `<div style="padding-top:60mm;text-align:center">${textHtml(fields.back_text, values)}</div>`,
      ),
    ];
  }

  async function print() {
    setBusy(true);
    await run(async () => {
      const selected = rows.filter(
        ({ character }) => chosen.length === 0 || chosen.includes(character.id),
      );
      const imposed: Uint8Array[] = [];
      for (const { character, fields: values } of selected) {
        // Render once to count pages, then add lined pages before the back cover.
        const first = await pageCount(await toPdf(booklet(character, values, 0)));
        const padding = bookletPageCount(first) - first;
        const bytes = padding
          ? await toPdf(booklet(character, values, padding))
          : await toPdf(booklet(character, values, 0));
        imposed.push(await imposeBooklet(bytes, bookletOrder(await pageCount(bytes))));
      }
      if (imposed.length === 0) throw new Error(t('diary.noCharacters'));
      await save(await mergePdfs(imposed), t('diary.fileName', { game: game.title }), 'pdf');
    });
    setBusy(false);
  }

  const sample = rows[0];
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Paper withBorder p="md">
          <Stack>
            <Text size="sm" c="dimmed">
              {t('diary.intro')}
            </Text>
            <TextInput
              label={t('diary.frontTitle')}
              description={t('diary.fieldsHint')}
              value={fields.front_title}
              readOnly={!canEdit}
              onChange={(event) => set('front_title', event.currentTarget.value)}
            />
            <Textarea
              label={t('diary.frontText')}
              autosize
              minRows={2}
              value={fields.front_text}
              readOnly={!canEdit}
              onChange={(event) => set('front_text', event.currentTarget.value)}
            />
            <MultiSelect
              label={t('diary.sections')}
              description={t('diary.sectionsHint')}
              data={sections.map((section) => ({ value: section.key, label: section.title }))}
              value={fields.section_keys}
              onChange={(value) => set('section_keys', value)}
              disabled={!canEdit}
            />
            <Group grow>
              <NumberInput
                label={t('diary.blankPages')}
                value={fields.blank_pages}
                min={0}
                max={60}
                onChange={(value) => set('blank_pages', Math.max(0, Number(value) || 0))}
                readOnly={!canEdit}
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
            </Group>
            <Textarea
              label={t('diary.backText')}
              autosize
              minRows={2}
              value={fields.back_text}
              readOnly={!canEdit}
              onChange={(event) => set('back_text', event.currentTarget.value)}
            />
            {canEdit && (
              <Group>
                <Button
                  onClick={() =>
                    void run(
                      () =>
                        repo.updateRecord(design.id, design.rev, {
                          data: { ...design.data, ...fields },
                        }),
                      t('common.saved'),
                    )
                  }
                >
                  {t('common.save')}
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack>
          <MultiSelect
            label={t('diary.characters')}
            placeholder={t('diary.allCharacters')}
            data={rows.map(({ character }) => ({ value: character.id, label: character.title }))}
            value={chosen}
            onChange={setChosen}
            searchable
          />
          <Button loading={busy} onClick={() => void print()} disabled={rows.length === 0}>
            {t('diary.print')}
          </Button>
          <Text size="xs" c="dimmed">
            {t('diary.printHint')}
          </Text>
          {sample && (
            <PaperPreview
              piece={
                booklet(sample.character, sample.fields, 0)[0] ?? { size: 'A5', look, html: '' }
              }
              width={300}
            />
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
