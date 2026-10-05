import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { conditions, inventoryItemKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useRecords } from '../data/hooks';
import { useRun } from '../tools/common';

const CONDITION_COLOR = { good: 'teal', worn: 'yellow', broken: 'red', missing: 'gray' } as const;

/** The group's own props across all games ("Sklad rekvizit"). */
export function InventoryPage() {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const items = (useRecords('inventory_item') ?? NONE).filter(
    (row) => row.world_id === null && row.game_id === null,
  );
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const shown = items.filter((row) => {
    const data = readData(inventoryItemKind, row);
    return !filter || matchesQuery(`${row.title} ${data.location} ${data.note}`, filter);
  });
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('inventory.title')}</Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('inventory.newItem')}
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {t('inventory.intro')}
      </Text>
      <TextInput
        placeholder={t('inventory.filter')}
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
        maw={300}
      />
      {shown.length === 0 ? (
        <Text c="dimmed">{t('inventory.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="inventory">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('inventory.quantity')}</Table.Th>
              <Table.Th>{t('inventory.location')}</Table.Th>
              <Table.Th>{t('inventory.condition')}</Table.Th>
              <Table.Th>{t('inventory.note')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((row) => {
              const data = readData(inventoryItemKind, row);
              return (
                <Table.Tr
                  key={row.id}
                  style={{ cursor: canEdit ? 'pointer' : undefined }}
                  onClick={() => canEdit && setEditing(row)}
                >
                  <Table.Td fw={600}>{row.title}</Table.Td>
                  <Table.Td>{data.quantity}</Table.Td>
                  <Table.Td>{data.location}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={CONDITION_COLOR[data.condition]}>
                      {t(`inventory.conditions.${data.condition}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{data.note}</Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <InventoryDialog
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function InventoryDialog({ record, onClose }: { record: RecordRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(readData(inventoryItemKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({ kind: 'inventory_item', title: title.trim(), data: fields }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('inventory.edit') : t('inventory.newItem')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <NumberInput
            label={t('inventory.quantity')}
            value={fields.quantity}
            min={0}
            onChange={(value) => set('quantity', Math.max(0, Math.round(Number(value) || 0)))}
          />
          <Select
            label={t('inventory.condition')}
            data={conditions.map((value) => ({ value, label: t(`inventory.conditions.${value}`) }))}
            value={fields.condition}
            onChange={(value) => value && set('condition', value)}
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label={t('inventory.location')}
          placeholder={t('inventory.locationHint')}
          value={fields.location}
          onChange={(event) => set('location', event.currentTarget.value)}
        />
        <TextInput
          label={t('inventory.note')}
          value={fields.note}
          onChange={(event) => set('note', event.currentTarget.value)}
        />
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
            <Button disabled={!title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
