import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  locationSignKind,
  printJobKind,
  printJobStatuses,
  propDocumentKind,
  readData,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { sortForDelivery } from '@core/print/documents';
import type { PrintPiece } from '@core/print/html';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { NONE, useGameRecords } from '../data/hooks';
import { ExportMenu } from '../print/components';
import { documentPiece, phaseLabel, usePrintContext, type PrintContext } from '../print/pieces';
import { mergePdfs, toPdf } from '../print/service';
import { GameGate, useRun } from '../tools/common';
import { signPiece, signsPdf } from './SignsPage';

const STATUS_COLOR = { todo: 'orange', printed: 'blue', done: 'teal' } as const;

/** The print queue ("Tisková fronta"): what still needs printing, on what paper, how many. */
export function PrintQueuePage() {
  return <GameGate>{(game) => <Queue game={game} />}</GameGate>;
}

/** All pieces of a job: documents in delivery order (each copy), then signs. */
async function jobPdf(
  records: RecordRow[],
  context: PrintContext,
  placeOf: (row: RecordRow) => string,
): Promise<Uint8Array> {
  const documents = sortForDelivery(
    records.filter((row) => row.kind === 'prop_document'),
    [...context.phases.values()],
  );
  const pieces: PrintPiece[] = documents.flatMap((row) =>
    Array.from({ length: readData(propDocumentKind, row).copies }, () =>
      documentPiece(row, context),
    ),
  );
  const signs = records
    .filter((row) => row.kind === 'location_sign')
    .map((row) => signPiece(row, context, placeOf(row)));
  const parts: Uint8Array[] = [];
  if (pieces.length) parts.push(await toPdf(pieces));
  if (signs.length) parts.push(await signsPdf(signs));
  return parts.length === 1 && parts[0] ? parts[0] : mergePdfs(parts);
}

function Queue({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const context = usePrintContext(game);
  const targets = useLinkTargets();
  const jobs = useGameRecords('print_job', game.id) ?? NONE;
  const documents = useGameRecords('prop_document', game.id) ?? NONE;
  const signs = useGameRecords('location_sign', game.id) ?? NONE;
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const byId = new Map([...documents, ...signs].map((row) => [row.id, row]));
  const placeOf = (row: RecordRow) => {
    const data = readData(locationSignKind, row);
    return targets.find((target) => target.id === data.place_id)?.title ?? data.place_name;
  };
  const queued = new Set(jobs.flatMap((job) => readData(printJobKind, job).record_ids));
  const waiting = sortForDelivery(
    documents.filter(
      (row) => readData(propDocumentKind, row).status === 'final' && !queued.has(row.id),
    ),
    [...context.phases.values()],
  );
  const recordsOf = (job: RecordRow) =>
    readData(printJobKind, job)
      .record_ids.map((id) => byId.get(id))
      .filter((row): row is RecordRow => row !== undefined);

  async function markPrinted(job: RecordRow) {
    await run(async () => {
      await repo.updateRecord(job.id, job.rev, { data: { ...job.data, status: 'printed' } });
      for (const row of recordsOf(job)) {
        if (row.kind !== 'prop_document') continue;
        const status = readData(propDocumentKind, row).status;
        if (status === 'draft' || status === 'final') {
          await repo.updateRecord(row.id, row.rev, { data: { ...row.data, status: 'printed' } });
        }
      }
    }, t('print.markedPrinted'));
  }

  return (
    <Stack>
      <Title order={2}>
        {t('print.queueTitle')} · {game.title}
      </Title>
      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Title order={5}>{t('print.waiting')}</Title>
          {canEdit && waiting.length > 0 && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                void run(
                  () =>
                    repo.createRecord({
                      kind: 'print_job',
                      title: t('print.waitingJob'),
                      game_id: game.id,
                      data: { record_ids: waiting.map((row) => row.id) },
                    }),
                  t('print.queued'),
                )
              }
            >
              {t('print.queueAll', { count: waiting.length })}
            </Button>
          )}
        </Group>
        {waiting.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('print.nothingWaiting')}
          </Text>
        ) : (
          <Text size="sm" data-testid="waiting">
            {waiting
              .map((row) => `${readData(propDocumentKind, row).number} ${row.title}`)
              .join(' · ')}
          </Text>
        )}
      </Paper>
      {jobs.length === 0 ? (
        <Text c="dimmed">{t('print.emptyQueue')}</Text>
      ) : (
        <Table striped data-testid="print-jobs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('print.items')}</Table.Th>
              <Table.Th>{t('print.paper')}</Table.Th>
              <Table.Th>{t('print.copies')}</Table.Th>
              <Table.Th>{t('documents.phase')}</Table.Th>
              <Table.Th>{t('documents.status')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((job) => {
              const data = readData(printJobKind, job);
              const records = recordsOf(job);
              return (
                <Table.Tr key={job.id} data-testid="print-job">
                  <Table.Td>
                    <Text
                      size="sm"
                      fw={600}
                      style={{ cursor: canEdit ? 'pointer' : undefined }}
                      onClick={() => canEdit && setEditing(job)}
                    >
                      {job.title}
                    </Text>
                    {data.note && (
                      <Text size="xs" c="dimmed">
                        {data.note}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{records.length}</Table.Td>
                  <Table.Td>{data.paper}</Table.Td>
                  <Table.Td>{data.copies}</Table.Td>
                  <Table.Td>
                    {data.phase_id ? phaseLabel(context.phases.get(data.phase_id)) : ''}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[data.status]}>
                      {t(`print.statuses.${data.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <ExportMenu
                        title={job.title}
                        pdf={() => jobPdf(records, context, placeOf)}
                        disabled={records.length === 0}
                      />
                      {canEdit && data.status === 'todo' && (
                        <Button
                          variant="light"
                          leftSection={<IconCheck size={14} />}
                          onClick={() => void markPrinted(job)}
                        >
                          {t('print.markPrinted')}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <JobDialog
          key={editing.id}
          context={context}
          record={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function JobDialog({
  context,
  record,
  onClose,
}: {
  context: PrintContext;
  record: RecordRow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(readData(printJobKind, record));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function save() {
    const ok = await run(() =>
      repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={t('print.editJob')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Group grow>
          <TextInput
            label={t('print.paper')}
            placeholder={t('print.paperHint')}
            value={fields.paper}
            onChange={(event) => set('paper', event.currentTarget.value)}
          />
          <NumberInput
            label={t('print.copies')}
            value={fields.copies}
            min={1}
            onChange={(value) => set('copies', Math.max(1, Number(value) || 1))}
          />
        </Group>
        <Group grow>
          <Select
            label={t('documents.phase')}
            data={[...context.phases.values()].map((row) => ({
              value: row.id,
              label: phaseLabel(row),
            }))}
            value={fields.phase_id}
            onChange={(value) => set('phase_id', value)}
            clearable
          />
          <Select
            label={t('documents.status')}
            data={printJobStatuses.map((value) => ({ value, label: t(`print.statuses.${value}`) }))}
            value={fields.status}
            onChange={(value) => value && set('status', value)}
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label={t('print.note')}
          value={fields.note}
          onChange={(event) => set('note', event.currentTarget.value)}
        />
        <Group justify="space-between">
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t('common.delete')}
            onClick={() => void run(() => repo.trashRecord(record)).then((ok) => ok && onClose())}
          >
            <IconTrash size={16} />
          </ActionIcon>
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()}>{t('common.save')}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
