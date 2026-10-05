import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { archiveKind, archivePartKind, fileKind, readData, type PartSource } from '@core/kinds';
import type { RecordRow } from '@core/model';
import {
  nextItem,
  pageRange,
  placeParts,
  shelfMark,
  sortParts,
  type PlacedPart,
} from '@core/print/archive';
import { escapeHtml, richHtml, textHtml, type PrintPiece } from '@core/print/html';
import { emptyDoc } from '@core/richtext';
import { useTeam } from '../app/workspace';
import { useDrive } from '../drive/context';
import { RichText } from '../components/RichText';
import { NONE, useGameRecords, useRecords, useTeamRecords } from '../data/hooks';
import { documentPiece, lookOf, usePrintContext } from '../print/pieces';
import { mergePdfs, pageCount, save, stampPages, toPdf } from '../print/service';
import { GameGate, inScope, useAskName, useRun } from '../tools/common';

/** Archive builder ("Archiv"): many documents bound into one paginated PDF. */
export function ArchivePage() {
  return <GameGate>{(game) => <Archives game={game} />}</GameGate>;
}

function Archives({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const archives = (useRecords('archive') ?? NONE).filter((row) => inScope(row, game));
  const [chosen, setChosen] = useState<string | null>(null);
  const archive = archives.find((row) => row.id === chosen) ?? archives[0];
  const create = () =>
    ask(t('archive.newArchive'), (name) => {
      void run(async () => {
        const row = await repo.createRecord({ kind: 'archive', title: name, game_id: game.id });
        setChosen(row.id);
      });
    });
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('archive.title')}</Title>
        <Group gap="xs">
          {archives.length > 1 && (
            <Select
              aria-label={t('archive.title')}
              data={archives.map((row) => ({ value: row.id, label: row.title }))}
              value={archive?.id ?? null}
              onChange={setChosen}
              allowDeselect={false}
            />
          )}
          {canEdit && (
            <Button variant="light" leftSection={<IconPlus size={14} />} onClick={create}>
              {t('archive.newArchive')}
            </Button>
          )}
        </Group>
      </Group>
      <Text size="sm" c="dimmed">
        {t('archive.intro')}
      </Text>
      {archive ? (
        <Archive key={archive.id} game={game} archive={archive} />
      ) : (
        <Text c="dimmed">{t('archive.none')}</Text>
      )}
    </Stack>
  );
}

function Archive({ game, archive }: { game: RecordRow; archive: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const { files } = useDrive();
  const run = useRun();
  const context = usePrintContext(game);
  const parts = sortParts(
    useTeamRecords(
      (row) => row.kind === 'archive_part' && row.parent_id === archive.id,
      `parts:${archive.id}`,
    ) ?? NONE,
  );
  const documents = useGameRecords('prop_document', game.id) ?? NONE;
  const fileRecords =
    useTeamRecords(
      (row) => row.kind === 'file' && readData(fileKind, row).mime === 'application/pdf',
      'pdf-files',
    ) ?? NONE;
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const look = lookOf(undefined);
  const archiveData = readData(archiveKind, archive);

  const titleOf = (part: RecordRow) => {
    const source = readData(archivePartKind, part).source;
    if (source.type === 'document')
      return documents.find((row) => row.id === source.id)?.title ?? '?';
    if (source.type === 'file')
      return fileRecords.find((row) => row.id === source.id)?.title ?? '?';
    return part.title;
  };

  /** One part as a PDF (documents and texts are printed, drive PDFs used as they are). */
  async function partPdf(part: RecordRow): Promise<Uint8Array> {
    const source: PartSource = readData(archivePartKind, part).source;
    if (source.type === 'file') {
      const record = fileRecords.find((row) => row.id === source.id);
      if (!record) throw new Error(t('archive.missingSource', { title: part.title }));
      return (await files.getBytes(record)).data;
    }
    if (source.type === 'document') {
      const document = documents.find((row) => row.id === source.id);
      if (!document) throw new Error(t('archive.missingSource', { title: part.title }));
      return toPdf([documentPiece(document, context, { strip: false })]);
    }
    return toPdf([{ size: 'A4', look, html: richHtml(source.body) }]);
  }

  function listPiece(placed: PlacedPart[], heading: string, guide: boolean): PrintPiece {
    const byId = new Map(parts.map((part) => [part.id, part]));
    const rows = placed
      .map((item) => {
        const part = byId.get(item.id);
        const purpose = part ? readData(archivePartKind, part).purpose : '';
        return `<tr><td>${escapeHtml(item.shelfMark)}</td><td>${escapeHtml(part ? titleOf(part) : '')}</td><td>${escapeHtml(pageRange(item))}</td>${guide ? `<td>${escapeHtml(purpose)}</td>` : ''}</tr>`;
      })
      .join('');
    const head = [
      t('archive.shelfMark'),
      t('common.name'),
      t('archive.pages'),
      ...(guide ? [t('archive.purpose')] : []),
    ]
      .map((label) => `<th>${escapeHtml(label)}</th>`)
      .join('');
    return {
      size: 'A4',
      look,
      html: `<h2>${escapeHtml(heading)}</h2>${guide ? '' : textHtml(archiveData.intro)}<table class="list"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  /** Builds the archive (or only the parts not printed yet) with page numbers and shelf marks. */
  async function build(
    mode: 'all' | 'supplement',
  ): Promise<{ bytes: Uint8Array; placed: PlacedPart[] }> {
    const pdfs = new Map<string, Uint8Array>();
    const counts = new Map<string, number>();
    for (const part of parts) {
      const printed = readData(archivePartKind, part).printed;
      if (mode === 'supplement' && printed) continue;
      const bytes = await partPdf(part);
      pdfs.set(part.id, bytes);
      counts.set(part.id, await pageCount(bytes));
    }
    const placed = placeParts(parts, counts).filter((item) => mode === 'all' || !item.printed);
    if (placed.length === 0) throw new Error(t('archive.nothingNew'));
    const front = await toPdf([
      listPiece(
        placed,
        mode === 'all'
          ? t('archive.inventory', { title: archive.title })
          : t('archive.supplementInventory', { title: archive.title }),
        false,
      ),
    ]);
    const frontPages = await pageCount(front);
    const ordered = [...placed].sort((a, b) => a.firstPage - b.firstPage);
    // In a full rebuild, printed parts are rendered again but keep their page numbers.
    const bodies = ordered.map((item) => pdfs.get(item.id) ?? new Uint8Array());
    const merged = await mergePdfs([front, ...bodies]);
    const stamps = [];
    let index = frontPages;
    for (const [position, item] of ordered.entries()) {
      const pages = await pageCount(bodies[position] ?? new Uint8Array());
      for (let page = 0; page < pages; page += 1) {
        stamps.push({
          page: index + page,
          bottom: String(item.firstPage + page),
          ...(page === 0 ? { topRight: item.shelfMark } : {}),
        });
      }
      index += pages;
    }
    return { bytes: await stampPages(merged, stamps), placed };
  }

  function exportArchive(mode: 'all' | 'supplement') {
    setBusy(true);
    void run(async () => {
      const { bytes, placed } = await build(mode);
      const saved = await save(
        bytes,
        mode === 'all' ? archive.title : `${archive.title} – ${t('archive.supplement')}`,
        'pdf',
      );
      const fresh = placed.filter((item) => !item.printed);
      if (saved && canEdit && fresh.length) {
        modals.openConfirmModal({
          title: t('archive.markPrintedTitle'),
          children: <Text size="sm">{t('archive.markPrintedBody', { count: fresh.length })}</Text>,
          labels: { confirm: t('archive.markPrinted'), cancel: t('archive.notYet') },
          onConfirm: () => {
            void run(async () => {
              const at = new Date().toISOString();
              for (const item of fresh) {
                const part = parts.find((row) => row.id === item.id);
                if (!part) continue;
                await repo.updateRecord(part.id, part.rev, {
                  data: {
                    ...part.data,
                    printed: { first_page: item.firstPage, last_page: item.lastPage, at },
                  },
                });
              }
            }, t('common.saved'));
          },
        });
      }
    }).finally(() => setBusy(false));
  }

  function exportGuide() {
    setBusy(true);
    void run(async () => {
      const counts = new Map<string, number>();
      for (const part of parts) {
        if (readData(archivePartKind, part).printed) continue;
        counts.set(part.id, await pageCount(await partPdf(part)));
      }
      const bytes = await toPdf([
        listPiece(placeParts(parts, counts), t('archive.guide', { title: archive.title }), true),
      ]);
      await save(bytes, `${archive.title} – ${t('archive.guideShort')}`, 'pdf');
    }).finally(() => setBusy(false));
  }

  const unprinted = parts.filter((part) => !readData(archivePartKind, part).printed).length;
  return (
    <Paper withBorder p="md">
      <Stack>
        <Group justify="space-between">
          <Title order={4}>{archive.title}</Title>
          <Group gap="xs">
            <Button
              variant="default"
              loading={busy}
              onClick={exportGuide}
              disabled={parts.length === 0}
            >
              {t('archive.exportGuide')}
            </Button>
            <Button
              variant="default"
              loading={busy}
              onClick={() => exportArchive('supplement')}
              disabled={unprinted === 0 || unprinted === parts.length}
            >
              {t('archive.exportSupplement')}
            </Button>
            <Button
              loading={busy}
              onClick={() => exportArchive('all')}
              disabled={parts.length === 0}
            >
              {t('archive.exportAll')}
            </Button>
          </Group>
        </Group>
        {canEdit && <IntroEditor key={`${archive.id}:${archive.rev}`} archive={archive} />}
        {parts.length === 0 ? (
          <Text c="dimmed">{t('archive.empty')}</Text>
        ) : (
          <Table striped highlightOnHover data-testid="archive-parts">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={80}>{t('archive.shelfMark')}</Table.Th>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('archive.source')}</Table.Th>
                <Table.Th>{t('archive.purpose')}</Table.Th>
                <Table.Th w={130}>{t('archive.printed')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parts.map((part) => {
                const data = readData(archivePartKind, part);
                return (
                  <Table.Tr
                    key={part.id}
                    style={{ cursor: canEdit ? 'pointer' : undefined }}
                    onClick={() => canEdit && setEditing(part)}
                  >
                    <Table.Td fw={700}>{shelfMark(data.section, data.item)}</Table.Td>
                    <Table.Td>{titleOf(part)}</Table.Td>
                    <Table.Td>{t(`archive.sources.${data.source.type}`)}</Table.Td>
                    <Table.Td>
                      <Text size="xs" lineClamp={2}>
                        {data.purpose}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {data.printed ? (
                        <Badge size="sm" variant="light" color="grape">
                          {t('archive.printedPages', {
                            pages: pageRange({
                              firstPage: data.printed.first_page,
                              lastPage: data.printed.last_page,
                            }),
                          })}
                        </Badge>
                      ) : (
                        <Badge size="sm" variant="light" color="gray">
                          {t('archive.new')}
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
        {canEdit && (
          <Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditing('new')}
            >
              {t('archive.addPart')}
            </Button>
          </Group>
        )}
      </Stack>
      {editing && (
        <PartDialog
          game={game}
          archive={archive}
          parts={parts}
          documents={documents}
          fileRecords={fileRecords}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Paper>
  );
}

function IntroEditor({ archive }: { archive: RecordRow }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [intro, setIntro] = useState(readData(archiveKind, archive).intro);
  return (
    <Textarea
      label={t('archive.introLabel')}
      description={t('archive.introHint')}
      autosize
      minRows={2}
      value={intro}
      onChange={(event) => setIntro(event.currentTarget.value)}
      onBlur={() =>
        intro !== readData(archiveKind, archive).intro &&
        void run(() =>
          repo.updateRecord(archive.id, archive.rev, { data: { ...archive.data, intro } }),
        )
      }
    />
  );
}

function PartDialog({
  game,
  archive,
  parts,
  documents,
  fileRecords,
  record,
  onClose,
}: {
  game: RecordRow;
  archive: RecordRow;
  parts: RecordRow[];
  documents: RecordRow[];
  fileRecords: RecordRow[];
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const initial = readData(archivePartKind, record ?? { data: {} });
  const [section, setSection] = useState(initial.section);
  const [item, setItem] = useState(record ? initial.item : nextItem(parts, initial.section));
  const [type, setType] = useState<PartSource['type']>(record ? initial.source.type : 'document');
  const [sourceId, setSourceId] = useState<string | null>(
    initial.source.type === 'text' ? null : initial.source.id,
  );
  const [body, setBody] = useState(
    initial.source.type === 'text' ? initial.source.body : emptyDoc(),
  );
  const [title, setTitle] = useState(record?.title ?? '');
  const [purpose, setPurpose] = useState(initial.purpose);
  const frozen = initial.printed !== null;
  const source: PartSource | null =
    type === 'text' ? { type, body } : sourceId ? { type, id: sourceId } : null;
  const sourceTitle =
    type === 'document'
      ? documents.find((row) => row.id === sourceId)?.title
      : type === 'file'
        ? fileRecords.find((row) => row.id === sourceId)?.title
        : title;

  async function save() {
    if (!source) return;
    const data = { ...(record?.data ?? {}), section, item, source, purpose };
    const name = (sourceTitle ?? title).trim() || t('archive.untitled');
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title: name, data })
        : repo.createRecord({
            kind: 'archive_part',
            title: name,
            game_id: game.id,
            parent_id: archive.id,
            data,
          }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('archive.editPart') : t('archive.addPart')}
      size="lg"
    >
      <Stack>
        <Group grow>
          <NumberInput
            label={t('archive.section')}
            description={t('archive.sectionHint')}
            value={section}
            min={1}
            onChange={(value) => {
              const next = Math.max(1, Number(value) || 1);
              setSection(next);
              if (!record) setItem(nextItem(parts, next));
            }}
          />
          <NumberInput
            label={t('archive.item')}
            value={item}
            min={1}
            onChange={(value) => setItem(Math.max(1, Number(value) || 1))}
          />
          <TextInput label={t('archive.shelfMark')} value={shelfMark(section, item)} readOnly />
        </Group>
        <SegmentedControl
          value={type}
          onChange={(value) => {
            setType(value);
            setSourceId(null);
          }}
          data={(['document', 'file', 'text'] as const).map((value) => ({
            value,
            label: t(`archive.sources.${value}`),
          }))}
          disabled={frozen}
        />
        {type === 'document' && (
          <Select
            label={t('archive.document')}
            data={documents.map((row) => ({ value: row.id, label: row.title }))}
            value={sourceId}
            onChange={setSourceId}
            searchable
          />
        )}
        {type === 'file' && (
          <Select
            label={t('archive.file')}
            description={t('archive.fileHint')}
            data={fileRecords.map((row) => ({ value: row.id, label: row.title }))}
            value={sourceId}
            onChange={setSourceId}
            searchable
          />
        )}
        {type === 'text' && (
          <>
            <TextInput
              label={t('common.name')}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <RichText value={body} onChange={setBody} editable />
          </>
        )}
        <Textarea
          label={t('archive.purpose')}
          description={t('archive.purposeHint')}
          autosize
          minRows={2}
          value={purpose}
          onChange={(event) => setPurpose(event.currentTarget.value)}
        />
        {frozen && (
          <Text size="xs" c="dimmed">
            {t('archive.frozen')}
          </Text>
        )}
        <Group justify="space-between">
          {record ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() => void run(() => repo.trashRecord(record)).then((ok) => ok && onClose())}
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
            <Button disabled={!source} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
