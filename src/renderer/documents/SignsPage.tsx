import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { locationSignKind, readData, signSizes } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { docText } from '@core/richtext';
import { escapeHtml, richHtml, type PrintPiece } from '@core/print/html';
import { useTeam } from '../app/workspace';
import { RichText, useLinkTargets } from '../components/RichText';
import { NONE, useGameRecords } from '../data/hooks';
import { ExportMenu, PaperPreview } from '../print/components';
import { lookOf, usePrintContext, type PrintContext } from '../print/pieces';
import { imposeGrid, mergePdfs, toPdf } from '../print/service';
import { GameGate, useRun } from '../tools/common';

/** A sign as a printed piece: the place in large letters, then the rule. */
export function signPiece(sign: RecordRow, context: PrintContext, placeName: string): PrintPiece {
  const data = readData(locationSignKind, sign);
  const look = lookOf(data.writer_id ? context.writers.get(data.writer_id) : undefined);
  // Signs are read from a distance: never smaller than 16 pt on a card, 22 pt on A5/A4.
  const minimum = data.size === 'card' ? 16 : 22;
  return {
    size: data.size === 'card' ? 'A6-landscape' : data.size,
    look: { ...look, sizePt: Math.max(look.sizePt, minimum) },
    html: `<h1 style="text-align:center;margin-top:0;font-size:1.8em">${escapeHtml(placeName || sign.title)}</h1><div style="text-align:center">${richHtml(data.body)}</div>`,
  };
}

/** Prints signs: cards four to an A4 sheet, bigger signs one per page. */
export async function signsPdf(pieces: PrintPiece[]): Promise<Uint8Array> {
  const cards = pieces.filter((piece) => piece.size === 'A6-landscape');
  const pages = pieces.filter((piece) => piece.size !== 'A6-landscape');
  const parts: Uint8Array[] = [];
  if (cards.length) parts.push(await imposeGrid(await toPdf(cards)));
  if (pages.length) parts.push(await toPdf(pages));
  return parts.length === 1 && parts[0] ? parts[0] : mergePdfs(parts);
}

/** Location signs ("Cedule"): short rules posted at physical places. */
export function SignsPage() {
  return <GameGate>{(game) => <Signs game={game} />}</GameGate>;
}

function Signs({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const context = usePrintContext(game);
  const targets = useLinkTargets();
  const signs = useGameRecords('location_sign', game.id) ?? NONE;
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const placeOf = (row: RecordRow) => {
    const data = readData(locationSignKind, row);
    return targets.find((target) => target.id === data.place_id)?.title ?? data.place_name;
  };
  const chosen = selected.length ? signs.filter((row) => selected.includes(row.id)) : signs;
  const pieces = () => chosen.map((row) => signPiece(row, context, placeOf(row)));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('signs.title')} · {game.title}
        </Title>
        <Group gap="xs">
          <ExportMenu
            title={t('signs.title')}
            pdf={() => signsPdf(pieces())}
            disabled={chosen.length === 0}
          />
          {canEdit && (
            <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
              {t('signs.newSign')}
            </Button>
          )}
        </Group>
      </Group>
      <Text size="sm" c="dimmed">
        {t('signs.intro')}
      </Text>
      {signs.length === 0 ? (
        <Text c="dimmed">{t('signs.empty')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {signs.map((row) => {
            const data = readData(locationSignKind, row);
            return (
              <Card key={row.id} withBorder data-testid="sign">
                <Group justify="space-between" wrap="nowrap" mb={4}>
                  <Checkbox
                    label={<Text fw={700}>{placeOf(row) || row.title}</Text>}
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.id)
                          ? current.filter((item) => item !== row.id)
                          : [...current, row.id],
                      )
                    }
                  />
                  <Badge size="xs" variant="light">
                    {t(`signs.sizes.${data.size}`)}
                  </Badge>
                </Group>
                <Text size="sm" lineClamp={4} style={{ whiteSpace: 'pre-wrap' }}>
                  {docText(data.body)}
                </Text>
                {canEdit && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    mt="xs"
                    onClick={() => setEditing(row)}
                  >
                    {t('common.edit')}
                  </Button>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      )}
      {editing && (
        <SignDialog
          game={game}
          context={context}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function SignDialog({
  game,
  context,
  record,
  onClose,
}: {
  game: RecordRow;
  context: PrintContext;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const places = useLinkTargets().filter((target) => target.kind === 'page');
  const [fields, setFields] = useState(readData(locationSignKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const placeName =
    places.find((place) => place.id === fields.place_id)?.title ?? fields.place_name;
  const title = placeName || t('signs.untitled');
  const draft: RecordRow = {
    ...(record ?? ({ id: 'new', kind: 'location_sign', title } as RecordRow)),
    title,
    data: fields,
  };

  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title, data: { ...record.data, ...fields } })
        : repo.createRecord({ kind: 'location_sign', title, game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={record ? t('signs.edit') : t('signs.newSign')} size="xl">
      <Group align="flex-start" grow>
        <Stack>
          <Select
            label={t('signs.place')}
            description={t('signs.placeHint')}
            data={places.map((place) => ({ value: place.id, label: place.title }))}
            value={fields.place_id}
            onChange={(value) => set('place_id', value)}
            searchable
            clearable
          />
          {!fields.place_id && (
            <TextInput
              label={t('signs.placeName')}
              value={fields.place_name}
              onChange={(event) => set('place_name', event.currentTarget.value)}
              data-autofocus
            />
          )}
          <RichText
            value={fields.body}
            onChange={(value) => set('body', value)}
            editable
            minHeight={100}
          />
          <Group grow>
            <Select
              label={t('signs.size')}
              data={signSizes.map((value) => ({ value, label: t(`signs.sizes.${value}`) }))}
              value={fields.size}
              onChange={(value) => value && set('size', value)}
              allowDeselect={false}
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
            />
          </Group>
          <Group justify="space-between">
            {record ? (
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t('common.delete')}
                onClick={() =>
                  void run(() => repo.trashRecord(record)).then((ok) => ok && onClose())
                }
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
              <Button onClick={() => void save()}>{t('common.save')}</Button>
            </Group>
          </Group>
        </Stack>
        <PaperPreview piece={signPiece(draft, context, placeName)} width={360} />
      </Group>
    </Modal>
  );
}
