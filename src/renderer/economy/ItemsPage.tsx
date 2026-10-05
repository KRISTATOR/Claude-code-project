import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { formatDateTime, parseNumber } from '@core/format';
import { computeHoldings, sortTransfers } from '@core/economy/ledger';
import { availableIn, formatMoney, phasePrices, type CurrencyData } from '@core/economy/money';
import {
  currencyKind,
  itemKind,
  phaseKind,
  physicalForms,
  readData,
  readSecret,
  tradeRegimes,
  transferKind,
  type TradeRegime,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { escapeHtml, type PrintPiece } from '@core/print/html';
import { compareCzech, matchesQuery } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, useSecret } from '../data/hooks';
import { ExportMenu } from '../print/components';
import { lookOf, phaseLabel, usePrintContext } from '../print/pieces';
import { A4_PORTRAIT, imposeGrid, toPdf } from '../print/service';
import { Field, GameGate, useAskName, useRun } from '../tools/common';

export const REGIME_COLOR: Record<TradeRegime, string> = {
  free: 'teal',
  rationed: 'yellow',
  banned: 'red',
  black_market: 'grape',
};

/** The game's currency (defaults when none is set up yet). */
export function useCurrency(game: RecordRow): {
  record: RecordRow | undefined;
  data: CurrencyData;
} {
  const record = (useGameRecords('currency', game.id) ?? NONE)[0];
  return { record, data: readData(currencyKind, record ?? { data: {} }) };
}

/** Characters, NPCs and groups of a game: everyone who can hold items. */
export function useHolders(game: RecordRow) {
  const characters = useGameRecords('character', game.id) ?? NONE;
  const npcs = useGameRecords('npc', game.id) ?? NONE;
  const factions = useGameRecords('faction', game.id) ?? NONE;
  return [...characters, ...npcs, ...factions].sort((a, b) => compareCzech(a.title, b.title));
}

/** Items and economy ("Předměty"): catalogue, ledger, money and printable cards. */
export function ItemsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'catalog';
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('items.title')} · {game.title}
          </Title>
          <Tabs
            value={tab}
            onChange={(value) => setParams(value ? { tab: value } : {})}
            keepMounted={false}
          >
            <Tabs.List>
              <Tabs.Tab value="catalog">{t('items.catalog')}</Tabs.Tab>
              <Tabs.Tab value="ledger">{t('items.ledger')}</Tabs.Tab>
              <Tabs.Tab value="currency">{t('items.currency')}</Tabs.Tab>
              <Tabs.Tab value="print">{t('items.print')}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="catalog" pt="md">
              <Catalog game={game} />
            </Tabs.Panel>
            <Tabs.Panel value="ledger" pt="md">
              <Ledger game={game} />
            </Tabs.Panel>
            <Tabs.Panel value="currency" pt="md">
              <CurrencyEditor game={game} />
            </Tabs.Panel>
            <Tabs.Panel value="print" pt="md">
              <Cards game={game} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </GameGate>
  );
}

function Catalog({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const items = useGameRecords('item', game.id) ?? NONE;
  const phases = (useGameRecords('phase', game.id) ?? NONE)
    .slice()
    .sort((a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order);
  const holders = useHolders(game);
  const { data: currency } = useCurrency(game);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [regime, setRegime] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const shown = items.filter((row) => {
    const data = readData(itemKind, row);
    return (
      (!filter || matchesQuery(`${row.title} ${data.category} ${data.effect}`, filter)) &&
      (!regime || data.regime === regime) &&
      (!phaseId || availableIn(row, phaseId))
    );
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <TextInput
            placeholder={t('items.filter')}
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          <Select
            placeholder={t('items.pricesIn')}
            aria-label={t('items.pricesIn')}
            data={phases.map((row) => ({ value: row.id, label: phaseLabel(row) }))}
            value={phaseId}
            onChange={setPhaseId}
            clearable
          />
          <Select
            placeholder={t('items.regime')}
            aria-label={t('items.regime')}
            data={tradeRegimes.map((value) => ({ value, label: t(`items.regimes.${value}`) }))}
            value={regime}
            onChange={setRegime}
            clearable
          />
        </Group>
        {canEdit && (
          <Button
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              ask(t('items.newItem'), (name) => {
                void run(async () => {
                  const row = await repo.createRecord({
                    kind: 'item',
                    title: name,
                    game_id: game.id,
                  });
                  setEditing(row);
                });
              })
            }
          >
            {t('items.newItem')}
          </Button>
        )}
      </Group>
      {shown.length === 0 ? (
        <Text c="dimmed">{t('items.empty')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="item-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('items.category')}</Table.Th>
              <Table.Th>{t('items.price')}</Table.Th>
              <Table.Th>{t('items.buyback')}</Table.Th>
              <Table.Th>{t('items.regime')}</Table.Th>
              <Table.Th>{t('items.effect')}</Table.Th>
              <Table.Th>{t('items.owner')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((row) => {
              const data = readData(itemKind, row);
              const prices = phasePrices(row, currency, phaseId);
              const owner = holders.find((holder) => holder.id === data.starting_owner_id);
              return (
                <Table.Tr
                  key={row.id}
                  data-testid="item-row"
                  style={{ cursor: canEdit ? 'pointer' : undefined }}
                  onClick={() => canEdit && setEditing(row)}
                >
                  <Table.Td fw={600}>{row.title}</Table.Td>
                  <Table.Td>{data.category}</Table.Td>
                  <Table.Td>{formatMoney(prices.price, currency)}</Table.Td>
                  <Table.Td>
                    {data.buyback_price ? formatMoney(prices.buyback, currency) : ''}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={REGIME_COLOR[data.regime]}>
                      {t(`items.regimes.${data.regime}`)}
                    </Badge>
                    {data.requisitionable && (
                      <Badge size="sm" variant="outline" color="red" ml={4}>
                        {t('items.requisitionableShort')}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" lineClamp={2}>
                      {[data.effect, data.upkeep].filter(Boolean).join(' · ')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {owner ? `${owner.title} (${String(data.starting_quantity)}×)` : ''}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <ItemDialog
          key={editing.id}
          record={editing}
          phases={phases}
          holders={holders}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function ItemDialog({
  record,
  phases,
  holders,
  onClose,
}: {
  record: RecordRow;
  phases: RecordRow[];
  holders: RecordRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo, isOrganizer } = useTeam();
  const run = useRun();
  const secret = useSecret(record.id);
  const notes = readSecret(itemKind, secret).notes;
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(readData(itemKind, record));
  const [secretNotes, setSecretNotes] = useState<string | null>(null);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const money = (key: 'price' | 'buyback_price', label: string) => (
    <TextInput
      label={label}
      description={t('items.priceHint')}
      defaultValue={fields[key] ? String(fields[key]).replace('.', ',') : ''}
      onChange={(event) => set(key, parseNumber(event.currentTarget.value) ?? 0)}
    />
  );

  async function save() {
    const ok = await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, ...fields },
      });
      if (secretNotes !== null && secretNotes !== notes)
        await repo.saveSecret(record.id, { notes: secretNotes });
    });
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={t('items.edit')} size="xl">
      <Stack>
        <Group grow>
          <TextInput
            label={t('common.name')}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <TextInput
            label={t('items.category')}
            value={fields.category}
            onChange={(event) => set('category', event.currentTarget.value)}
          />
        </Group>
        <Group grow align="flex-start">
          {money('price', t('items.price'))}
          {money('buyback_price', t('items.buyback'))}
          <Select
            label={t('items.regime')}
            data={tradeRegimes.map((value) => ({ value, label: t(`items.regimes.${value}`) }))}
            value={fields.regime}
            onChange={(value) => value && set('regime', value)}
            allowDeselect={false}
          />
        </Group>
        <Textarea
          label={t('items.effect')}
          autosize
          minRows={2}
          value={fields.effect}
          onChange={(event) => set('effect', event.currentTarget.value)}
        />
        <TextInput
          label={t('items.upkeep')}
          placeholder={t('items.upkeepHint')}
          value={fields.upkeep}
          onChange={(event) => set('upkeep', event.currentTarget.value)}
        />
        <MultiSelect
          label={t('items.phases')}
          description={t('items.phasesHint')}
          data={phases.map((row) => ({ value: row.id, label: phaseLabel(row) }))}
          value={fields.phase_ids}
          onChange={(value) => set('phase_ids', value)}
        />
        <Group grow align="flex-end">
          <Select
            label={t('items.owner')}
            data={holders.map((row) => ({ value: row.id, label: row.title }))}
            value={fields.starting_owner_id}
            onChange={(value) => set('starting_owner_id', value)}
            searchable
            clearable
          />
          <NumberInput
            label={t('items.quantity')}
            value={fields.starting_quantity}
            min={0}
            onChange={(value) =>
              set('starting_quantity', Math.max(0, Math.round(Number(value) || 0)))
            }
          />
          <Select
            label={t('items.physical')}
            data={physicalForms.map((value) => ({ value, label: t(`items.physicals.${value}`) }))}
            value={fields.physical}
            onChange={(value) => value && set('physical', value)}
            allowDeselect={false}
          />
        </Group>
        <Group grow align="flex-end">
          <Checkbox
            label={t('items.requisitionable')}
            checked={fields.requisitionable}
            onChange={(event) => set('requisitionable', event.currentTarget.checked)}
          />
          <TextInput
            label={t('items.travelFactor')}
            description={t('items.travelFactorHint')}
            defaultValue={
              fields.travel_factor ? String(fields.travel_factor).replace('.', ',') : ''
            }
            onChange={(event) => {
              const value = parseNumber(event.currentTarget.value);
              set('travel_factor', value && value > 0 ? value : null);
            }}
          />
        </Group>
        {isOrganizer && (
          <Field label={t('items.notes')} value={secretNotes ?? notes} onValue={setSecretNotes} />
        )}
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

function Ledger({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const items = useGameRecords('item', game.id) ?? NONE;
  const transfers = useGameRecords('transfer', game.id) ?? NONE;
  const holders = useHolders(game);
  const [adding, setAdding] = useState(false);
  const { holdings, problems } = computeHoldings(items, transfers);
  const titleOf = (id: string | null) =>
    id === null
      ? t('items.bank')
      : (holders.find((row) => row.id === id)?.title ??
        items.find((row) => row.id === id)?.title ??
        '?');
  const log = sortTransfers(transfers).reverse();

  return (
    <Stack>
      {problems.length > 0 && (
        <Alert color="orange" variant="light" data-testid="ledger-problems">
          {problems.map((problem) => (
            <Text key={problem.transfer_id} size="sm">
              {t('items.short', {
                holder: titleOf(problem.holder_id),
                count: problem.missing,
                item: titleOf(problem.item_id),
              })}
            </Text>
          ))}
        </Alert>
      )}
      <Group justify="space-between">
        <Title order={5}>{t('items.holdings')}</Title>
        {canEdit && (
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)}>
            {t('items.newTransfer')}
          </Button>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-testid="holdings">
        {holders
          .filter((holder) => (holdings.get(holder.id)?.size ?? 0) > 0)
          .map((holder) => (
            <Paper key={holder.id} withBorder p="sm" data-testid="holder" data-name={holder.title}>
              <Text fw={600} mb={4}>
                {holder.title}
              </Text>
              {[...(holdings.get(holder.id) ?? new Map<string, number>())].map(
                ([itemId, quantity]) => (
                  <Text key={itemId} size="sm" {...(quantity < 0 ? { c: 'red' } : {})}>
                    {quantity}× {titleOf(itemId)}
                  </Text>
                ),
              )}
            </Paper>
          ))}
      </SimpleGrid>
      <Title order={5}>{t('items.transfers')}</Title>
      {log.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('items.noTransfers')}
        </Text>
      ) : (
        <Table striped data-testid="transfers">
          <Table.Tbody>
            {log.map((row) => {
              const data = readData(transferKind, row);
              return (
                <Table.Tr key={row.id}>
                  <Table.Td w={150}>
                    <Text size="xs">{data.at ? formatDateTime(new Date(data.at)) : ''}</Text>
                  </Table.Td>
                  <Table.Td>
                    {data.quantity}× {titleOf(data.item_id)}
                  </Table.Td>
                  <Table.Td>
                    {titleOf(data.from_id)} → {titleOf(data.to_id)}
                  </Table.Td>
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
      {adding && (
        <TransferDialog
          game={game}
          items={items}
          holders={holders}
          onClose={() => setAdding(false)}
        />
      )}
    </Stack>
  );
}

const BANK = '__bank__';

function TransferDialog({
  game,
  items,
  holders,
  onClose,
}: {
  game: RecordRow;
  items: RecordRow[];
  holders: RecordRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [from, setFrom] = useState<string>(BANK);
  const [to, setTo] = useState<string>(BANK);
  const [note, setNote] = useState('');
  const holderOptions = [
    { value: BANK, label: t('items.bank') },
    ...holders.map((row) => ({ value: row.id, label: row.title })),
  ];
  async function save() {
    if (!itemId) return;
    const item = items.find((row) => row.id === itemId);
    const ok = await run(() =>
      repo.createRecord({
        kind: 'transfer',
        title: `${String(quantity)}× ${item?.title ?? ''}`,
        game_id: game.id,
        data: {
          item_id: itemId,
          quantity,
          from_id: from === BANK ? null : from,
          to_id: to === BANK ? null : to,
          at: new Date().toISOString(),
          note,
        },
      }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={t('items.newTransfer')}>
      <Stack>
        <Group grow align="flex-end">
          <Select
            label={t('items.item')}
            data={items.map((row) => ({ value: row.id, label: row.title }))}
            value={itemId}
            onChange={setItemId}
            searchable
          />
          <NumberInput
            label={t('items.quantity')}
            value={quantity}
            min={1}
            onChange={(value) => setQuantity(Math.max(1, Math.round(Number(value) || 1)))}
            maw={110}
          />
        </Group>
        <Group grow>
          <Select
            label={t('items.from')}
            data={holderOptions}
            value={from}
            onChange={(value) => value && setFrom(value)}
            allowDeselect={false}
            searchable
          />
          <Select
            label={t('items.to')}
            data={holderOptions}
            value={to}
            onChange={(value) => value && setTo(value)}
            allowDeselect={false}
            searchable
          />
        </Group>
        <TextInput
          label={t('items.note')}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!itemId || from === to} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CurrencyEditor({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const { record, data } = useCurrency(game);
  const phases = (useGameRecords('phase', game.id) ?? NONE)
    .slice()
    .sort((a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order);
  const [fields, setFields] = useState(data);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const text = (
    key: 'one' | 'few' | 'many' | 'sub_one' | 'sub_few' | 'sub_many',
    label: string,
  ) => (
    <TextInput
      label={label}
      value={fields[key]}
      onChange={(event) => set(key, event.currentTarget.value)}
      readOnly={!canEdit}
    />
  );
  async function save() {
    await run(
      () =>
        record
          ? repo.updateRecord(record.id, record.rev, { data: { ...record.data, ...fields } })
          : repo.createRecord({
              kind: 'currency',
              title: fields.one,
              game_id: game.id,
              data: fields,
            }),
      t('common.saved'),
    );
  }
  return (
    <Paper withBorder p="md" maw={720}>
      <Stack>
        <Text size="sm" c="dimmed">
          {t('items.currencyIntro')}
        </Text>
        <Group grow>
          {text('one', t('items.formOne'))}
          {text('few', t('items.formFew'))}
          {text('many', t('items.formMany'))}
        </Group>
        <Group grow>
          {text('sub_one', t('items.subOne'))}
          {text('sub_few', t('items.subFew'))}
          {text('sub_many', t('items.subMany'))}
        </Group>
        <NumberInput
          label={t('items.subPerUnit')}
          value={fields.sub_per_unit}
          min={0}
          onChange={(value) => set('sub_per_unit', Math.max(0, Math.round(Number(value) || 0)))}
          readOnly={!canEdit}
          maw={220}
        />
        <Text fw={600} size="sm">
          {t('items.multipliers')}
        </Text>
        {phases.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('items.noPhases')}
          </Text>
        )}
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {phases.map((phase) => (
            <TextInput
              key={phase.id}
              label={phaseLabel(phase)}
              defaultValue={String(fields.multipliers[phase.id] ?? 1).replace('.', ',')}
              readOnly={!canEdit}
              onChange={(event) => {
                const value = parseNumber(event.currentTarget.value);
                setFields((current) => ({
                  ...current,
                  multipliers: {
                    ...current.multipliers,
                    [phase.id]: value && value > 0 ? value : 1,
                  },
                }));
              }}
            />
          ))}
        </SimpleGrid>
        <Text size="sm" data-testid="currency-sample">
          {t('items.sample', { amount: formatMoney(1.5, fields) })}
        </Text>
        {canEdit && (
          <Group>
            <Button onClick={() => void save()}>{t('common.save')}</Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

/** Item cards and ration coupons, eight A7 cards to an A4 sheet. */
function Cards({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const context = usePrintContext(game);
  const items = useGameRecords('item', game.id) ?? NONE;
  const { data: currency } = useCurrency(game);
  const [chosen, setChosen] = useState<string[]>([]);
  const [writerId, setWriterId] = useState<string | null>(null);
  const [couponValue, setCouponValue] = useState('1');
  const [couponCount, setCouponCount] = useState(16);
  const [couponText, setCouponText] = useState('');
  const look = lookOf(writerId ? context.writers.get(writerId) : undefined);
  const card = (html: string): PrintPiece => ({
    size: 'A7-landscape',
    look: { ...look, sizePt: Math.min(look.sizePt, 11) },
    html,
  });
  const layout = { cols: 2, rows: 4, sheet: A4_PORTRAIT };

  const itemCards = async () => {
    const pieces = items
      .filter((row) => chosen.length === 0 || chosen.includes(row.id))
      .flatMap((row) => {
        const data = readData(itemKind, row);
        const copies = data.physical === 'card' ? Math.max(1, data.starting_quantity) : 1;
        return Array.from({ length: copies }, () =>
          card(
            `<h2 style="margin:0 0 2mm;text-align:center">${escapeHtml(row.title)}</h2>${data.effect ? `<p>${escapeHtml(data.effect)}</p>` : ''}${data.upkeep ? `<p><em>${escapeHtml(data.upkeep)}</em></p>` : ''}<p style="text-align:right"><strong>${escapeHtml(formatMoney(data.price, currency))}</strong></p>`,
          ),
        );
      });
    return imposeGrid(await toPdf(pieces), layout);
  };

  const coupons = async () => {
    const value = formatMoney(parseNumber(couponValue) ?? 1, currency);
    const pieces = Array.from({ length: couponCount }, () =>
      card(
        `<div style="text-align:center;padding-top:6mm"><div style="font-size:2em;font-weight:700">${escapeHtml(value)}</div>${couponText ? `<p>${escapeHtml(couponText)}</p>` : ''}</div>`,
      ),
    );
    return imposeGrid(await toPdf(pieces), layout);
  };

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder p="md">
        <Stack>
          <Title order={5}>{t('items.itemCards')}</Title>
          <Text size="sm" c="dimmed">
            {t('items.itemCardsHint')}
          </Text>
          <MultiSelect
            label={t('items.items')}
            placeholder={t('items.allItems')}
            data={items.map((row) => ({ value: row.id, label: row.title }))}
            value={chosen}
            onChange={setChosen}
            searchable
          />
          <Select
            label={t('documents.writer')}
            data={[...context.writers.values()].map((row) => ({ value: row.id, label: row.title }))}
            value={writerId}
            onChange={setWriterId}
            clearable
          />
          <Group>
            <ExportMenu
              title={t('items.itemCards')}
              pdf={itemCards}
              disabled={items.length === 0}
            />
          </Group>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack>
          <Title order={5}>{t('items.coupons')}</Title>
          <Group grow>
            <TextInput
              label={t('items.couponValue')}
              value={couponValue}
              onChange={(event) => setCouponValue(event.currentTarget.value)}
            />
            <NumberInput
              label={t('items.couponCount')}
              value={couponCount}
              min={1}
              max={400}
              onChange={(value) => setCouponCount(Math.max(1, Math.round(Number(value) || 1)))}
            />
          </Group>
          <TextInput
            label={t('items.couponText')}
            placeholder={t('items.couponTextHint')}
            value={couponText}
            onChange={(event) => setCouponText(event.currentTarget.value)}
          />
          <Group>
            <ExportMenu title={t('items.coupons')} pdf={coupons} />
          </Group>
        </Stack>
      </Paper>
    </SimpleGrid>
  );
}
