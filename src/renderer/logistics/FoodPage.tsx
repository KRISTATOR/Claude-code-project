import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
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
import { IconDownload, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCzk, formatNumber } from '@core/format';
import {
  dishKind,
  ingredientKind,
  mealKind,
  mealSlots,
  readData,
  type DishLine,
  type MealDish,
} from '@core/kinds';
import {
  dishProfile,
  mealFlags,
  registeredHeadcount,
  shoppingList,
  shoppingXlsx,
  sortMeals,
} from '@core/logistics/food';
import type { RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, useRegistrations } from '../data/hooks';
import { phaseLabel } from '../print/pieces';
import { save } from '../print/service';
import { GameGate, useRun } from '../tools/common';
import { AllergenBadges, DecimalInput, useAllergenOptions } from './common';

const UNITS = ['g', 'kg', 'ml', 'l', 'ks'];

/** Food ("Jídlo"): the menu, dishes, ingredients and the shopping list. */
export function FoodPage() {
  return <GameGate>{(game) => <Food game={game} />}</GameGate>;
}

interface FoodData {
  game: RecordRow;
  meals: RecordRow[];
  dishes: RecordRow[];
  ingredients: RecordRow[];
  phases: RecordRow[];
  registered: number;
}

function Food({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const registrations = useRegistrations(game.id) ?? [];
  const data: FoodData = {
    game,
    meals: sortMeals(useGameRecords('meal', game.id) ?? NONE),
    dishes: useGameRecords('dish', game.id) ?? NONE,
    ingredients: useGameRecords('ingredient', game.id) ?? NONE,
    phases: useGameRecords('phase', game.id) ?? NONE,
    registered: registeredHeadcount(registrations),
  };
  const [tab, setTab] = useState<string | null>('menu');
  return (
    <Stack>
      <Title order={2}>
        {t('food.title')} · {game.title}
      </Title>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          {(['menu', 'dishes', 'ingredients', 'shopping'] as const).map((key) => (
            <Tabs.Tab key={key} value={key}>
              {t(`food.tabs.${key}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="menu" pt="md">
          <Menu data={data} />
        </Tabs.Panel>
        <Tabs.Panel value="dishes" pt="md">
          <Dishes data={data} />
        </Tabs.Panel>
        <Tabs.Panel value="ingredients" pt="md">
          <Ingredients data={data} />
        </Tabs.Panel>
        <Tabs.Panel value="shopping" pt="md">
          <Shopping data={data} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// --- Menu -------------------------------------------------------------------

function Menu({ data }: { data: FoodData }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const registrations = useRegistrations(data.game.id) ?? [];
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const costs = shoppingList({ ...data, headcount: data.registered }).meals;
  const days = [...new Set(data.meals.map((meal) => readData(mealKind, meal).day))];
  return (
    <Stack>
      {canEdit && (
        <Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('food.newMeal')}
          </Button>
        </Group>
      )}
      {data.meals.length === 0 && <Text c="dimmed">{t('food.noMeals')}</Text>}
      {days.map((day) => (
        <Stack key={day} gap="xs">
          <Title order={4}>{t('food.dayN', { day })}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {data.meals
              .filter((meal) => readData(mealKind, meal).day === day)
              .map((meal) => {
                const fields = readData(mealKind, meal);
                const phase = data.phases.find((row) => row.id === fields.phase_id);
                const flags = mealFlags(meal, data.dishes, data.ingredients, registrations);
                const cost = costs.find((item) => item.meal_id === meal.id);
                return (
                  <Card
                    key={meal.id}
                    withBorder
                    data-testid="meal"
                    style={{ cursor: canEdit ? 'pointer' : undefined }}
                    onClick={() => canEdit && setEditing(meal)}
                  >
                    <Group justify="space-between" mb={4}>
                      <Text fw={700}>{meal.title}</Text>
                      {phase && (
                        <Badge size="xs" variant="light" color="grape">
                          {phaseLabel(phase)}
                        </Badge>
                      )}
                    </Group>
                    {fields.dishes.map((entry, index) => {
                      const dish = data.dishes.find((row) => row.id === entry.dish_id);
                      return dish ? (
                        <Text key={index} size="sm">
                          {dish.title}
                          {entry.share < 1 ? ` (${formatNumber(entry.share * 100, 0)} %)` : ''}
                        </Text>
                      ) : null;
                    })}
                    {cost && cost.heads > 0 && cost.cost > 0 && (
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('food.mealCost', { cost: formatCzk(cost.perHead) })}
                        {fields.headcount !== null
                          ? ` · ${t('food.heads', { count: fields.headcount })}`
                          : ''}
                      </Text>
                    )}
                    {flags.length > 0 && (
                      <Alert color="red" variant="light" p={6} mt={6} data-testid="meal-flags">
                        <Text size="xs">
                          {t('food.flags', {
                            names: flags
                              .map((flag) => {
                                const who = registrations.find(
                                  (row) => row.id === flag.registration_id,
                                );
                                const reasons = flag.reasons
                                  .map((code) => t(`allergens.${code as 'gluten'}`))
                                  .join(', ');
                                return `${who?.name ?? '?'} (${reasons})`;
                              })
                              .join('; '),
                          })}
                        </Text>
                      </Alert>
                    )}
                  </Card>
                );
              })}
          </SimpleGrid>
        </Stack>
      ))}
      {editing && (
        <MealDialog
          data={data}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function MealDialog({
  data,
  record,
  onClose,
}: {
  data: FoodData;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const last = data.meals.at(-1);
  const [fields, setFields] = useState(() =>
    readData(
      mealKind,
      record ?? { data: { day: last ? readData(mealKind, last).day : 1, dishes: [] } },
    ),
  );
  const [title, setTitle] = useState(record?.title ?? '');
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const setDish = (index: number, patch: Partial<MealDish>) =>
    set(
      'dishes',
      fields.dishes.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  const autoTitle = `${t('food.dayN', { day: fields.day })} – ${t(`food.slots.${fields.slot}`)}`;
  async function saveMeal() {
    const name = title.trim() || autoTitle;
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: name,
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({ kind: 'meal', title: name, game_id: data.game.id, data: fields }),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('food.editMeal') : t('food.newMeal')}
      size="lg"
    >
      <Stack>
        <Group grow>
          <NumberInput
            label={t('food.day')}
            min={1}
            value={fields.day}
            onChange={(value) => set('day', Math.max(1, Math.round(Number(value) || 1)))}
          />
          <Select
            label={t('food.slot')}
            data={mealSlots.map((value) => ({ value, label: t(`food.slots.${value}`) }))}
            value={fields.slot}
            onChange={(value) => value && set('slot', value)}
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label={t('common.name')}
          placeholder={autoTitle}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Select
          label={t('food.phase')}
          description={t('food.phaseHint')}
          data={data.phases.map((phase) => ({ value: phase.id, label: phaseLabel(phase) }))}
          value={fields.phase_id}
          onChange={(value) => set('phase_id', value)}
          clearable
        />
        <Text fw={600} size="sm">
          {t('food.mealDishes')}
        </Text>
        {fields.dishes.map((entry, index) => (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
            <Select
              aria-label={t('kinds.dish')}
              placeholder={t('kinds.dish')}
              data={data.dishes.map((row) => ({ value: row.id, label: row.title }))}
              value={entry.dish_id || null}
              onChange={(value) => setDish(index, { dish_id: value ?? '' })}
              searchable
              flex={1}
            />
            <NumberInput
              aria-label={t('food.share')}
              w={90}
              min={0}
              max={100}
              suffix=" %"
              value={Math.round(entry.share * 100)}
              onChange={(value) =>
                setDish(index, { share: Math.min(1, Math.max(0, (Number(value) || 0) / 100)) })
              }
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() =>
                set(
                  'dishes',
                  fields.dishes.filter((_, i) => i !== index),
                )
              }
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Text size="xs" c="dimmed">
          {t('food.shareHint')}
        </Text>
        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={() => set('dishes', [...fields.dishes, { dish_id: '', share: 1 }])}
          >
            {t('food.addDish')}
          </Button>
        </Group>
        <NumberInput
          label={t('food.headcountOverride')}
          description={t('food.headcountOverrideHint')}
          min={0}
          value={fields.headcount ?? ''}
          onChange={(value) =>
            set('headcount', value === '' ? null : Math.max(0, Math.round(Number(value) || 0)))
          }
          maw={260}
        />
        <Textarea
          label={t('food.note')}
          autosize
          minRows={1}
          value={fields.note}
          onChange={(event) => set('note', event.currentTarget.value)}
        />
        <DialogButtons record={record} onClose={onClose} onSave={() => void saveMeal()} />
      </Stack>
    </Modal>
  );
}

function DialogButtons({
  record,
  onClose,
  onSave,
  canSave = true,
}: {
  record: RecordRow | null;
  onClose: () => void;
  onSave: () => void;
  canSave?: boolean;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  return (
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
        <Button disabled={!canSave} onClick={onSave}>
          {t('common.save')}
        </Button>
      </Group>
    </Group>
  );
}

// --- Dishes -----------------------------------------------------------------

function DietBadges({ diets }: { diets: string[] }) {
  const { t } = useTranslation();
  return (
    <>
      {diets.includes('vegan') ? (
        <Badge size="xs" variant="light" color="green">
          {t('food.suitsVegan')}
        </Badge>
      ) : diets.includes('vegetarian') ? (
        <Badge size="xs" variant="light" color="lime">
          {t('food.suitsVegetarian')}
        </Badge>
      ) : null}
    </>
  );
}

function lineLabel(line: DishLine, ingredients: RecordRow[]): string {
  const ingredient = ingredients.find((row) => row.id === line.ingredient_id);
  const unit = line.unit || (ingredient ? readData(ingredientKind, ingredient).unit : '');
  return `${formatNumber(line.quantity, 3)} ${unit} ${ingredient?.title ?? '?'}`;
}

function Dishes({ data }: { data: FoodData }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  return (
    <Stack>
      {canEdit && (
        <Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('food.newDish')}
          </Button>
        </Group>
      )}
      {data.dishes.length === 0 && <Text c="dimmed">{t('food.noDishes')}</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {data.dishes.map((dish) => {
          const profile = dishProfile(dish, data.ingredients);
          return (
            <Card
              key={dish.id}
              withBorder
              data-testid="dish"
              style={{ cursor: canEdit ? 'pointer' : undefined }}
              onClick={() => canEdit && setEditing(dish)}
            >
              <Group justify="space-between" mb={4}>
                <Text fw={700}>{dish.title}</Text>
                <DietBadges diets={profile.diets} />
              </Group>
              <Text size="xs" c="dimmed" mb={4}>
                {t('food.perPortion')}:{' '}
                {readData(dishKind, dish)
                  .lines.map((line) => lineLabel(line, data.ingredients))
                  .join(', ')}
              </Text>
              <AllergenBadges codes={profile.allergens} />
            </Card>
          );
        })}
      </SimpleGrid>
      {editing && (
        <DishDialog
          data={data}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function DishDialog({
  data,
  record,
  onClose,
}: {
  data: FoodData;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const allergenOptions = useAllergenOptions(false);
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(() => readData(dishKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<DishLine>) =>
    set(
      'lines',
      fields.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  async function saveDish() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'dish',
            title: title.trim(),
            game_id: data.game.id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('food.editDish') : t('food.newDish')}
      size="lg"
    >
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Text fw={600} size="sm">
          {t('food.perPortion')}
        </Text>
        {fields.lines.map((line, index) => {
          const ingredient = data.ingredients.find((row) => row.id === line.ingredient_id);
          return (
            <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
              <DecimalInput
                aria-label={t('food.quantity')}
                w={80}
                value={line.quantity}
                onValue={(value) => setLine(index, { quantity: value ?? 0 })}
              />
              <Autocomplete
                aria-label={t('food.unit')}
                placeholder={
                  ingredient ? readData(ingredientKind, ingredient).unit : t('food.unit')
                }
                w={80}
                data={UNITS}
                value={line.unit}
                onChange={(value) => setLine(index, { unit: value })}
              />
              <Select
                aria-label={t('food.ingredient')}
                placeholder={t('food.ingredient')}
                data={data.ingredients.map((row) => ({ value: row.id, label: row.title }))}
                value={line.ingredient_id || null}
                onChange={(value) => setLine(index, { ingredient_id: value ?? '' })}
                searchable
                flex={1}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t('common.delete')}
                onClick={() =>
                  set(
                    'lines',
                    fields.lines.filter((_, i) => i !== index),
                  )
                }
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          );
        })}
        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={() =>
              set('lines', [...fields.lines, { ingredient_id: '', quantity: 0, unit: '' }])
            }
          >
            {t('food.addLine')}
          </Button>
        </Group>
        <MultiSelect
          label={t('food.extraAllergens')}
          description={t('food.extraAllergensHint')}
          data={allergenOptions}
          value={fields.allergens}
          onChange={(value) => set('allergens', value)}
          searchable
        />
        <Textarea
          label={t('food.instructions')}
          autosize
          minRows={2}
          value={fields.instructions}
          onChange={(event) => set('instructions', event.currentTarget.value)}
        />
        <DialogButtons
          record={record}
          onClose={onClose}
          onSave={() => void saveDish()}
          canSave={title.trim() !== ''}
        />
      </Stack>
    </Modal>
  );
}

// --- Ingredients ------------------------------------------------------------

function Ingredients({ data }: { data: FoodData }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  return (
    <Stack>
      {canEdit && (
        <Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('food.newIngredient')}
          </Button>
        </Group>
      )}
      {data.ingredients.length === 0 ? (
        <Text c="dimmed">{t('food.noIngredients')}</Text>
      ) : (
        <Table striped highlightOnHover data-testid="ingredients">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th>{t('food.shop')}</Table.Th>
              <Table.Th>{t('food.price')}</Table.Th>
              <Table.Th>{t('food.pack')}</Table.Th>
              <Table.Th>{t('registrations.allergens')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.ingredients.map((row) => {
              const fields = readData(ingredientKind, row);
              return (
                <Table.Tr
                  key={row.id}
                  style={{ cursor: canEdit ? 'pointer' : undefined }}
                  onClick={() => canEdit && setEditing(row)}
                >
                  <Table.Td>{row.title}</Table.Td>
                  <Table.Td>{fields.shop}</Table.Td>
                  <Table.Td>
                    {formatCzk(fields.price)} / {fields.unit}
                  </Table.Td>
                  <Table.Td>
                    {fields.pack > 0 ? `${formatNumber(fields.pack, 3)} ${fields.unit}` : ''}
                  </Table.Td>
                  <Table.Td>
                    <AllergenBadges codes={fields.allergens} />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <IngredientDialog
          data={data}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function IngredientDialog({
  data,
  record,
  onClose,
}: {
  data: FoodData;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const allergenOptions = useAllergenOptions(false);
  const shops = [
    ...new Set(data.ingredients.map((row) => readData(ingredientKind, row).shop).filter(Boolean)),
  ].sort(compareCzech);
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(() => readData(ingredientKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function saveIngredient() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'ingredient',
            title: title.trim(),
            game_id: data.game.id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('food.editIngredient') : t('food.newIngredient')}
    >
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <Autocomplete
            label={t('food.buyUnit')}
            description={t('food.buyUnitHint')}
            data={UNITS}
            value={fields.unit}
            onChange={(value) => set('unit', value)}
          />
          <Autocomplete
            label={t('food.shop')}
            data={shops}
            value={fields.shop}
            onChange={(value) => set('shop', value)}
          />
        </Group>
        <Group grow align="flex-start">
          <DecimalInput
            label={t('food.price')}
            value={fields.price}
            onValue={(value) => set('price', value ?? 0)}
          />
          <DecimalInput
            label={t('food.pack')}
            description={t('food.packHint')}
            value={fields.pack}
            onValue={(value) => set('pack', value ?? 0)}
          />
        </Group>
        <MultiSelect
          label={t('registrations.allergens')}
          data={allergenOptions}
          value={fields.allergens}
          onChange={(value) => set('allergens', value)}
          searchable
        />
        <Group>
          <Checkbox
            label={t('food.meat')}
            checked={fields.meat}
            onChange={(event) => set('meat', event.currentTarget.checked)}
          />
          <Checkbox
            label={t('food.animal')}
            checked={fields.animal}
            onChange={(event) => set('animal', event.currentTarget.checked)}
          />
        </Group>
        <TextInput
          label={t('food.note')}
          value={fields.note}
          onChange={(event) => set('note', event.currentTarget.value)}
        />
        <DialogButtons
          record={record}
          onClose={onClose}
          onSave={() => void saveIngredient()}
          canSave={title.trim() !== ''}
        />
      </Stack>
    </Modal>
  );
}

// --- Shopping list ----------------------------------------------------------

function Shopping({ data }: { data: FoodData }) {
  const { t } = useTranslation();
  const run = useRun();
  // Follows the registrations until someone types a different number.
  const [override, setHeadcount] = useState<number | null>(null);
  const headcount = override ?? data.registered;
  const [chosen, setChosen] = useState<string[]>([]);
  const meals =
    chosen.length > 0 ? data.meals.filter((meal) => chosen.includes(meal.id)) : data.meals;
  const list = shoppingList({ ...data, meals, headcount });
  const amount = (value: number, unit: string) => `${formatNumber(value, 3)} ${unit}`;
  const problemNames = list.problems.map((problem) => {
    const dish = data.dishes.find((row) => row.id === problem.dish_id)?.title ?? '?';
    const ingredient =
      data.ingredients.find((row) => row.id === problem.ingredient_id)?.title ?? '?';
    return `${dish}: ${ingredient} (${problem.unit})`;
  });
  return (
    <Stack>
      <Group align="flex-end">
        <NumberInput
          label={t('food.headcount')}
          description={t('food.shoppingHeadcountHint', { count: data.registered })}
          min={0}
          value={headcount}
          onChange={(value) => setHeadcount(Math.max(0, Math.round(Number(value) || 0)))}
          w={200}
          data-testid="headcount"
        />
        {headcount !== data.registered && (
          <Button variant="subtle" onClick={() => setHeadcount(null)}>
            {t('food.useRegistered')}
          </Button>
        )}
        <MultiSelect
          label={t('food.meals')}
          placeholder={chosen.length === 0 ? t('food.allMeals') : undefined}
          data={data.meals.map((meal) => ({ value: meal.id, label: meal.title }))}
          value={chosen}
          onChange={setChosen}
          searchable
          clearable
          flex={1}
        />
      </Group>
      {problemNames.length > 0 && (
        <Alert color="orange" variant="light">
          {t('food.problems', { items: problemNames.join('; ') })}
        </Alert>
      )}
      {list.shops.length === 0 ? (
        <Text c="dimmed">{t('food.nothingToBuy')}</Text>
      ) : (
        <>
          <Group justify="space-between">
            <Text fw={700} data-testid="shopping-total">
              {t('food.total', {
                total: formatCzk(list.total),
                perHead: formatCzk(list.perHead),
              })}
            </Text>
            <Button
              variant="light"
              leftSection={<IconDownload size={14} />}
              onClick={() =>
                void run(async () => {
                  const bytes = await shoppingXlsx(list, {
                    sheet: t('food.sheet'),
                    shop: t('food.shop'),
                    noShop: t('food.noShop'),
                    item: t('food.ingredient'),
                    need: t('food.need'),
                    buy: t('food.buy'),
                    unit: t('food.unit'),
                    packs: t('food.pack'),
                    cost: t('food.cost'),
                    total: t('budget.totalExpense'),
                    perHead: t('budget.perHead'),
                  });
                  await save(bytes, `${t('food.sheet')} ${data.game.title}`, 'xlsx');
                })
              }
            >
              {t('food.exportXlsx')}
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            {list.shops.map((shop) => (
              <Paper key={shop.shop} withBorder p="sm" data-testid="shop">
                <Group justify="space-between" mb={4}>
                  <Text fw={700}>{shop.shop || t('food.noShop')}</Text>
                  <Text size="sm">{formatCzk(shop.cost)}</Text>
                </Group>
                <Table fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('food.ingredient')}</Table.Th>
                      <Table.Th>{t('food.need')}</Table.Th>
                      <Table.Th>{t('food.buy')}</Table.Th>
                      <Table.Th>{t('food.cost')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {shop.items.map((item) => (
                      <Table.Tr key={item.ingredient_id}>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>{amount(item.quantity, item.unit)}</Table.Td>
                        <Table.Td>
                          {amount(item.buy, item.unit)}
                          {item.packs !== null
                            ? ` (${t('food.packs', { count: item.packs })})`
                            : ''}
                        </Table.Td>
                        <Table.Td>{formatCzk(item.cost)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
