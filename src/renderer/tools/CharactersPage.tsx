import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { weaklyTied } from '@core/characters/graph';
import { compareByHouse } from '@core/characters/roster';
import {
  characterKind,
  costumeStatuses,
  DEFAULT_WARNING,
  defaultSections,
  readData,
  relationshipKind,
  sectionAudiences,
  sectionTypes,
  sheetStatuses,
  sheetTemplateKind,
  type SheetSection,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useAttachments, useGameRecords, usePeople, useRecords } from '../data/hooks';
import { GameGate, StatusBadge, useRun } from './common';

const SHEET_COLORS = { draft: 'gray', ready: 'blue', sent: 'teal' } as const;
const COSTUME_COLORS = { todo: 'red', partial: 'orange', done: 'teal' } as const;

/** The sheet template for a game: its default one, or the built-in sections. */
export function useSheetTemplate(game: RecordRow | undefined, templateId?: string | null) {
  const templates = useGameRecords('sheet_template', game?.id);
  const record =
    templates?.find((row) => row.id === templateId) ??
    templates?.find((row) => readData(sheetTemplateKind, row).is_default) ??
    templates?.[0];
  return {
    record,
    template: record
      ? readData(sheetTemplateKind, record)
      : readData(sheetTemplateKind, { data: {} }),
  };
}

export function CharactersPage() {
  const { t } = useTranslation();
  const { isOrganizer } = useTeam();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'sablona' && isOrganizer ? 'template' : 'roster';
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('characters.title')} · {game.title}
          </Title>
          <Tabs
            value={tab}
            onChange={(value) => setParams(value === 'template' ? { tab: 'sablona' } : {})}
            keepMounted={false}
          >
            <Tabs.List>
              <Tabs.Tab value="roster">{t('characters.roster')}</Tabs.Tab>
              {isOrganizer && <Tabs.Tab value="template">{t('characters.template')}</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="roster" pt="md">
              <Roster game={game} />
            </Tabs.Panel>
            <Tabs.Panel value="template" pt="md">
              <TemplateEditor game={game} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </GameGate>
  );
}

function Roster({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const characters = useGameRecords('character', game.id) ?? NONE;
  const relationships = useGameRecords('relationship', game.id) ?? NONE;
  const factions = useRecords('faction') ?? [];
  const people = usePeople() ?? [];
  const attachments = useAttachments() ?? [];
  const { record: templateRecord } = useSheetTemplate(game);
  const [filter, setFilter] = useState('');

  const playerOf = (id: string) =>
    attachments
      .filter((row) => row.record_id === id && row.relation === 'player')
      .map((row) => people.find((person) => person.id === row.person_id)?.display_name ?? '?')
      .join(', ');

  const weak = useMemo(
    () =>
      new Set(
        weaklyTied(
          characters.map((row) => row.id),
          relationships.map((row) => readData(relationshipKind, row)),
        ),
      ),
    [characters, relationships],
  );

  const rows = characters
    .map((record) => ({
      record,
      data: readData(characterKind, record),
      player: playerOf(record.id),
    }))
    .filter(
      ({ record, data, player }) =>
        !filter || matchesQuery(`${record.title} ${player} ${data.post}`, filter),
    )
    .sort((a, b) =>
      compareByHouse({ ...a.data, name: a.record.title }, { ...b.data, name: b.record.title }),
    );

  function create() {
    let name = '';
    modals.openConfirmModal({
      title: t('characters.newCharacter'),
      children: (
        <TextInput
          data-autofocus
          label={t('characters.name')}
          placeholder={t('characters.namePlaceholder')}
          onChange={(event) => {
            name = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.create'), cancel: t('common.cancel') },
      onConfirm: () => {
        if (!name.trim()) return;
        void run(async () => {
          const row = await repo.createRecord({
            kind: 'character',
            title: name.trim(),
            game_id: game.id,
            data: { template_id: templateRecord?.id ?? null },
          });
          void navigate(`/postavy/${row.id}`);
        });
      },
    });
  }

  const update = (record: RecordRow, patch: Record<string, unknown>) =>
    void run(() =>
      repo.updateRecord(record.id, record.rev, { data: { ...record.data, ...patch } }),
    );

  return (
    <Stack>
      <Group justify="space-between">
        <TextInput
          placeholder={t('characters.filter')}
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={create}>
            {t('characters.newCharacter')}
          </Button>
        )}
      </Group>
      {rows.length === 0 ? (
        <Text c="dimmed">{t('characters.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="roster">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('characters.name')}</Table.Th>
              <Table.Th>{t('characters.player')}</Table.Th>
              <Table.Th>{t('characters.post')}</Table.Th>
              <Table.Th>{t('characters.groups')}</Table.Th>
              <Table.Th>{t('characters.house')}</Table.Th>
              {isOrganizer && <Table.Th>{t('characters.sheetStatus')}</Table.Th>}
              {isOrganizer && <Table.Th>{t('characters.costumeStatus')}</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ record, data, player }) => (
              <Table.Tr key={record.id} data-testid="roster-row" data-name={record.title}>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Anchor component={Link} to={`/postavy/${record.id}`}>
                      {record.title}
                    </Anchor>
                    {isOrganizer && weak.has(record.id) && (
                      <Tooltip label={t('characters.weakTies')}>
                        <Badge size="xs" color="orange" variant="dot">
                          !
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={player ? 'inherit' : 'dimmed'}>
                    {player || t('characters.noPlayer')}
                  </Text>
                </Table.Td>
                <Table.Td>{data.post}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {data.faction_ids
                      .map((id) => factions.find((row) => row.id === id)?.title)
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </Table.Td>
                <Table.Td>{data.house_number}</Table.Td>
                {isOrganizer && (
                  <Table.Td>
                    {canEdit ? (
                      <Select
                        size="xs"
                        w={140}
                        aria-label={t('characters.sheetStatus')}
                        data={sheetStatuses.map((value) => ({
                          value,
                          label: t(`characters.sheetStatuses.${value}`),
                        }))}
                        value={data.sheet_status}
                        allowDeselect={false}
                        onChange={(value) => value && update(record, { sheet_status: value })}
                      />
                    ) : (
                      <StatusBadge color={SHEET_COLORS[data.sheet_status]}>
                        {t(`characters.sheetStatuses.${data.sheet_status}`)}
                      </StatusBadge>
                    )}
                  </Table.Td>
                )}
                {isOrganizer && (
                  <Table.Td>
                    {canEdit ? (
                      <Select
                        size="xs"
                        w={120}
                        aria-label={t('characters.costumeStatus')}
                        data={costumeStatuses.map((value) => ({
                          value,
                          label: t(`characters.costumeStatuses.${value}`),
                        }))}
                        value={data.costume_status}
                        allowDeselect={false}
                        onChange={(value) => value && update(record, { costume_status: value })}
                      />
                    ) : (
                      <StatusBadge color={COSTUME_COLORS[data.costume_status]}>
                        {t(`characters.costumeStatuses.${data.costume_status}`)}
                      </StatusBadge>
                    )}
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function TemplateEditor({ game }: { game: RecordRow }) {
  const { record } = useSheetTemplate(game);
  // Remount when the saved template changes.
  return (
    <TemplateForm key={`${record?.id ?? 'new'}:${record?.rev ?? 0}`} game={game} record={record} />
  );
}

function TemplateForm({ game, record }: { game: RecordRow; record: RecordRow | undefined }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const initial = record ? readData(sheetTemplateKind, record) : null;
  const [warning, setWarning] = useState(initial?.warning ?? DEFAULT_WARNING);
  const [sections, setSections] = useState<SheetSection[]>(initial?.sections ?? defaultSections);

  const patch = (index: number, change: Partial<SheetSection>) =>
    setSections((list) =>
      list.map((section, i) => (i === index ? { ...section, ...change } : section)),
    );
  const move = (index: number, delta: number) =>
    setSections((list) => {
      const next = [...list];
      const target = index + delta;
      const a = next[index];
      const b = next[target];
      if (!a || !b) return list;
      next[index] = b;
      next[target] = a;
      return next;
    });

  function addSection() {
    setSections((list) => {
      let n = list.length + 1;
      while (list.some((section) => section.key === `cast_${n}`)) n += 1;
      return [...list, { key: `cast_${n}`, title: '', type: 'text', audience: 'player', hint: '' }];
    });
  }

  async function save() {
    const data = { warning, sections, is_default: true };
    await run(
      () =>
        record
          ? repo.updateRecord(record.id, record.rev, { data })
          : repo.createRecord({
              kind: 'sheet_template',
              title: game.title,
              game_id: game.id,
              data,
            }),
      t('characters.templateSaved'),
    );
  }

  return (
    <Stack maw={900} data-testid="template-editor">
      <TextInput
        label={t('characters.warning')}
        value={warning}
        onChange={(event) => setWarning(event.currentTarget.value)}
        readOnly={!canEdit}
      />
      <Title order={5}>{t('characters.sections')}</Title>
      {sections.map((section, index) => (
        <Paper key={section.key} withBorder p="xs">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              flex={1}
              label={t('characters.sectionTitle')}
              value={section.title}
              onChange={(event) => patch(index, { title: event.currentTarget.value })}
              readOnly={!canEdit}
            />
            <Select
              w={190}
              label={t('characters.sectionType')}
              data={sectionTypes.map((value) => ({
                value,
                label: t(`characters.sectionTypes.${value}`),
              }))}
              value={section.type}
              onChange={(value) => value && patch(index, { type: value })}
              allowDeselect={false}
              disabled={!canEdit}
            />
            <Select
              w={170}
              label={t('characters.sectionAudience')}
              data={sectionAudiences.map((value) => ({
                value,
                label: t(`characters.audience.${value}`),
              }))}
              value={section.audience}
              onChange={(value) => value && patch(index, { audience: value })}
              allowDeselect={false}
              disabled={!canEdit || section.type !== 'text'}
            />
            {canEdit && (
              <Group gap={2} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label={t('characters.moveUp')}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  aria-label={t('characters.moveDown')}
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <IconArrowDown size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('characters.removeSection')}
                  onClick={() => setSections((list) => list.filter((_, i) => i !== index))}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            )}
          </Group>
          <TextInput
            mt={4}
            size="xs"
            placeholder={t('characters.sectionHint')}
            value={section.hint}
            onChange={(event) => patch(index, { hint: event.currentTarget.value })}
            readOnly={!canEdit}
          />
        </Paper>
      ))}
      {canEdit && (
        <Group>
          <Button variant="default" leftSection={<IconPlus size={14} />} onClick={addSection}>
            {t('characters.addSection')}
          </Button>
          <Button onClick={() => void save()}>{t('common.save')}</Button>
        </Group>
      )}
    </Stack>
  );
}
