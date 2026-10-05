import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NavLink,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  equipmentListKind,
  equipmentStates,
  equipmentTypes,
  readData,
  type EquipmentEntry,
  type EquipmentState,
  type EquipmentType,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { VisibilityBadge, VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useGameRecords, usePeople } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

const STATE_COLOR: Record<EquipmentState, string> = {
  missing: 'red',
  have: 'yellow',
  packed: 'teal',
};

/** Equipment lists ("Vybavení"): what players bring, what we provide, kitchen, NPC costumes. */
export function EquipmentPage() {
  return <GameGate>{(game) => <Equipment game={game} />}</GameGate>;
}

function Equipment({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const lists = useGameRecords('equipment_list', game.id) ?? NONE;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = lists.find((row) => row.id === selectedId) ?? lists[0];
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('equipment.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            {t('equipment.newList')}
          </Button>
        )}
      </Group>
      {lists.length === 0 ? (
        <Text c="dimmed">{t('equipment.empty')}</Text>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Stack gap={0}>
              {equipmentTypes.map((type) => {
                const ofType = lists.filter(
                  (row) => readData(equipmentListKind, row).type === type,
                );
                if (ofType.length === 0) return null;
                return (
                  <Stack key={type} gap={0} mb="xs">
                    <Text size="xs" c="dimmed" fw={600} px="xs">
                      {t(`equipment.types.${type}`)}
                    </Text>
                    {ofType.map((row) => (
                      <NavLink
                        key={row.id}
                        label={row.title}
                        active={row.id === selected?.id}
                        onClick={() => setSelectedId(row.id)}
                        rightSection={<VisibilityBadge visibility={row.visibility} />}
                      />
                    ))}
                  </Stack>
                );
              })}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {selected && (
              <ListEditor
                key={`${selected.id}:${String(selected.rev)}`}
                game={game}
                list={selected}
              />
            )}
          </Grid.Col>
        </Grid>
      )}
      {creating && (
        <NewListDialog
          game={game}
          onClose={(id) => {
            setCreating(false);
            if (id) setSelectedId(id);
          }}
        />
      )}
    </Stack>
  );
}

function NewListDialog({ game, onClose }: { game: RecordRow; onClose: (id?: string) => void }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EquipmentType>('players_bring');
  return (
    <Modal opened onClose={() => onClose()} title={t('equipment.newList')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Select
          label={t('equipment.type')}
          data={equipmentTypes.map((value) => ({ value, label: t(`equipment.types.${value}`) }))}
          value={type}
          onChange={(value) => value && setType(value)}
          allowDeselect={false}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onClose()}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() => {
              let created: RecordRow | undefined;
              void run(async () => {
                created = await repo.createRecord({
                  kind: 'equipment_list',
                  title: title.trim(),
                  game_id: game.id,
                  data: { type, entries: [] },
                });
              }).then((ok) => ok && onClose(created?.id));
            }}
          >
            {t('common.create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ListEditor({ game, list }: { game: RecordRow; list: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const npcs = useGameRecords('npc', game.id) ?? NONE;
  const characters = useGameRecords('character', game.id) ?? NONE;
  const [fields, setFields] = useState(() => readData(equipmentListKind, list));
  const costumes = fields.type === 'costumes';
  const setEntry = (index: number, patch: Partial<EquipmentEntry>) =>
    setFields((current) => ({
      ...current,
      entries: current.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  const packed = fields.entries.filter((entry) => entry.state === 'packed').length;
  const roleOptions = [...npcs, ...characters].map((row) => ({ value: row.id, label: row.title }));
  const personName = (id: string | null) =>
    people.find((person) => person.id === id)?.display_name ?? '';
  const roleName = (id: string | null) =>
    [...npcs, ...characters].find((row) => row.id === id)?.title ?? '';

  return (
    <Paper withBorder p="md">
      <Stack>
        <Group justify="space-between">
          <Group gap="xs">
            <Title order={4}>{list.title}</Title>
            <Badge variant="light">{t(`equipment.types.${fields.type}`)}</Badge>
          </Group>
          <Text size="sm" c="dimmed" data-testid="packed-progress">
            {t('equipment.progress', { packed, total: fields.entries.length })}
          </Text>
        </Group>
        {canEdit ? (
          <Stack gap="xs" data-testid="equipment-entries">
            {fields.entries.map((entry, index) => (
              <Group key={entry.id} gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                  aria-label={t('equipment.name')}
                  placeholder={t('equipment.name')}
                  value={entry.name}
                  onChange={(event) => setEntry(index, { name: event.currentTarget.value })}
                  flex={2}
                />
                <NumberInput
                  aria-label={t('equipment.quantity')}
                  w={70}
                  min={0}
                  value={entry.quantity}
                  onChange={(value) =>
                    setEntry(index, { quantity: Math.max(0, Math.round(Number(value) || 0)) })
                  }
                />
                {costumes && (
                  <Select
                    aria-label={t('equipment.role')}
                    placeholder={t('equipment.role')}
                    data={roleOptions}
                    value={entry.role_id}
                    onChange={(value) => setEntry(index, { role_id: value })}
                    searchable
                    clearable
                    flex={1}
                  />
                )}
                {fields.type !== 'players_bring' && (
                  <Select
                    aria-label={t('equipment.person')}
                    placeholder={t('equipment.person')}
                    data={people.map((person) => ({
                      value: person.id,
                      label: person.display_name,
                    }))}
                    value={entry.person_id}
                    onChange={(value) => setEntry(index, { person_id: value })}
                    searchable
                    clearable
                    flex={1}
                  />
                )}
                <Select
                  aria-label={t('equipment.state')}
                  data={equipmentStates.map((value) => ({
                    value,
                    label: t(`equipment.states.${value}`),
                  }))}
                  value={entry.state}
                  onChange={(value) => value && setEntry(index, { state: value })}
                  allowDeselect={false}
                  w={120}
                />
                <TextInput
                  aria-label={t('equipment.note')}
                  placeholder={t('equipment.note')}
                  value={entry.note}
                  onChange={(event) => setEntry(index, { note: event.currentTarget.value })}
                  flex={1}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('common.delete')}
                  onClick={() =>
                    setFields((current) => ({
                      ...current,
                      entries: current.entries.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ))}
            <Group justify="space-between">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() =>
                  setFields((current) => ({
                    ...current,
                    entries: [
                      ...current.entries,
                      {
                        id: crypto.randomUUID(),
                        name: '',
                        quantity: 1,
                        person_id: null,
                        role_id: null,
                        state: 'missing',
                        note: '',
                      },
                    ],
                  }))
                }
              >
                {t('equipment.addEntry')}
              </Button>
              <Group>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('common.delete')}
                  onClick={() => void run(() => repo.trashRecord(list))}
                >
                  <IconTrash size={16} />
                </ActionIcon>
                <Button
                  onClick={() =>
                    void run(
                      () =>
                        repo.updateRecord(list.id, list.rev, {
                          data: { ...list.data, ...fields },
                        }),
                      t('common.saved'),
                    )
                  }
                >
                  {t('common.save')}
                </Button>
              </Group>
            </Group>
          </Stack>
        ) : (
          <Table striped data-testid="equipment-entries">
            <Table.Tbody>
              {fields.entries.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>
                    {entry.quantity > 1 ? `${String(entry.quantity)}× ` : ''}
                    {entry.name}
                  </Table.Td>
                  {costumes && <Table.Td>{roleName(entry.role_id)}</Table.Td>}
                  {fields.type !== 'players_bring' && (
                    <Table.Td>{personName(entry.person_id)}</Table.Td>
                  )}
                  <Table.Td>
                    <Badge size="xs" variant="light" color={STATE_COLOR[entry.state]}>
                      {t(`equipment.states.${entry.state}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {entry.note}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {canEdit && fields.type === 'players_bring' && list.visibility === 'organizers' && (
          <Text size="xs" c="dimmed">
            {t('equipment.visibilityHint')}
          </Text>
        )}
        <VisibilityEditor record={list} />
      </Stack>
    </Paper>
  );
}
