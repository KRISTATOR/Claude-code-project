import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lootTableKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { NONE, useGameRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

type Entry = ReturnType<typeof readData<typeof lootTableKind.data>>['entries'][number];

/** Loot tables and forest finds ("Nálezy"): what lies where and how it is found. */
export function LootPage() {
  return <GameGate>{(game) => <Loot game={game} />}</GameGate>;
}

function Loot({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const tables = useGameRecords('loot_table', game.id) ?? NONE;
  const items = useGameRecords('item', game.id) ?? NONE;
  const targets = useLinkTargets();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const placeOf = (row: RecordRow) => {
    const data = readData(lootTableKind, row);
    return targets.find((target) => target.id === data.place_id)?.title ?? data.place_name;
  };
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('loot.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('loot.newTable')}
          </Button>
        )}
      </Group>
      {tables.length === 0 ? (
        <Text c="dimmed">{t('loot.empty')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          {tables.map((row) => {
            const data = readData(lootTableKind, row);
            return (
              <Paper key={row.id} withBorder p="sm" data-testid="loot-table">
                <Group justify="space-between" mb={4}>
                  <Text fw={700}>{placeOf(row) || row.title}</Text>
                  {canEdit && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setEditing(row)}>
                      {t('common.edit')}
                    </Button>
                  )}
                </Group>
                <Table fz="sm">
                  <Table.Tbody>
                    {data.entries.map((entry, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>
                          {entry.quantity}×{' '}
                          {items.find((item) => item.id === entry.item_id)?.title ?? entry.name}
                        </Table.Td>
                        <Table.Td>{entry.how}</Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {entry.tracks}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            );
          })}
        </SimpleGrid>
      )}
      {editing && (
        <LootDialog
          game={game}
          items={items}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

const EMPTY: Entry = { item_id: null, name: '', quantity: 1, how: '', tracks: '' };

function LootDialog({
  game,
  items,
  record,
  onClose,
}: {
  game: RecordRow;
  items: RecordRow[];
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const places = useLinkTargets().filter((target) => target.kind === 'page');
  const [fields, setFields] = useState(
    readData(lootTableKind, record ?? { data: { entries: [EMPTY] } }),
  );
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const setEntry = (index: number, patch: Partial<Entry>) =>
    set(
      'entries',
      fields.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  const placeName =
    places.find((place) => place.id === fields.place_id)?.title ?? fields.place_name;
  async function save() {
    const title = placeName || t('loot.untitled');
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title, data: { ...record.data, ...fields } })
        : repo.createRecord({ kind: 'loot_table', title, game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('loot.edit') : t('loot.newTable')} size="xl">
      <Stack>
        <Group grow>
          <Select
            label={t('loot.place')}
            data={places.map((place) => ({ value: place.id, label: place.title }))}
            value={fields.place_id}
            onChange={(value) => set('place_id', value)}
            searchable
            clearable
          />
          {!fields.place_id && (
            <TextInput
              label={t('loot.placeName')}
              value={fields.place_name}
              onChange={(event) => set('place_name', event.currentTarget.value)}
              data-autofocus
            />
          )}
        </Group>
        {fields.entries.map((entry, index) => (
          <Group key={index} gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              aria-label={t('loot.quantity')}
              w={70}
              min={1}
              value={entry.quantity}
              onChange={(value) =>
                setEntry(index, { quantity: Math.max(1, Math.round(Number(value) || 1)) })
              }
            />
            <Select
              aria-label={t('loot.item')}
              placeholder={t('loot.item')}
              data={items.map((row) => ({ value: row.id, label: row.title }))}
              value={entry.item_id}
              onChange={(value) => setEntry(index, { item_id: value })}
              searchable
              clearable
              w={180}
            />
            {!entry.item_id && (
              <TextInput
                aria-label={t('loot.name')}
                placeholder={t('loot.name')}
                value={entry.name}
                onChange={(event) => setEntry(index, { name: event.currentTarget.value })}
                w={140}
              />
            )}
            <TextInput
              aria-label={t('loot.how')}
              placeholder={t('loot.how')}
              value={entry.how}
              onChange={(event) => setEntry(index, { how: event.currentTarget.value })}
              flex={1}
            />
            <TextInput
              aria-label={t('loot.tracks')}
              placeholder={t('loot.tracks')}
              value={entry.tracks}
              onChange={(event) => setEntry(index, { tracks: event.currentTarget.value })}
              flex={1}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() =>
                set(
                  'entries',
                  fields.entries.filter((_, i) => i !== index),
                )
              }
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={() => set('entries', [...fields.entries, EMPTY])}
          >
            {t('loot.addEntry')}
          </Button>
        </Group>
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
            <Button onClick={() => void save()}>{t('common.save')}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
