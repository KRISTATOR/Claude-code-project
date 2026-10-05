import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowLeft, IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  deliveryMethods,
  documentStatuses,
  documentTypes,
  paperSizes,
  propDocumentKind,
  readData,
  readSecret,
  type DocumentStatus,
} from '@core/kinds';
import type { RecordRow, RecordSecretRow } from '@core/model';
import {
  duplicateNumbers,
  nextNumber,
  selectDocuments,
  sortForDelivery,
} from '@core/print/documents';
import { matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useGameRecords, useRecord, useSecret } from '../data/hooks';
import { ExportMenu, PaperPreview, PdfPreviewButton } from '../print/components';
import {
  documentDocx,
  documentPiece,
  phaseLabel,
  recipientsLabel,
  usePrintContext,
  type PrintContext,
} from '../print/pieces';
import { Field, GameGate, useAskName, useRun } from '../tools/common';

export const STATUS_COLOR: Record<DocumentStatus, string> = {
  draft: 'gray',
  final: 'blue',
  printed: 'grape',
  delivered: 'teal',
};

/** In-game documents ("Dokumenty"): letters, decrees, speeches, forms… */
export function DocumentsPage() {
  const { id } = useParams();
  return (
    <GameGate>
      {(game) => (id ? <DocumentDetail game={game} id={id} /> : <DocumentList game={game} />)}
    </GameGate>
  );
}

function DocumentList({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const context = usePrintContext(game);
  const documents = useGameRecords('prop_document', game.id) ?? NONE;
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const phases = [...context.phases.values()];
  const shown = sortForDelivery(
    selectDocuments(documents, { phaseId, characterId }).filter((row) => {
      const data = readData(propDocumentKind, row);
      return (
        (!status || data.status === status) &&
        (!type || data.type === type) &&
        (!filter || matchesQuery(`${data.number} ${row.title} ${data.recipient}`, filter))
      );
    }),
    phases,
  );
  const chosen = selected.length ? shown.filter((row) => selected.includes(row.id)) : shown;
  const duplicates = duplicateNumbers(documents);
  const exportTitle = [
    t('documents.title'),
    phaseId ? phaseLabel(context.phases.get(phaseId)) : '',
    characterId ? (context.characters.get(characterId)?.title ?? '') : '',
  ]
    .filter(Boolean)
    .join(' – ');

  function create() {
    ask(t('documents.newDocument'), (name) => {
      void run(async () => {
        const row = await repo.createRecord({
          kind: 'prop_document',
          title: name,
          game_id: game.id,
          data: {
            number: nextNumber(documents),
            ...(phaseId ? { phase_id: phaseId } : {}),
            ...(characterId ? { character_ids: [characterId] } : {}),
          },
        });
        void navigate(`/dokumenty/${row.id}`);
      });
    });
  }

  function queue() {
    void run(
      () =>
        repo.createRecord({
          kind: 'print_job',
          title: exportTitle,
          game_id: game.id,
          data: { record_ids: chosen.map((row) => row.id), phase_id: phaseId },
        }),
      t('print.queued'),
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('documents.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={create}>
            {t('documents.newDocument')}
          </Button>
        )}
      </Group>
      <Group gap="xs" align="flex-end">
        <TextInput
          placeholder={t('documents.filter')}
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          w={180}
        />
        <Select
          placeholder={t('documents.phase')}
          aria-label={t('documents.phase')}
          data={phases.map((row) => ({ value: row.id, label: phaseLabel(row) }))}
          value={phaseId}
          onChange={setPhaseId}
          clearable
          w={170}
        />
        <Select
          placeholder={t('documents.forCharacter')}
          aria-label={t('documents.forCharacter')}
          data={[...context.characters.values()].map((row) => ({
            value: row.id,
            label: row.title,
          }))}
          value={characterId}
          onChange={setCharacterId}
          clearable
          searchable
          w={190}
        />
        <Select
          placeholder={t('documents.type')}
          aria-label={t('documents.type')}
          data={documentTypes.map((value) => ({ value, label: t(`documents.types.${value}`) }))}
          value={type}
          onChange={setType}
          clearable
          w={150}
        />
        <Select
          placeholder={t('documents.status')}
          aria-label={t('documents.status')}
          data={documentStatuses.map((value) => ({
            value,
            label: t(`documents.statuses.${value}`),
          }))}
          value={status}
          onChange={setStatus}
          clearable
          w={140}
        />
      </Group>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {selected.length
            ? t('documents.selected', { count: chosen.length })
            : t('documents.shown', { count: shown.length })}
        </Text>
        <Group gap="xs">
          <PdfPreviewButton pieces={() => chosen.map((row) => documentPiece(row, context))} />
          <ExportMenu
            title={exportTitle}
            disabled={chosen.length === 0}
            pdf={() => chosen.map((row) => documentPiece(row, context))}
            docx={() => chosen.map((row) => documentDocx(row, context))}
          />
          {canEdit && (
            <Button
              variant="light"
              leftSection={<IconPrinter size={14} />}
              disabled={chosen.length === 0}
              onClick={queue}
            >
              {t('print.addToQueue')}
            </Button>
          )}
        </Group>
      </Group>
      {duplicates.size > 0 && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="sm">
            {t('documents.duplicates', { numbers: [...duplicates.keys()].join(', ') })}
          </Text>
        </Alert>
      )}
      {shown.length === 0 ? (
        <Text c="dimmed">{t('documents.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="document-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={32}>
                <Checkbox
                  aria-label={t('documents.selectAll')}
                  checked={selected.length > 0 && selected.length === shown.length}
                  indeterminate={selected.length > 0 && selected.length < shown.length}
                  onChange={() => setSelected(selected.length ? [] : shown.map((row) => row.id))}
                />
              </Table.Th>
              <Table.Th w={60}>{t('documents.number')}</Table.Th>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('documents.type')}</Table.Th>
              <Table.Th>{t('documents.phase')}</Table.Th>
              <Table.Th>{t('documents.forCharacter')}</Table.Th>
              <Table.Th>{t('documents.status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((row) => {
              const data = readData(propDocumentKind, row);
              return (
                <Table.Tr key={row.id} data-testid="document-row" data-number={data.number}>
                  <Table.Td>
                    <Checkbox
                      aria-label={row.title}
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id)
                            ? current.filter((item) => item !== row.id)
                            : [...current, row.id],
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600} {...(duplicates.has(data.number) ? { c: 'orange' } : {})}>
                      {data.number}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} to={`/dokumenty/${row.id}`}>
                      {row.title}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{t(`documents.types.${data.type}`)}</Table.Td>
                  <Table.Td>
                    {data.phase_id ? phaseLabel(context.phases.get(data.phase_id)) : ''}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>
                      {recipientsLabel(data.character_ids, context) || data.recipient}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[data.status]}>
                      {t(`documents.statuses.${data.status}`)}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function DocumentDetail({ game, id }: { game: RecordRow; id: string }) {
  const { t } = useTranslation();
  const record = useRecord(id);
  const secret = useSecret(id);
  const context = usePrintContext(game);
  if (!record || record.kind !== 'prop_document') {
    return (
      <Anchor component={Link} to="/dokumenty">
        {t('documents.back')}
      </Anchor>
    );
  }
  return (
    <DocumentEditor
      key={`${record.id}:${record.rev}:${secret?.rev ?? 0}`}
      game={game}
      record={record}
      secret={secret}
      context={context}
    />
  );
}

function DocumentEditor({
  game,
  record,
  secret,
  context,
}: {
  game: RecordRow;
  record: RecordRow;
  secret: RecordSecretRow | undefined;
  context: PrintContext;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const data = readData(propDocumentKind, record);
  const notes = readSecret(propDocumentKind, secret).notes;
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(data);
  const [secretNotes, setSecretNotes] = useState(notes);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const draft: RecordRow = { ...record, title, data: { ...record.data, ...fields } };
  const piece = documentPiece(draft, context);

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      });
      if (secretNotes !== notes) await repo.saveSecret(record.id, { notes: secretNotes });
    }, t('common.saved'));
  }
  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);
  const phases = [...context.phases.values()];
  const writers = [...context.writers.values()];

  return (
    <Stack>
      <Group justify="space-between">
        <Anchor component={Link} to="/dokumenty" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={14} />
            {t('documents.back')}
          </Group>
        </Anchor>
        <Group gap="xs">
          <PdfPreviewButton pieces={() => [piece]} />
          <ExportMenu
            title={`${fields.number ? `${fields.number} ` : ''}${title}`}
            pdf={() => [piece]}
            docx={() => [documentDocx(draft, context)]}
          />
        </Group>
      </Group>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper withBorder p="md">
            <Stack>
              <Group grow align="flex-start">
                <TextInput
                  label={t('documents.number')}
                  value={fields.number}
                  readOnly={!canEdit}
                  onChange={(event) => set('number', event.currentTarget.value)}
                  maw={110}
                />
                <TextInput
                  label={t('common.name')}
                  value={title}
                  readOnly={!canEdit}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </Group>
              <Group grow align="flex-start">
                <Select
                  label={t('documents.type')}
                  data={documentTypes.map((value) => ({
                    value,
                    label: t(`documents.types.${value}`),
                  }))}
                  value={fields.type}
                  onChange={(value) => value && set('type', value)}
                  allowDeselect={false}
                  disabled={!canEdit}
                />
                <Select
                  label={t('documents.status')}
                  data={documentStatuses.map((value) => ({
                    value,
                    label: t(`documents.statuses.${value}`),
                  }))}
                  value={fields.status}
                  onChange={(value) => value && set('status', value)}
                  allowDeselect={false}
                  disabled={!canEdit}
                />
                <Select
                  label={t('documents.phase')}
                  data={phases.map((row) => ({ value: row.id, label: phaseLabel(row) }))}
                  value={fields.phase_id}
                  onChange={(value) => set('phase_id', value)}
                  clearable
                  disabled={!canEdit}
                />
              </Group>
              <Group grow align="flex-start">
                <Select
                  label={t('documents.writer')}
                  description={
                    <Anchor component={Link} to="/pisatele" size="xs">
                      {t('documents.writersLink')}
                    </Anchor>
                  }
                  data={writers.map((row) => ({ value: row.id, label: row.title }))}
                  value={fields.writer_id}
                  onChange={(value) => set('writer_id', value)}
                  clearable
                  disabled={!canEdit}
                />
                <TextInput
                  label={t('documents.author')}
                  description={t('documents.authorHint')}
                  value={fields.author_name}
                  readOnly={!canEdit}
                  onChange={(event) => set('author_name', event.currentTarget.value)}
                />
              </Group>
              <Group grow align="flex-start">
                <TextInput
                  label={t('documents.recipient')}
                  description={t('documents.recipientHint')}
                  value={fields.recipient}
                  readOnly={!canEdit}
                  onChange={(event) => set('recipient', event.currentTarget.value)}
                />
                <MultiSelect
                  label={t('documents.realRecipients')}
                  description={t('documents.realRecipientsHint')}
                  data={[...context.characters.values()].map((row) => ({
                    value: row.id,
                    label: row.title,
                  }))}
                  value={fields.character_ids}
                  onChange={(value) => set('character_ids', value)}
                  searchable
                  disabled={!canEdit}
                />
              </Group>
              <Group grow align="flex-start">
                <Select
                  label={t('documents.delivery')}
                  data={deliveryMethods.map((value) => ({
                    value,
                    label: t(`documents.deliveries.${value}`),
                  }))}
                  value={fields.delivery}
                  onChange={(value) => value && set('delivery', value)}
                  allowDeselect={false}
                  disabled={!canEdit}
                />
                <TextInput
                  label={t('documents.deliveryNote')}
                  value={fields.delivery_note}
                  readOnly={!canEdit}
                  onChange={(event) => set('delivery_note', event.currentTarget.value)}
                />
                <NumberInput
                  label={t('documents.deliveryOrder')}
                  value={fields.delivery_order}
                  onChange={(value) => set('delivery_order', Number(value) || 0)}
                  readOnly={!canEdit}
                  maw={120}
                />
              </Group>
              <Group grow align="flex-start">
                <TextInput
                  label={t('documents.date')}
                  description={t('documents.dateHint')}
                  value={fields.in_world_date}
                  readOnly={!canEdit}
                  onChange={(event) => set('in_world_date', event.currentTarget.value)}
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
                <NumberInput
                  label={t('documents.copies')}
                  value={fields.copies}
                  min={1}
                  onChange={(value) => set('copies', Math.max(1, Number(value) || 1))}
                  readOnly={!canEdit}
                  maw={100}
                />
              </Group>
              <RichText
                value={fields.body}
                onChange={(value) => set('body', value)}
                editable={canEdit}
                selfId={record.id}
                minHeight={240}
                data-testid="document-body"
              />
              {isOrganizer && (
                <Field label={t('documents.notes')} value={secretNotes} onValue={setSecretNotes} />
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
                        void navigate('/dokumenty');
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
            <PaperPreview piece={piece} width={fields.paper_size === 'A5' ? 360 : 440} />
            {isOrganizer && (
              <Paper withBorder p="md">
                <VisibilityEditor record={record} />
              </Paper>
            )}
            <Text size="xs" c="dimmed">
              {t('documents.gameNote', { game: game.title })}
            </Text>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
