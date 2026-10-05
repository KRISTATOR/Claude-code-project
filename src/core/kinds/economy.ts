import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

/** Milestone 5 kinds: the item catalogue, money, the ledger, recipes, loot and props. */

const id = z.string().nullable().catch(null).default(null);
const ids = z.array(z.string()).catch([]).default([]);
const amount = z.number().min(0).catch(0).default(0);

export const tradeRegimes = ['free', 'rationed', 'banned', 'black_market'] as const;
export type TradeRegime = (typeof tradeRegimes)[number];
export const physicalForms = ['card', 'prop', 'none'] as const;

/** One kind of in-game item (the brief's catalogue fields). */
export const itemKind = defineKind({
  kind: 'item',
  data: z.object({
    category: z.string().default(''),
    /** Price in main currency units at multiplier 1 (decimals for sub-units). */
    price: amount,
    buyback_price: amount,
    effect: z.string().default(''),
    /** Condition or upkeep, e.g. "−2 orly za blok". */
    upkeep: z.string().default(''),
    /** Phases it can be bought in; empty = always. */
    phase_ids: ids,
    regime: z.enum(tradeRegimes).catch('free').default('free'),
    requisitionable: z.boolean().catch(false).default(false),
    /** Who holds it when the game starts (character, NPC or group) and how many. */
    starting_owner_id: id,
    starting_quantity: z.number().int().min(0).catch(0).default(0),
    physical: z.enum(physicalForms).catch('card').default('card'),
    /** For mounts and vehicles: how much faster than walking (horse 3, cart 0.75). */
    travel_factor: z.number().positive().nullable().catch(null).default(null),
  }),
  secret: z.object({ notes: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['category', 'effect', 'upkeep'],
});

/** The game's money: name forms for Czech plurals, a sub-unit and a multiplier per phase. */
export const currencyKind = defineKind({
  kind: 'currency',
  data: z.object({
    one: z.string().default('orel'),
    few: z.string().default('orly'),
    many: z.string().default('orlů'),
    sub_one: z.string().default('groš'),
    sub_few: z.string().default('groše'),
    sub_many: z.string().default('grošů'),
    /** Sub-units per main unit (0 = no sub-unit). */
    sub_per_unit: z.number().int().min(0).catch(10).default(10),
    /** Phase id -> price multiplier ("prices double in phase IV"). */
    multipliers: z.record(z.string(), z.number().positive()).catch({}).default({}),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

/**
 * One line of the ownership ledger: items moving between holders during
 * preparation or the game. Holdings are the starting owners plus all
 * transfers (src/core/economy/ledger.ts).
 */
export const transferKind = defineKind({
  kind: 'transfer',
  data: z.object({
    item_id: z.string().default(''),
    quantity: z.number().int().positive().catch(1).default(1),
    /** null = from the bank / the organizers. */
    from_id: id,
    /** null = to the bank (sold, used up, confiscated). */
    to_id: id,
    phase_id: id,
    /** When it happened (ISO timestamp, set by the app). */
    at: z.string().default(''),
    note: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['note'],
});

export const recipeTypes = ['potion', 'crafting', 'plant'] as const;

const ingredient = z.object({
  item_id: z.string().nullable().catch(null),
  name: z.string().catch(''),
  quantity: z.number().catch(1),
  unit: z.string().catch(''),
});
export type Ingredient = z.infer<typeof ingredient>;

/** Potions, crafting conversions ("100 ml mléka → 20 g sýra za 1 orla") and plant properties. */
export const recipeKind = defineKind({
  kind: 'recipe',
  data: z.object({
    type: z.enum(recipeTypes).catch('crafting').default('crafting'),
    ingredients: z.array(ingredient).catch([]).default([]),
    result: ingredient.nullable().catch(null).default(null),
    /** Cost of the conversion in main currency units. */
    cost: amount,
    /** How the organizers verify it was done right. */
    steps: z.string().default(''),
    /** Plant properties, effects, where it grows. */
    properties: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['steps', 'properties'],
});

const lootEntry = z.object({
  item_id: z.string().nullable().catch(null),
  name: z.string().catch(''),
  quantity: z.number().int().min(1).catch(1),
  how: z.string().catch(''),
  tracks: z.string().catch(''),
});

/** Loot tables and forest finds: what lies where, how to find it, what tracks lead there. */
export const lootTableKind = defineKind({
  kind: 'loot_table',
  data: z.object({
    place_id: id,
    place_name: z.string().default(''),
    map_object_id: id,
    entries: z.array(lootEntry).catch([]).default([]),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['place_name'],
});

export const conditions = ['good', 'worn', 'broken', 'missing'] as const;

/** A physical prop the group owns, across all games (team-wide, no world or game). */
export const inventoryItemKind = defineKind({
  kind: 'inventory_item',
  data: z.object({
    quantity: z.number().int().min(0).catch(1).default(1),
    location: z.string().default(''),
    condition: z.enum(conditions).catch('good').default('good'),
    note: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['location', 'note'],
});
