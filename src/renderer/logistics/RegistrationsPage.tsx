import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Modal,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconFileImport, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameKind, readData } from '@core/kinds';
import type { CsvTable } from '@core/logistics/csv';
import {
  guessMapping,
  importRegistrations,
  registrationFields,
  type ColumnMapping,
} from '@core/logistics/registrations';
import {
  registrationStatuses,
  type RecordRow,
  type RegistrationRow,
  type RegistrationStatus,
} from '@core/model';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, usePeople, useRegistrations } from '../data/hooks';
import type { RegistrationPatch } from '../data/repo';
import { GameGate, useRun } from '../tools/common';
import { AllergenBadges, readCsvFile, useAllergenOptions } from './common';

const STATUS_COLOR: Record<RegistrationStatus, string> = {
  applied: 'gray',
  confirmed: 'blue',
  paid: 'teal',
  assigned: 'grape',
  cancelled: 'red',
};

/** Registrations ("Přihlášky"): personal data, organizers only. */
export function RegistrationsPage() {
  return <GameGate>{(game) => <Registrations game={game} />}</GameGate>;
}

/** The first day of the game, for ages computed from birth dates. */
function gameStart(game: RecordRow): Date {
  const starts = readData(gameKind, game).starts_on;
  if (!starts) return new Date();
  const [y, m, d] = starts.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
}

function Registrations({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const rows = useRegistrations(game.id) ?? [];
  const people = usePeople() ?? [];
  const characters = useGameRecords('character', game.id) ?? NONE;
  const [editing, setEditing] = useState<RegistrationRow | 'new' | null>(null);
  const [importing, setImporting] = useState<CsvTable | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const active = rows.filter((row) => row.status !== 'cancelled');
  const missingConsent = active.filter((row) => row.is_minor && !row.consent_on_file);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const deleteSelected = () =>
    modals.openConfirmModal({
      title: t('registrations.deleteSelected'),
      children: (
        <Text size="sm">
          {t('registrations.deleteConfirm', {
            what: t('plurals.registration', { count: selected.length }),
          })}
        </Text>
      ),
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void run(() => repo.deleteRegistrations(selected)).then((ok) => ok && setSelected([])),
    });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('registrations.title')} · {game.title}
        </Title>
        {canEdit && (
          <Group>
            <FileButton
              accept=".csv,text/csv"
              onChange={(file) => {
                if (file) void readCsvFile(file).then(setImporting);
              }}
            >
              {(props) => (
                <Button variant="light" leftSection={<IconFileImport size={14} />} {...props}>
                  {t('registrations.import')}
                </Button>
              )}
            </FileButton>
            <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
              {t('registrations.add')}
            </Button>
          </Group>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {t('registrations.intro')}
      </Text>
      <Group gap="xs">
        <Text size="sm" fw={600} data-testid="registered-count">
          {t('registrations.headcount', {
            what: t('plurals.registration', { count: active.length }),
          })}
        </Text>
        {registrationStatuses.map((status) => {
          const count = rows.filter((row) => row.status === status).length;
          return count > 0 ? (
            <Badge key={status} variant="light" color={STATUS_COLOR[status]}>
              {t(`registrations.statuses.${status}`)}: {count}
            </Badge>
          ) : null;
        })}
      </Group>
      {missingConsent.length > 0 && (
        <Alert color="red" variant="light" data-testid="missing-consent">
          {t('registrations.missingConsent', {
            names: missingConsent.map((row) => row.name).join(', '),
          })}
        </Alert>
      )}
      {rows.length === 0 ? (
        <Text c="dimmed">{t('registrations.empty')}</Text>
      ) : (
        <>
          {canEdit && selected.length > 0 && (
            <Group>
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={14} />}
                onClick={deleteSelected}
              >
                {t('registrations.deleteSelected')} ({selected.length})
              </Button>
            </Group>
          )}
          <Table striped highlightOnHover data-testid="registrations">
            <Table.Thead>
              <Table.Tr>
                {canEdit && (
                  <Table.Th w={32}>
                    <Checkbox
                      aria-label={t('registrations.selectAll')}
                      checked={selected.length === rows.length}
                      indeterminate={selected.length > 0 && selected.length < rows.length}
                      onChange={(event) =>
                        setSelected(event.currentTarget.checked ? rows.map((row) => row.id) : [])
                      }
                    />
                  </Table.Th>
                )}
                <Table.Th>{t('registrations.name')}</Table.Th>
                <Table.Th>{t('registrations.status')}</Table.Th>
                <Table.Th>{t('registrations.character')}</Table.Th>
                <Table.Th>{t('registrations.allergens')}</Table.Th>
                <Table.Th>{t('registrations.emergency')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const person = people.find((p) => p.id === row.person_id);
                const character = characters.find((c) => c.id === row.character_id);
                return (
                  <Table.Tr
                    key={row.id}
                    style={{ cursor: canEdit ? 'pointer' : undefined }}
                    onClick={() => canEdit && setEditing(row)}
                  >
                    {canEdit && (
                      <Table.Td onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`${t('registrations.select')} ${row.name}`}
                          checked={selected.includes(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {row.name}
                      </Text>
                      {person && person.display_name !== row.name && (
                        <Text size="xs" c="dimmed">
                          {person.display_name}
                        </Text>
                      )}
                      {row.is_minor && (
                        <Badge
                          size="xs"
                          variant="light"
                          color={row.consent_on_file ? 'teal' : 'red'}
                        >
                          {t('registrations.minor')}
                          {row.consent_on_file ? ` · ${t('registrations.consentShort')} ✓` : ''}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={STATUS_COLOR[row.status]}>
                        {t(`registrations.statuses.${row.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{character?.title ?? ''}</Table.Td>
                    <Table.Td>
                      <AllergenBadges codes={row.allergens} />
                      {row.allergies && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {row.allergies}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{row.emergency_contact}</Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </>
      )}
      {editing && (
        <RegistrationDialog
          game={game}
          record={editing === 'new' ? null : editing}
          characters={characters}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && (
        <ImportDialog
          game={game}
          table={importing}
          existing={rows}
          onClose={() => setImporting(null)}
        />
      )}
    </Stack>
  );
}

const EMPTY: Required<RegistrationPatch> = {
  name: '',
  person_id: null,
  character_id: null,
  status: 'applied',
  is_minor: false,
  consent_on_file: false,
  allergens: [],
  allergies: '',
  emergency_contact: '',
  note: '',
};

function RegistrationDialog({
  game,
  record,
  characters,
  onClose,
}: {
  game: RecordRow;
  record: RegistrationRow | null;
  characters: RecordRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const allergenOptions = useAllergenOptions();
  const [fields, setFields] = useState<Required<RegistrationPatch>>(() =>
    record
      ? (Object.fromEntries(
          Object.keys(EMPTY).map((key) => [key, record[key as keyof RegistrationPatch]]),
        ) as Required<RegistrationPatch>)
      : EMPTY,
  );
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function save() {
    const patch = { ...fields, name: fields.name.trim() };
    const ok = await run(() =>
      record
        ? repo.updateRegistration(record.id, record.rev, patch)
        : repo.createRegistrations([{ ...patch, game_id: game.id }]),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('registrations.edit') : t('registrations.add')}
      size="lg"
    >
      <Stack>
        <SimpleGrid cols={2}>
          <TextInput
            label={t('registrations.name')}
            value={fields.name}
            onChange={(event) => set('name', event.currentTarget.value)}
            maxLength={200}
            data-autofocus
          />
          <Select
            label={t('registrations.status')}
            data={registrationStatuses.map((value) => ({
              value,
              label: t(`registrations.statuses.${value}`),
            }))}
            value={fields.status}
            onChange={(value) => value && set('status', value)}
            allowDeselect={false}
          />
          <Select
            label={t('registrations.person')}
            description={t('registrations.personHint')}
            data={people.map((person) => ({ value: person.id, label: person.display_name }))}
            value={fields.person_id}
            onChange={(value) => set('person_id', value)}
            searchable
            clearable
          />
          <Select
            label={t('registrations.character')}
            data={characters.map((row) => ({ value: row.id, label: row.title }))}
            value={fields.character_id}
            onChange={(value) => set('character_id', value)}
            searchable
            clearable
          />
        </SimpleGrid>
        <Group>
          <Checkbox
            label={t('registrations.minor')}
            checked={fields.is_minor}
            onChange={(event) => set('is_minor', event.currentTarget.checked)}
          />
          {fields.is_minor && (
            <Checkbox
              label={t('registrations.consent')}
              checked={fields.consent_on_file}
              onChange={(event) => set('consent_on_file', event.currentTarget.checked)}
            />
          )}
        </Group>
        <MultiSelect
          label={t('registrations.allergens')}
          data={allergenOptions}
          value={fields.allergens}
          onChange={(value) => set('allergens', value)}
          searchable
          clearable
        />
        <Textarea
          label={t('registrations.allergies')}
          autosize
          minRows={1}
          value={fields.allergies}
          onChange={(event) => set('allergies', event.currentTarget.value)}
          maxLength={2000}
        />
        <TextInput
          label={t('registrations.emergency')}
          description={t('registrations.emergencyHint')}
          value={fields.emergency_contact}
          onChange={(event) => set('emergency_contact', event.currentTarget.value)}
          maxLength={500}
        />
        <Textarea
          label={t('registrations.note')}
          autosize
          minRows={1}
          value={fields.note}
          onChange={(event) => set('note', event.currentTarget.value)}
          maxLength={4000}
        />
        <Group justify="space-between">
          {record ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() =>
                modals.openConfirmModal({
                  title: t('common.delete'),
                  children: (
                    <Text size="sm">{t('registrations.deleteConfirm', { what: record.name })}</Text>
                  ),
                  labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                  confirmProps: { color: 'red' },
                  onConfirm: () =>
                    void run(() => repo.deleteRegistrations([record.id])).then(
                      (ok) => ok && onClose(),
                    ),
                })
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
            <Button disabled={!fields.name.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function ImportDialog({
  game,
  table,
  existing,
  onClose,
}: {
  game: RecordRow;
  table: CsvTable;
  existing: RegistrationRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const [mapping, setMapping] = useState<ColumnMapping>(() => guessMapping(table.headers));
  const result = importRegistrations(table, mapping, {
    people,
    existing,
    at: gameStart(game),
  });
  const skipped = (reason: 'empty' | 'existing') =>
    result.skipped.filter((item) => item.reason === reason).length;
  const columns = [
    { value: '', label: t('registrations.skip') },
    ...table.headers.map((header, index) => ({ value: String(index), label: header || '?' })),
  ];
  async function save() {
    const ok = await run(
      () =>
        repo.createRegistrations(result.drafts.map((draft) => ({ ...draft, game_id: game.id }))),
      t('registrations.imported', {
        what: t('plurals.registration', { count: result.drafts.length }),
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={t('registrations.importTitle')} size="xl">
      <Stack>
        <Text size="sm" c="dimmed">
          {t('registrations.importHint')}
        </Text>
        <Text size="sm">{t('registrations.rows', { count: table.rows.length })}</Text>
        <SimpleGrid cols={2}>
          {registrationFields.map((field) => (
            <Select
              key={field}
              label={t(`registrations.fields.${field}`)}
              data={columns}
              value={mapping[field] === undefined ? '' : String(mapping[field])}
              onChange={(value) =>
                setMapping((current) => {
                  const next: ColumnMapping = {};
                  for (const key of registrationFields) {
                    const index =
                      key === field ? (value ? Number(value) : undefined) : current[key];
                    if (index !== undefined) next[key] = index;
                  }
                  return next;
                })
              }
              allowDeselect={false}
            />
          ))}
        </SimpleGrid>
        {mapping.name === undefined ? (
          <Alert color="orange" variant="light">
            {t('registrations.noName')}
          </Alert>
        ) : (
          <Stack gap={4}>
            <Text fw={600} data-testid="import-summary">
              {t('registrations.willImport', {
                what: t('plurals.registration', { count: result.drafts.length }),
              })}
            </Text>
            {skipped('existing') > 0 && (
              <Text size="sm" c="dimmed">
                {t('registrations.skippedExisting', { count: skipped('existing') })}
              </Text>
            )}
            {skipped('empty') > 0 && (
              <Text size="sm" c="dimmed">
                {t('registrations.skippedEmpty', { count: skipped('empty') })}
              </Text>
            )}
            {result.replaced > 0 && (
              <Text size="sm" c="dimmed">
                {t('registrations.replaced', { count: result.replaced })}
              </Text>
            )}
            <Table fz="xs">
              <Table.Tbody>
                {result.drafts.slice(0, 50).map((draft) => (
                  <Table.Tr key={draft.name}>
                    <Table.Td>
                      {draft.name}
                      {draft.person_id && (
                        <Badge ml={4} size="xs" variant="light" color="teal">
                          {t('registrations.linked')}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{draft.is_minor ? t('registrations.minor') : ''}</Table.Td>
                    <Table.Td>
                      <AllergenBadges codes={draft.allergens} />
                    </Table.Td>
                    <Table.Td>{draft.emergency_contact}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={result.drafts.length === 0} onClick={() => void save()}>
            {t('registrations.doImport')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
