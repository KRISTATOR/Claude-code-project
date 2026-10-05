import { z } from 'zod';
import { richDoc } from '../richtext';
import { defineKind, emptySecret } from './registry';

/** Milestone 6 kinds: food, budget, equipment, tasks, notes and feedback. */

const id = z.string().nullable().catch(null).default(null);
const text = z.string().catch('').default('');
const amount = z.number().min(0).catch(0).default(0);
const strings = z.array(z.string()).catch([]).default([]);

/**
 * The 14 EU allergens, in the order Czech menus number them (1 = lepek …),
 * plus two diets. Registrations and dishes use these codes.
 */
export const allergens = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof allergens)[number];
export const diets = ['vegetarian', 'vegan'] as const;
export type Diet = (typeof diets)[number];

/** Something bought for the kitchen: its unit, shop, price and package size. */
export const ingredientKind = defineKind({
  kind: 'ingredient',
  data: z.object({
    /** The unit it is bought and priced in: g, kg, ml, l, ks… */
    unit: z.string().catch('kg').default('kg'),
    shop: text,
    /** Price of one unit in CZK. */
    price: amount,
    /** Package size in units (0 = sold loose). */
    pack: amount,
    allergens: strings,
    /** Not suitable for vegetarians (meat, fish, gelatine). */
    meat: z.boolean().catch(false).default(false),
    /** Not vegan (dairy, eggs, honey); meat implies it. */
    animal: z.boolean().catch(false).default(false),
    note: text,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['shop', 'note'],
});

export const dishLine = z.object({
  ingredient_id: z.string().default(''),
  /** Quantity per head. */
  quantity: amount,
  /** The unit of `quantity`; converted to the ingredient's unit when compatible. */
  unit: z.string().default(''),
});
export type DishLine = z.infer<typeof dishLine>;

/** A dish and what one portion needs. */
export const dishKind = defineKind({
  kind: 'dish',
  data: z.object({
    lines: z.array(dishLine).catch([]).default([]),
    /** Allergens the ingredients don't reveal (e.g. a shared fryer). */
    allergens: strings,
    instructions: text,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['instructions'],
});

export const mealSlots = ['breakfast', 'snack', 'lunch', 'dinner', 'late'] as const;
export type MealSlot = (typeof mealSlots)[number];

export const mealDish = z.object({
  dish_id: z.string().default(''),
  /** Share of the headcount that eats it (1 = everyone; 0.3 = the vegetarian option). */
  share: z.number().min(0).max(1).catch(1).default(1),
});
export type MealDish = z.infer<typeof mealDish>;

/** One meal of the game: a day and a slot, optionally tied to a phase. */
export const mealKind = defineKind({
  kind: 'meal',
  data: z.object({
    /** Day of the game, 1-based. */
    day: z.number().int().min(1).catch(1).default(1),
    slot: z.enum(mealSlots).catch('lunch').default('lunch'),
    phase_id: id,
    dishes: z.array(mealDish).catch([]).default([]),
    /** Overrides the shopping list's headcount for this meal (e.g. NPCs only). */
    headcount: z.number().int().min(0).nullable().catch(null).default(null),
    note: text,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['note'],
});

export const budgetTypes = ['income', 'expense'] as const;
export type BudgetType = (typeof budgetTypes)[number];

/** One budget line: planned against actual, in CZK. */
export const budgetLineKind = defineKind({
  kind: 'budget_line',
  data: z.object({
    type: z.enum(budgetTypes).catch('expense').default('expense'),
    category: text,
    planned: amount,
    /** null = not spent or received yet. */
    actual: z.number().min(0).nullable().catch(null).default(null),
    note: text,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['category', 'note'],
});

export const equipmentTypes = ['players_bring', 'group_provides', 'kitchen', 'costumes'] as const;
export type EquipmentType = (typeof equipmentTypes)[number];
export const equipmentStates = ['missing', 'have', 'packed'] as const;
export type EquipmentState = (typeof equipmentStates)[number];

export const equipmentEntry = z.object({
  id: z.string(),
  name: z.string().default(''),
  quantity: z.number().int().min(0).catch(1).default(1),
  /** Who brings or wears it (a person in the team) … */
  person_id: id,
  /** … and, for costumes, which NPC or character it belongs to. */
  role_id: id,
  state: z.enum(equipmentStates).catch('missing').default('missing'),
  note: z.string().default(''),
});
export type EquipmentEntry = z.infer<typeof equipmentEntry>;

/** What players bring, what the group provides, kitchen gear, NPC costumes. */
export const equipmentListKind = defineKind({
  kind: 'equipment_list',
  data: z.object({
    type: z.enum(equipmentTypes).catch('group_provides').default('group_provides'),
    entries: z.array(equipmentEntry).catch([]).default([]),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

export const taskStatuses = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof taskStatuses)[number];

/** A to-do of the organizing team, optionally pointing at any record. */
export const taskKind = defineKind({
  kind: 'task',
  data: z.object({
    assignee_id: id,
    /** ISO date (yyyy-mm-dd). */
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .catch(null)
      .default(null),
    status: z.enum(taskStatuses).catch('todo').default('todo'),
    record_id: id,
    description: text,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description'],
});

/** A free-form notes page (per game, or team-wide without a game). */
export const noteKind = defineKind({
  kind: 'note',
  data: z.object({ body: richDoc }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['body'],
});

/**
 * Post-game survey responses attached to a game as a retrospective. Columns
 * that identify people (name, e-mail, phone) are dropped at import.
 */
export const surveyKind = defineKind({
  kind: 'survey',
  data: z.object({
    source: text,
    imported_at: text,
    questions: strings,
    responses: z.array(z.array(z.string())).catch([]).default([]),
    /** The organizers' conclusions: keep, change, drop. */
    summary: richDoc,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['summary'],
});
