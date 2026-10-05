import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  durationLabel,
  placeKey,
  routePlaces,
  travelMinutes,
  walkingTrip,
} from '@core/economy/travel';
import { itemKind, readData, travelRouteKind } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { NONE, useGameRecords, useRecords } from '../data/hooks';
import { GameGate, inScope, useRun } from '../tools/common';

/** Travel ("Cesty"): walking times between off-site places, a distance table and a calculator. */
export function TravelPage() {
  return <GameGate>{(game) => <Travel game={game} />}</GameGate>;
}

function Travel({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const routes = (useRecords('travel_route') ?? NONE).filter((row) => inScope(row, game));
  const items = useGameRecords('item', game.id) ?? NONE;
  const mounts = items.filter((row) => readData(itemKind, row).travel_factor !== null);
  const places = routePlaces(routes).sort((a, b) => compareCzech(a.name, b.name));
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [chosenMounts, setChosenMounts] = useState<string[]>([]);
  const trip = from && to ? walkingTrip(routes, from, to) : null;
  const factors = chosenMounts
    .map(
      (id) => readData(itemKind, mounts.find((row) => row.id === id) ?? { data: {} }).travel_factor,
    )
    .filter((factor): factor is number => factor !== null);
  const nameOf = (key: string) => places.find((place) => place.key === key)?.name ?? '?';
  const options = places.map((place) => ({ value: place.key, label: place.name }));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('travel.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('travel.newRoute')}
          </Button>
        )}
      </Group>
      <Paper withBorder p="md">
        <Stack>
          <Title order={5}>{t('travel.calculator')}</Title>
          <Group grow align="flex-end">
            <Select
              label={t('travel.from')}
              data={options}
              value={from}
              onChange={setFrom}
              searchable
            />
            <Select label={t('travel.to')} data={options} value={to} onChange={setTo} searchable />
            <MultiSelect
              label={t('travel.mounts')}
              description={t('travel.mountsHint')}
              data={mounts.map((row) => ({
                value: row.id,
                label: `${row.title} (×${String(readData(itemKind, row).travel_factor ?? 1).replace('.', ',')})`,
              }))}
              value={chosenMounts}
              onChange={setChosenMounts}
              searchable
            />
          </Group>
          {from && to && (
            <Alert variant="light" color={trip ? 'teal' : 'orange'} data-testid="trip">
              {trip ? (
                <Stack gap={2}>
                  <Text fw={700}>
                    {t('travel.result', {
                      time: durationLabel(travelMinutes(trip.minutes, factors)),
                      walking: durationLabel(trip.minutes),
                    })}
                  </Text>
                  <Text size="sm">{trip.path.map(nameOf).join(' → ')}</Text>
                </Stack>
              ) : (
                t('travel.noConnection')
              )}
            </Alert>
          )}
        </Stack>
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Title order={5} mb="xs">
            {t('travel.routes')}
          </Title>
          {routes.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('travel.empty')}
            </Text>
          ) : (
            <Table striped highlightOnHover data-testid="routes">
              <Table.Tbody>
                {routes.map((row) => {
                  const data = readData(travelRouteKind, row);
                  return (
                    <Table.Tr
                      key={row.id}
                      style={{ cursor: canEdit ? 'pointer' : undefined }}
                      onClick={() => canEdit && setEditing(row)}
                    >
                      <Table.Td>{data.from_name}</Table.Td>
                      <Table.Td>↔</Table.Td>
                      <Table.Td>{data.to_name}</Table.Td>
                      <Table.Td>{durationLabel(data.minutes)}</Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {data.note}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
        <Paper withBorder p="md">
          <Title order={5} mb="xs">
            {t('travel.table')}
          </Title>
          {places.length < 2 ? (
            <Text size="sm" c="dimmed">
              {t('travel.tableEmpty')}
            </Text>
          ) : (
            <ScrollArea>
              <Table fz="xs" withColumnBorders data-testid="distance-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th />
                    {places.map((place) => (
                      <Table.Th key={place.key}>{place.name}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {places.map((row) => (
                    <Table.Tr key={row.key}>
                      <Table.Th>{row.name}</Table.Th>
                      {places.map((column) => {
                        const minutes =
                          row.key === column.key
                            ? 0
                            : walkingTrip(routes, row.key, column.key)?.minutes;
                        return (
                          <Table.Td key={column.key}>
                            {minutes === undefined
                              ? '–'
                              : minutes === 0
                                ? ''
                                : durationLabel(minutes)}
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Paper>
      </SimpleGrid>
      {editing && (
        <RouteDialog
          game={game}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function RouteDialog({
  game,
  record,
  onClose,
}: {
  game: RecordRow;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const places = useLinkTargets().filter((target) => target.kind === 'page');
  const [fields, setFields] = useState(readData(travelRouteKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const side = (which: 'from' | 'to') => {
    const idKey = which === 'from' ? 'from_id' : 'to_id';
    const nameKey = which === 'from' ? 'from_name' : 'to_name';
    return (
      <Stack gap={4}>
        <Select
          label={t(`travel.${which}`)}
          description={t('travel.placeHint')}
          data={places.map((place) => ({ value: place.id, label: place.title }))}
          value={fields[idKey]}
          onChange={(value) =>
            setFields((current) => ({
              ...current,
              [idKey]: value,
              [nameKey]: places.find((place) => place.id === value)?.title ?? current[nameKey],
            }))
          }
          searchable
          clearable
        />
        {!fields[idKey] && (
          <TextInput
            aria-label={t(`travel.${which}`)}
            placeholder={t('travel.placeName')}
            value={fields[nameKey]}
            onChange={(event) => set(nameKey, event.currentTarget.value)}
          />
        )}
      </Stack>
    );
  };
  const valid =
    fields.from_name.trim() &&
    fields.to_name.trim() &&
    placeKey(fields.from_id, fields.from_name) !== placeKey(fields.to_id, fields.to_name);
  async function save() {
    const title = `${fields.from_name} – ${fields.to_name}`;
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title, data: { ...record.data, ...fields } })
        : repo.createRecord({ kind: 'travel_route', title, world_id: game.world_id, data: fields }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('travel.editRoute') : t('travel.newRoute')}>
      <Stack>
        <Group grow align="flex-start">
          {side('from')}
          {side('to')}
        </Group>
        <NumberInput
          label={t('travel.minutes')}
          value={fields.minutes}
          min={1}
          onChange={(value) => set('minutes', Math.max(1, Number(value) || 1))}
          maw={200}
        />
        <TextInput
          label={t('travel.note')}
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
            <Button disabled={!valid} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
