import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@core/economy/money';
import { parseNumber } from '@core/format';
import { readData, recipeKind, recipeTypes, type Ingredient } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';
import { useCurrency } from './ItemsPage';

/** "100 ml mléko" */
export function ingredientLabel(ingredient: Ingredient, items: RecordRow[]): string {
  const name = items.find((row) => row.id === ingredient.item_id)?.title ?? ingredient.name;
  const quantity = String(ingredient.quantity).replace('.', ',');
  return [quantity, ingredient.unit, name].filter(Boolean).join(' ');
}

/** Recipes and crafting ("Recepty"): potions, conversions and plants. */
export function RecipesPage() {
  return <GameGate>{(game) => <Recipes game={game} />}</GameGate>;
}

function Recipes({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const recipes = useGameRecords('recipe', game.id) ?? NONE;
  const items = useGameRecords('item', game.id) ?? NONE;
  const { data: currency } = useCurrency(game);
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('recipes.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('recipes.newRecipe')}
          </Button>
        )}
      </Group>
      {recipes.length === 0 ? (
        <Text c="dimmed">{t('recipes.empty')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {recipes.map((row) => {
            const data = readData(recipeKind, row);
            return (
              <Card
                key={row.id}
                withBorder
                data-testid="recipe"
                style={{ cursor: canEdit ? 'pointer' : undefined }}
                onClick={() => canEdit && setEditing(row)}
              >
                <Group justify="space-between" mb={4}>
                  <Text fw={700}>{row.title}</Text>
                  <Badge size="xs" variant="light">
                    {t(`recipes.types.${data.type}`)}
                  </Badge>
                </Group>
                {data.ingredients.length > 0 && (
                  <Text size="sm">
                    {data.ingredients
                      .map((ingredient) => ingredientLabel(ingredient, items))
                      .join(' + ')}
                    {data.result ? ` → ${ingredientLabel(data.result, items)}` : ''}
                    {data.cost ? ` (${formatMoney(data.cost, currency)})` : ''}
                  </Text>
                )}
                {data.properties && (
                  <Text size="xs" c="dimmed" mt={4} lineClamp={3}>
                    {data.properties}
                  </Text>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      )}
      {editing && (
        <RecipeDialog
          game={game}
          items={items}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function IngredientRow({
  value,
  items,
  onChange,
  onRemove,
}: {
  value: Ingredient;
  items: RecordRow[];
  onChange: (value: Ingredient) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" wrap="nowrap" align="flex-end">
      <TextInput
        aria-label={t('recipes.quantity')}
        w={80}
        defaultValue={String(value.quantity).replace('.', ',')}
        onChange={(event) =>
          onChange({ ...value, quantity: parseNumber(event.currentTarget.value) ?? 0 })
        }
      />
      <TextInput
        aria-label={t('recipes.unit')}
        placeholder={t('recipes.unit')}
        w={70}
        value={value.unit}
        onChange={(event) => onChange({ ...value, unit: event.currentTarget.value })}
      />
      <Select
        aria-label={t('recipes.item')}
        placeholder={t('recipes.item')}
        data={items.map((row) => ({ value: row.id, label: row.title }))}
        value={value.item_id}
        onChange={(itemId) => onChange({ ...value, item_id: itemId })}
        searchable
        clearable
        flex={1}
      />
      {!value.item_id && (
        <TextInput
          aria-label={t('recipes.name')}
          placeholder={t('recipes.name')}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.currentTarget.value })}
          flex={1}
        />
      )}
      {onRemove && (
        <ActionIcon variant="subtle" color="red" aria-label={t('common.delete')} onClick={onRemove}>
          <IconX size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}

const EMPTY: Ingredient = { item_id: null, name: '', quantity: 1, unit: '' };

function RecipeDialog({
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
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(readData(recipeKind, record ?? { data: {} }));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : repo.createRecord({
            kind: 'recipe',
            title: title.trim(),
            game_id: game.id,
            data: fields,
          }),
    );
    if (ok) onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('recipes.edit') : t('recipes.newRecipe')}
      size="xl"
    >
      <Stack>
        <Group grow>
          <TextInput
            label={t('common.name')}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            data-autofocus
          />
          <Select
            label={t('recipes.type')}
            data={recipeTypes.map((value) => ({ value, label: t(`recipes.types.${value}`) }))}
            value={fields.type}
            onChange={(value) => value && set('type', value)}
            allowDeselect={false}
          />
        </Group>
        <Text fw={600} size="sm">
          {t('recipes.ingredients')}
        </Text>
        {fields.ingredients.map((ingredient, index) => (
          <IngredientRow
            key={index}
            value={ingredient}
            items={items}
            onChange={(value) =>
              set(
                'ingredients',
                fields.ingredients.map((item, i) => (i === index ? value : item)),
              )
            }
            onRemove={() =>
              set(
                'ingredients',
                fields.ingredients.filter((_, i) => i !== index),
              )
            }
          />
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={() => set('ingredients', [...fields.ingredients, EMPTY])}
          >
            {t('recipes.addIngredient')}
          </Button>
        </Group>
        <Text fw={600} size="sm">
          {t('recipes.result')}
        </Text>
        <IngredientRow
          value={fields.result ?? EMPTY}
          items={items}
          onChange={(value) => set('result', value)}
        />
        <TextInput
          label={t('recipes.cost')}
          description={t('items.priceHint')}
          defaultValue={fields.cost ? String(fields.cost).replace('.', ',') : ''}
          onChange={(event) => set('cost', parseNumber(event.currentTarget.value) ?? 0)}
          maw={200}
        />
        <Textarea
          label={t('recipes.steps')}
          description={t('recipes.stepsHint')}
          autosize
          minRows={2}
          value={fields.steps}
          onChange={(event) => set('steps', event.currentTarget.value)}
        />
        <Textarea
          label={t('recipes.properties')}
          autosize
          minRows={2}
          value={fields.properties}
          onChange={(event) => set('properties', event.currentTarget.value)}
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
