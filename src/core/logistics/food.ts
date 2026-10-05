import {
  dishKind,
  ingredientKind,
  mealKind,
  mealSlots,
  readData,
  type Diet,
  type MealSlot,
} from '../kinds';
import type { RecordRow, RegistrationRow } from '../model';
import { compareCzech } from '../text';

/** Units the kitchen converts between; anything else must match exactly. */
const UNITS: Record<string, { base: string; factor: number }> = {
  g: { base: 'g', factor: 1 },
  dkg: { base: 'g', factor: 10 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
  ks: { base: 'ks', factor: 1 },
};

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

/** Converts between units of the same dimension; null when they don't match. */
export function convertUnit(quantity: number, from: string, to: string): number | null {
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);
  if (a === b || a === '') return quantity;
  const ua = UNITS[a];
  const ub = UNITS[b];
  if (!ua || !ub || ua.base !== ub.base) return null;
  return (quantity * ua.factor) / ub.factor;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export interface ShoppingItem {
  ingredient_id: string;
  name: string;
  shop: string;
  unit: string;
  /** What the menu needs. */
  quantity: number;
  /** Whole packages to buy (null when sold loose). */
  packs: number | null;
  /** What gets bought: whole packages, or the exact quantity. */
  buy: number;
  cost: number;
}

export interface ShoppingProblem {
  dish_id: string;
  ingredient_id: string;
  /** The dish uses a unit that can't be converted to the ingredient's unit. */
  unit: string;
}

export interface ShoppingList {
  shops: { shop: string; items: ShoppingItem[]; cost: number }[];
  total: number;
  perHead: number;
  meals: { meal_id: string; heads: number; cost: number; perHead: number }[];
  problems: ShoppingProblem[];
}

/**
 * The consolidated shopping list for a headcount (the brief's "enter a
 * headcount and get a list grouped by shop, with price per head and total").
 * Each dish is cooked for `heads × share` portions; meals with their own
 * headcount override the global one.
 */
export function shoppingList(input: {
  meals: readonly RecordRow[];
  dishes: readonly RecordRow[];
  ingredients: readonly RecordRow[];
  headcount: number;
}): ShoppingList {
  const dishes = new Map(input.dishes.map((row) => [row.id, row]));
  const ingredients = new Map(input.ingredients.map((row) => [row.id, row]));
  const needed = new Map<string, number>();
  const problems: ShoppingProblem[] = [];
  const meals: ShoppingList['meals'] = [];

  for (const meal of input.meals) {
    const data = readData(mealKind, meal);
    const heads = data.headcount ?? input.headcount;
    let cost = 0;
    for (const entry of data.dishes) {
      const dish = dishes.get(entry.dish_id);
      if (!dish) continue;
      const portions = heads * entry.share;
      for (const line of readData(dishKind, dish).lines) {
        const ingredient = ingredients.get(line.ingredient_id);
        if (!ingredient) continue;
        const props = readData(ingredientKind, ingredient);
        const perPortion = convertUnit(line.quantity, line.unit, props.unit);
        if (perPortion === null) {
          if (!problems.some((p) => p.dish_id === dish.id && p.ingredient_id === ingredient.id)) {
            problems.push({ dish_id: dish.id, ingredient_id: ingredient.id, unit: line.unit });
          }
          continue;
        }
        const quantity = perPortion * portions;
        needed.set(ingredient.id, (needed.get(ingredient.id) ?? 0) + quantity);
        cost += quantity * props.price;
      }
    }
    meals.push({
      meal_id: meal.id,
      heads,
      cost: round(cost),
      perHead: heads > 0 ? round(cost / heads) : 0,
    });
  }

  const items: ShoppingItem[] = [];
  for (const [ingredientId, quantity] of needed) {
    const ingredient = ingredients.get(ingredientId);
    if (!ingredient || quantity <= 0) continue;
    const props = readData(ingredientKind, ingredient);
    const exact = round(quantity);
    const packs = props.pack > 0 ? Math.ceil(exact / props.pack - 1e-9) : null;
    const buy = packs === null ? exact : round(packs * props.pack);
    items.push({
      ingredient_id: ingredientId,
      name: ingredient.title,
      shop: props.shop.trim(),
      unit: props.unit,
      quantity: exact,
      packs,
      buy,
      cost: round(buy * props.price),
    });
  }

  const byShop = new Map<string, ShoppingItem[]>();
  for (const item of items) byShop.set(item.shop, [...(byShop.get(item.shop) ?? []), item]);
  const shops = [...byShop.entries()]
    // Items without a shop go last.
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : compareCzech(a, b)))
    .map(([shop, list]) => ({
      shop,
      items: list.sort((a, b) => compareCzech(a.name, b.name)),
      cost: round(list.reduce((sum, item) => sum + item.cost, 0)),
    }));
  const total = round(shops.reduce((sum, shop) => sum + shop.cost, 0));
  return {
    shops,
    total,
    perHead: input.headcount > 0 ? round(total / input.headcount) : 0,
    meals,
    problems,
  };
}

/** A dish's allergens and which diets it suits, derived from its ingredients. */
export function dishProfile(
  dish: RecordRow,
  ingredients: readonly RecordRow[],
): { allergens: string[]; diets: Diet[] } {
  const data = readData(dishKind, dish);
  const found = new Set(data.allergens);
  let meat = false;
  let animal = false;
  for (const line of data.lines) {
    const ingredient = ingredients.find((row) => row.id === line.ingredient_id);
    if (!ingredient) continue;
    const props = readData(ingredientKind, ingredient);
    for (const code of props.allergens) found.add(code);
    meat ||= props.meat;
    animal ||= props.animal || props.meat;
  }
  const diets: Diet[] = [];
  if (!meat) diets.push('vegetarian');
  if (!animal) diets.push('vegan');
  return { allergens: [...found], diets };
}

/** Why a person can't eat a dish: the allergens it contains, or their diet. */
export function conflicts(
  registration: Pick<RegistrationRow, 'allergens'>,
  profile: { allergens: string[]; diets: Diet[] },
): string[] {
  return registration.allergens.filter((code) =>
    code === 'vegetarian' || code === 'vegan'
      ? !profile.diets.includes(code)
      : profile.allergens.includes(code),
  );
}

export interface MealFlag {
  registration_id: string;
  dish_ids: string[];
  reasons: string[];
}

/**
 * People a meal leaves without anything to eat. Dishes everyone gets
 * (share 1) must all be safe; among the alternatives (share < 1), one safe
 * option is enough.
 */
export function mealFlags(
  meal: RecordRow,
  dishes: readonly RecordRow[],
  ingredients: readonly RecordRow[],
  registrations: readonly RegistrationRow[],
): MealFlag[] {
  const entries = readData(mealKind, meal)
    .dishes.filter((entry) => entry.share > 0)
    .map((entry) => ({ entry, dish: dishes.find((row) => row.id === entry.dish_id) }))
    .filter((item): item is { entry: (typeof item)['entry']; dish: RecordRow } => !!item.dish)
    .map(({ entry, dish }) => ({
      dish,
      everyone: entry.share >= 1,
      profile: dishProfile(dish, ingredients),
    }));
  const flags: MealFlag[] = [];
  for (const registration of registrations) {
    if (registration.status === 'cancelled' || registration.allergens.length === 0) continue;
    const bad = entries
      .map((item) => ({ ...item, reasons: conflicts(registration, item.profile) }))
      .filter((item) => item.reasons.length > 0);
    const options = entries.filter((item) => !item.everyone);
    const noSafeOption =
      options.length > 0 && options.every((item) => bad.some((b) => b.dish === item.dish));
    const relevant = bad.filter((item) => item.everyone || noSafeOption);
    if (relevant.length === 0) continue;
    flags.push({
      registration_id: registration.id,
      dish_ids: relevant.map((item) => item.dish.id),
      reasons: [...new Set(relevant.flatMap((item) => item.reasons))],
    });
  }
  return flags;
}

/** Headcount suggested by the registrations: everyone who hasn't cancelled. */
export function registeredHeadcount(registrations: readonly RegistrationRow[]): number {
  return registrations.filter((row) => row.status !== 'cancelled').length;
}

/** Meals in menu order: by day, then slot. */
export function sortMeals(meals: readonly RecordRow[]): RecordRow[] {
  const slotIndex = (slot: MealSlot) => mealSlots.indexOf(slot);
  return [...meals].sort((a, b) => {
    const da = readData(mealKind, a);
    const db = readData(mealKind, b);
    return da.day - db.day || slotIndex(da.slot) - slotIndex(db.slot);
  });
}

export interface ShoppingSheetLabels {
  sheet: string;
  shop: string;
  noShop: string;
  item: string;
  need: string;
  buy: string;
  unit: string;
  packs: string;
  cost: string;
  total: string;
  perHead: string;
}

/** The shopping list as an `.xlsx` to take to the shop or share. */
export async function shoppingXlsx(
  list: ShoppingList,
  labels: ShoppingSheetLabels,
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zázemí';
  const sheet = workbook.addWorksheet(labels.sheet);
  sheet.columns = [
    { header: labels.shop, key: 'shop', width: 20 },
    { header: labels.item, key: 'item', width: 30 },
    { header: labels.need, key: 'need', width: 12 },
    { header: labels.buy, key: 'buy', width: 12 },
    { header: labels.unit, key: 'unit', width: 8 },
    { header: labels.packs, key: 'packs', width: 10 },
    { header: labels.cost, key: 'cost', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const shop of list.shops) {
    for (const item of shop.items) {
      sheet.addRow({
        shop: shop.shop || labels.noShop,
        item: item.name,
        need: item.quantity,
        buy: item.buy,
        unit: item.unit,
        packs: item.packs,
        cost: item.cost,
      });
    }
  }
  const last = sheet.rowCount;
  sheet.addRow([]);
  const total = sheet.addRow([labels.total]);
  total.getCell(7).value = { formula: `SUM(G2:G${last})`, result: list.total };
  total.font = { bold: true };
  const perHead = sheet.addRow([labels.perHead]);
  perHead.getCell(7).value = list.perHead;
  sheet.getColumn('cost').numFmt = '#,##0.00 "Kč"';
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
