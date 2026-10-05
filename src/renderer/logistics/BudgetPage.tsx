import {
  ActionIcon,
  Autocomplete,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconDownload, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCzk } from '@core/format';
import { budgetLineKind, budgetTypes, readData } from '@core/kinds';
import { budgetSummary, budgetXlsx, type Sums } from '@core/logistics/budget';
import { registeredHeadcount, shoppingList } from '@core/logistics/food';
import type { RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, useRegistrations } from '../data/hooks';
import { save } from '../print/service';
import { GameGate, useRun } from '../tools/common';
import { DecimalInput } from './common';

/** The budget ("Rozpočet"): income and expenses, planned against actual. */
export function BudgetPage() {
  return <GameGate>{(game) => <Budget game={game} />}</GameGate>;
}

function Budget({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const run = useRun();
  const lines = useGameRecords('budget_line', game.id) ?? NONE;
  const registered = registeredHeadcount(useRegistrations(game.id) ?? []);
  const [override, setHeadcount] = useState<number | null>(null);
  const headcount = override ?? registered;
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const summary = budgetSummary(lines, headcount);
  const food = shoppingList({
    meals: useGameRecords('meal', game.id) ?? NONE,
    dishes: useGameRecords('dish', game.id) ?? NONE,
    ingredients: useGameRecords('ingredient', game.id) ?? NONE,
    headcount,
  });
  const categories = [
    ...new Set(lines.map((row) => readData(budgetLineKind, row).category).filter(Boolean)),
  ].sort(compareCzech);

  const card = (label: string, sums: Sums, testId: string) => (
    <Paper withBorder p="sm" data-testid={testId}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700}>{formatCzk(sums.actual)}</Text>
      <Text size="xs" c="dimmed">
        {t('budget.planned')}: {formatCzk(sums.planned)}
      </Text>
    </Paper>
  );

  async function exportXlsx() {
    const bytes = await budgetXlsx({
      title: `${t('budget.title')} ${game.title}`,
      lines,
      headcount,
      labels: {
        sheet: t('budget.sheet'),
        title: t('budget.title'),
        type: t('budget.type'),
        category: t('budget.category'),
        item: t('budget.item'),
        planned: t('budget.planned'),
        actual: t('budget.actual'),
        difference: t('budget.difference'),
        note: t('budget.note'),
        income: t('budget.types.income'),
        expense: t('budget.types.expense'),
        totalIncome: t('budget.totalIncome'),
        totalExpense: t('budget.totalExpense'),
        balance: t('budget.balance'),
        headcount: t('budget.headcount'),
        perHead: t('budget.perHead'),
      },
    });
    await save(bytes, `${t('budget.title')} ${game.title}`, 'xlsx');
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('budget.title')} · {game.title}
        </Title>
        <Group>
          <Button
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={() => void run(exportXlsx)}
          >
            {t('budget.exportXlsx')}
          </Button>
          {canEdit && (
            <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
              {t('budget.newLine')}
            </Button>
          )}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        {card(t('budget.income'), summary.income, 'budget-income')}
        {card(t('budget.expense'), summary.expense, 'budget-expense')}
        {card(t('budget.balance'), summary.balance, 'budget-balance')}
        {card(t('budget.perHead'), summary.perHead, 'budget-per-head')}
      </SimpleGrid>
      <Group align="flex-end">
        <NumberInput
          label={t('budget.headcount')}
          description={t('food.shoppingHeadcountHint', { count: registered })}
          min={0}
          value={headcount}
          onChange={(value) => setHeadcount(Math.max(0, Math.round(Number(value) || 0)))}
          w={200}
        />
        {food.total > 0 && (
          <Text size="sm" c="dimmed">
            {t('budget.foodEstimate', { cost: formatCzk(food.total) })}
          </Text>
        )}
      </Group>
      {lines.length === 0 ? (
        <Text c="dimmed">{t('budget.empty')}</Text>
      ) : (
        budgetTypes.map((type) => {
          const rows = lines
            .filter((row) => readData(budgetLineKind, row).type === type)
            .sort(
              (a, b) =>
                compareCzech(
                  readData(budgetLineKind, a).category,
                  readData(budgetLineKind, b).category,
                ) || compareCzech(a.title, b.title),
            );
          if (rows.length === 0) return null;
          return (
            <Stack key={type} gap={4}>
              <Title order={4}>
                {type === 'income' ? t('budget.income') : t('budget.expense')}
              </Title>
              <Table striped highlightOnHover data-testid={`budget-${type}`}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('budget.category')}</Table.Th>
                    <Table.Th>{t('budget.item')}</Table.Th>
                    <Table.Th ta="right">{t('budget.planned')}</Table.Th>
                    <Table.Th ta="right">{t('budget.actual')}</Table.Th>
                    <Table.Th ta="right">{t('budget.difference')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => {
                    const data = readData(budgetLineKind, row);
                    const difference = data.actual === null ? null : data.actual - data.planned;
                    // Spending more or earning less than planned is bad news.
                    const bad =
                      difference !== null && (type === 'expense' ? difference > 0 : difference < 0);
                    return (
                      <Table.Tr
                        key={row.id}
                        style={{ cursor: canEdit ? 'pointer' : undefined }}
                        onClick={() => canEdit && setEditing(row)}
                      >
                        <Table.Td>{data.category}</Table.Td>
                        <Table.Td>
                          {row.title}
                          {data.note && (
                            <Text size="xs" c="dimmed">
                              {data.note}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">{formatCzk(data.planned)}</Table.Td>
                        <Table.Td ta="right">
                          {data.actual === null ? '–' : formatCzk(data.actual)}
                        </Table.Td>
                        <Table.Td ta="right" {...(bad ? { c: 'red' } : {})}>
                          {difference === null ? '' : formatCzk(difference)}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Stack>
          );
        })
      )}
      {editing && (
        <LineDialog
          game={game}
          categories={categories}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function LineDialog({
  game,
  categories,
  record,
  onClose,
}: {
  game: RecordRow;
  categories: string[];
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(() => readData(budgetLineKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function saveLine() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'budget_line',
            title: title.trim(),
            game_id: game.id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('budget.editLine') : t('budget.newLine')}>
      <Stack>
        <SegmentedControl
          data={budgetTypes.map((value) => ({ value, label: t(`budget.types.${value}`) }))}
          value={fields.type}
          onChange={(value) => set('type', value)}
        />
        <TextInput
          label={t('budget.item')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Autocomplete
          label={t('budget.category')}
          placeholder={t('budget.categoryHint')}
          data={categories}
          value={fields.category}
          onChange={(value) => set('category', value)}
        />
        <Group grow align="flex-start">
          <DecimalInput
            label={t('budget.planned')}
            value={fields.planned}
            onValue={(value) => set('planned', value ?? 0)}
          />
          <DecimalInput
            label={t('budget.actual')}
            description={t('budget.actualHint')}
            nullable
            value={fields.actual}
            onValue={(value) => set('actual', value)}
          />
        </Group>
        <TextInput
          label={t('budget.note')}
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
            <Button disabled={!title.trim()} onClick={() => void saveLine()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
