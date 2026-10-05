import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { RecordRow, RegistrationRow } from '../model';
import { budgetSummary, budgetXlsx, type BudgetSheetLabels } from './budget';
import { csvTable, detectDelimiter, parseCsv } from './csv';
import { convertUnit, dishProfile, mealFlags, shoppingList, shoppingXlsx, sortMeals } from './food';
import { allergensFrom, guessMapping, importRegistrations, minorFrom } from './registrations';
import { identifyingColumns, summarizeQuestion, surveyData } from './survey';
import { isOverdue, sortTasks } from './tasks';

let next = 0;
function rec(kind: string, title: string, data: Record<string, unknown> = {}): RecordRow {
  next += 1;
  return {
    id: `id-${String(next).padStart(3, '0')}`,
    team_id: 't',
    kind,
    world_id: null,
    game_id: 'g',
    parent_id: null,
    title,
    data,
    visibility: 'organizers',
    inherit_audience: false,
    sort_key: '',
    tags: [],
    rev: 1,
    created_by: null,
    created_at: '2026-10-05T10:00:00Z',
    updated_by: null,
    updated_at: '',
    deleted_by: null,
    deleted_at: null,
  };
}

function registration(name: string, allergens: string[], extra: Partial<RegistrationRow> = {}) {
  next += 1;
  return {
    id: `reg-${String(next)}`,
    team_id: 't',
    game_id: 'g',
    person_id: null,
    character_id: null,
    name,
    status: 'confirmed',
    is_minor: false,
    consent_on_file: false,
    allergens,
    allergies: '',
    emergency_contact: '',
    note: '',
    rev: 1,
    created_at: '',
    updated_at: '',
    ...extra,
  } satisfies RegistrationRow;
}

describe('csv', () => {
  it('reads quoted fields, doubled quotes, line breaks and a BOM', () => {
    const text = '﻿Jméno,Poznámka\r\n"Novák, Jan","Řekl ""ahoj""\r\na odešel"\r\nEva,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['Jméno', 'Poznámka'],
      ['Novák, Jan', 'Řekl "ahoj"\r\na odešel'],
      ['Eva', ''],
    ]);
  });

  it('detects the semicolons Czech Excel uses', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    expect(parseCsv('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });

  it('pads short rows to the header width', () => {
    expect(csvTable('a,b,c\n1\n')).toEqual({ headers: ['a', 'b', 'c'], rows: [['1', '', '']] });
  });
});

describe('food', () => {
  const flour = rec('ingredient', 'Mouka hladká', {
    unit: 'kg',
    shop: 'Makro',
    price: 20,
    pack: 1,
    allergens: ['gluten'],
  });
  const milk = rec('ingredient', 'Mléko', {
    unit: 'l',
    shop: 'Makro',
    price: 25,
    pack: 0,
    allergens: ['milk'],
    animal: true,
  });
  const bacon = rec('ingredient', 'Slanina', {
    unit: 'kg',
    shop: 'Řeznictví Lipnov',
    price: 200,
    meat: true,
  });
  const potatoes = rec('ingredient', 'Brambory', { unit: 'kg', price: 15, pack: 5 });
  const pancakes = rec('dish', 'Lívance', {
    lines: [
      { ingredient_id: flour.id, quantity: 100, unit: 'g' },
      { ingredient_id: milk.id, quantity: 2, unit: 'dl' },
    ],
  });
  const stew = rec('dish', 'Guláš', {
    lines: [
      { ingredient_id: bacon.id, quantity: 50, unit: 'g' },
      { ingredient_id: potatoes.id, quantity: 0.3, unit: '' },
    ],
  });
  const veggie = rec('dish', 'Bramboráky', {
    lines: [{ ingredient_id: potatoes.id, quantity: 300, unit: 'g' }],
  });
  const odd = rec('dish', 'Divná polévka', {
    lines: [{ ingredient_id: flour.id, quantity: 2, unit: 'lžíce' }],
  });
  const ingredients = [flour, milk, bacon, potatoes];
  const dishes = [pancakes, stew, veggie, odd];

  it('converts compatible units only', () => {
    expect(convertUnit(250, 'g', 'kg')).toBe(0.25);
    expect(convertUnit(2, 'dl', 'l')).toBe(0.2);
    expect(convertUnit(3, 'dkg', 'g')).toBe(30);
    expect(convertUnit(1, '', 'kg')).toBe(1);
    expect(convertUnit(1, 'KG.', 'kg')).toBe(1);
    expect(convertUnit(1, 'ks', 'kg')).toBeNull();
    expect(convertUnit(2, 'lžíce', 'kg')).toBeNull();
  });

  it('builds a shopping list for a headcount, grouped by shop', async () => {
    const breakfast = rec('meal', 'Snídaně', {
      day: 1,
      slot: 'breakfast',
      dishes: [{ dish_id: pancakes.id }],
    });
    const lunch = rec('meal', 'Oběd', {
      day: 1,
      slot: 'lunch',
      dishes: [
        { dish_id: stew.id, share: 0.75 },
        { dish_id: veggie.id, share: 0.25 },
      ],
    });
    const npcSnack = rec('meal', 'Svačina CP', {
      day: 1,
      slot: 'snack',
      headcount: 5,
      dishes: [{ dish_id: pancakes.id }, { dish_id: odd.id }],
    });
    const list = shoppingList({
      meals: [breakfast, lunch, npcSnack],
      dishes,
      ingredients,
      headcount: 40,
    });

    expect(list.shops.map((shop) => shop.shop)).toEqual(['Makro', 'Řeznictví Lipnov', '']);
    const items = Object.fromEntries(
      list.shops.flatMap((shop) => shop.items).map((item) => [item.name, item]),
    );
    // 45 portions × 100 g = 4.5 kg → five 1 kg packs.
    expect(items['Mouka hladká']).toMatchObject({ quantity: 4.5, packs: 5, buy: 5, cost: 100 });
    // 45 × 0.2 l = 9 l, sold loose.
    expect(items['Mléko']).toMatchObject({ quantity: 9, packs: null, buy: 9, cost: 225 });
    // 30 portions × 50 g.
    expect(items['Slanina']).toMatchObject({ quantity: 1.5, cost: 300 });
    // 30 × 0.3 kg + 10 × 0.3 kg = 12 kg → three 5 kg sacks.
    expect(items['Brambory']).toMatchObject({ quantity: 12, packs: 3, buy: 15, cost: 225 });
    expect(list.total).toBe(850);
    expect(list.perHead).toBe(21.25);
    expect(list.problems).toEqual([{ dish_id: odd.id, ingredient_id: flour.id, unit: 'lžíce' }]);
    const bytes = await shoppingXlsx(list, {
      sheet: 'Nákup',
      shop: 'Obchod',
      noShop: 'Neurčeno',
      item: 'Surovina',
      need: 'Potřeba',
      buy: 'Koupit',
      unit: 'Jednotka',
      packs: 'Balení',
      cost: 'Cena',
      total: 'Celkem',
      perHead: 'Na osobu',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const rows: string[] = [];
    workbook.getWorksheet('Nákup')?.eachRow((row) => rows.push(row.getCell(2).text));
    expect(rows).toContain('Brambory');
    expect(list.meals.find((meal) => meal.meal_id === npcSnack.id)).toMatchObject({
      heads: 5,
      cost: 35,
      perHead: 7,
    });
  });

  it('derives allergens and diets from ingredients', () => {
    expect(dishProfile(pancakes, ingredients)).toEqual({
      allergens: ['gluten', 'milk'],
      diets: ['vegetarian'],
    });
    expect(dishProfile(veggie, ingredients)).toEqual({
      allergens: [],
      diets: ['vegetarian', 'vegan'],
    });
    expect(dishProfile(stew, ingredients).diets).toEqual([]);
  });

  it('flags people a meal leaves without a safe option', () => {
    const lunch = rec('meal', 'Oběd', {
      dishes: [
        { dish_id: stew.id, share: 0.8 },
        { dish_id: veggie.id, share: 0.2 },
      ],
    });
    const breakfast = rec('meal', 'Snídaně', { dishes: [{ dish_id: pancakes.id }] });
    const coeliac = registration('Hana', ['gluten']);
    const vegan = registration('Ivo', ['vegan']);
    const cancelled = registration('Ota', ['milk'], { status: 'cancelled' });
    const people = [coeliac, vegan, cancelled];

    expect(mealFlags(lunch, dishes, ingredients, people)).toEqual([]);
    expect(mealFlags(breakfast, dishes, ingredients, people)).toEqual([
      { registration_id: coeliac.id, dish_ids: [pancakes.id], reasons: ['gluten'] },
      { registration_id: vegan.id, dish_ids: [pancakes.id], reasons: ['vegan'] },
    ]);
    const meatOnly = rec('meal', 'Večeře', { dishes: [{ dish_id: stew.id, share: 0.5 }] });
    expect(mealFlags(meatOnly, dishes, ingredients, [vegan])).toHaveLength(1);
  });

  it('orders meals by day and slot', () => {
    const a = rec('meal', 'a', { day: 2, slot: 'breakfast' });
    const b = rec('meal', 'b', { day: 1, slot: 'dinner' });
    const c = rec('meal', 'c', { day: 1, slot: 'lunch' });
    expect(sortMeals([a, b, c]).map((meal) => meal.title)).toEqual(['c', 'b', 'a']);
  });
});

describe('budget', () => {
  const lines = [
    rec('budget_line', 'Poplatky hráčů', {
      type: 'income',
      category: 'Poplatky',
      planned: 40000,
      actual: 38000,
    }),
    rec('budget_line', 'Pronájem statku', {
      type: 'expense',
      category: 'Prostory',
      planned: 15000,
      actual: 15000,
    }),
    rec('budget_line', 'Nákup jídla', {
      type: 'expense',
      category: 'Jídlo',
      planned: 12000,
      actual: null,
    }),
    rec('budget_line', 'Pečivo', {
      type: 'expense',
      category: 'Jídlo',
      planned: 3000,
      actual: 3500,
    }),
  ];

  it('sums planned against actual with cost per head', () => {
    const summary = budgetSummary(lines, 40);
    expect(summary.income).toEqual({ planned: 40000, actual: 38000 });
    expect(summary.expense).toEqual({ planned: 30000, actual: 18500 });
    expect(summary.balance).toEqual({ planned: 10000, actual: 19500 });
    expect(summary.perHead).toEqual({ planned: 750, actual: 462.5 });
    expect(summary.categories.map((c) => `${c.type}:${c.category}:${String(c.planned)}`)).toEqual([
      'income:Poplatky:40000',
      'expense:Jídlo:15000',
      'expense:Prostory:15000',
    ]);
    expect(budgetSummary(lines, 0).perHead).toEqual({ planned: 0, actual: 0 });
  });

  it('exports an xlsx with formulas for the totals', async () => {
    const labels: BudgetSheetLabels = {
      sheet: 'Rozpočet',
      title: 'Rozpočet',
      type: 'Typ',
      category: 'Kategorie',
      item: 'Položka',
      planned: 'Plán',
      actual: 'Skutečnost',
      difference: 'Rozdíl',
      note: 'Poznámka',
      income: 'Příjem',
      expense: 'Výdaj',
      totalIncome: 'Příjmy celkem',
      totalExpense: 'Výdaje celkem',
      balance: 'Bilance',
      headcount: 'Počet osob',
      perHead: 'Na osobu',
    };
    const bytes = await budgetXlsx({ title: 'Pevnost', lines, headcount: 40, labels });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet('Rozpočet');
    expect(sheet).toBeDefined();
    if (!sheet) return;
    expect(sheet.getRow(1).getCell(3).value).toBe('Položka');
    expect(sheet.getRow(2).getCell(3).value).toBe('Poplatky hráčů');
    expect(sheet.getRow(2).getCell(1).value).toBe('Příjem');
    const values: string[] = [];
    sheet.eachRow((row) => values.push(row.getCell(1).text));
    expect(values).toContain('Výdaje celkem');
    const total = sheet.getRow(values.indexOf('Výdaje celkem') + 1).getCell(4).value as {
      formula: string;
    };
    expect(total.formula).toContain('SUMIF');
  });
});

describe('registrations import', () => {
  const headers = [
    'Časová značka',
    'E-mailová adresa',
    'Jméno a příjmení',
    'Datum narození',
    'Máš nějaké alergie nebo dietní omezení?',
    'Kontakt v případě nouze (jméno a telefon)',
    'Poznámka pro organizátory',
  ];

  it('guesses the columns from Google Forms headers', () => {
    expect(guessMapping(headers)).toEqual({ name: 2, age: 3, allergies: 4, emergency: 5, note: 6 });
  });

  it('works out who is under 18 at the game', () => {
    const at = new Date(2027, 4, 14);
    expect(minorFrom('15.5.2009', 'Datum narození', at)).toBe(true);
    expect(minorFrom('14.5.2009', 'Datum narození', at)).toBe(false);
    expect(minorFrom('2010-01-01', 'Datum narození', at)).toBe(true);
    expect(minorFrom('17', 'Věk', at)).toBe(true);
    expect(minorFrom('32', 'Věk', at)).toBe(false);
    expect(minorFrom('Ano', 'Je ti alespoň 18 let?', at)).toBe(false);
    expect(minorFrom('Ano', 'Jsi nezletilý?', at)).toBe(true);
    expect(minorFrom('nevím', 'Věk', at)).toBeNull();
    expect(minorFrom('', 'Věk', at)).toBeNull();
  });

  it('recognizes allergens and diets in free text', () => {
    expect(allergensFrom('Bez lepku a laktózy, jsem vegetarián')).toEqual([
      'gluten',
      'milk',
      'vegetarian',
    ]);
    expect(allergensFrom('vegan, alergie na ořechy')).toEqual(['nuts', 'vegan']);
    expect(allergensFrom('Ne')).toEqual([]);
    expect(allergensFrom('žádné')).toEqual([]);
  });

  it('matches people, skips existing ones and keeps the later answer', () => {
    const table = csvTable(
      [
        headers.join(','),
        '1.5.2027,hana@example.test,Hana Hráčka,1.1.1999,ne,"Matka, 600 000 001",',
        '1.5.2027,lida@example.test,Lída Nová,1.6.2010,bez lepku,"Otec, 600 000 002",Přijedu později',
        '2.5.2027,lida@example.test,Lída  Nová,1.6.2010,"bez lepku, vegan","Otec, 600 000 002",',
        '2.5.2027,ivo@example.test,Ivo Hráč,1.1.1990,,,',
        '2.5.2027,,,,,,',
      ].join('\n'),
    );
    const result = importRegistrations(table, guessMapping(table.headers), {
      people: [
        { id: 'p1', display_name: 'Hana Hráčka' },
        { id: 'p2', display_name: 'Ivo Hráč' },
      ],
      existing: [{ name: 'Ivo', person_id: 'p2' }],
      at: new Date(2027, 4, 14),
    });
    expect(result.drafts).toEqual([
      {
        name: 'Hana Hráčka',
        person_id: 'p1',
        is_minor: false,
        allergens: [],
        allergies: '',
        emergency_contact: 'Matka, 600 000 001',
        note: '',
      },
      {
        name: 'Lída Nová',
        person_id: null,
        is_minor: true,
        allergens: ['gluten', 'vegan'],
        allergies: 'bez lepku, vegan',
        emergency_contact: 'Otec, 600 000 002',
        note: '',
      },
    ]);
    expect(result.replaced).toBe(1);
    expect(result.skipped).toEqual([
      { row: 5, reason: 'existing' },
      { row: 6, reason: 'empty' },
    ]);
    // The e-mail never makes it into a draft.
    expect(JSON.stringify(result)).not.toContain('example.test');
  });
});

describe('survey', () => {
  const table = csvTable(
    [
      'Časová značka,Jméno,Jak se ti hra líbila? (1-5),Co zlepšit?,Přijedeš znovu?',
      '1.6.2027,Hana,5,Víc jídla,Ano',
      '1.6.2027,Ivo,4,"Kratší noční fáze",Ano',
      '1.6.2027,Ota,"4,5",,Možná',
      '1.6.2027,Eva,3,Nic,Ano',
    ].join('\n'),
  );

  it('drops identifying columns by default', () => {
    expect(identifyingColumns(table.headers)).toEqual([0, 1]);
    const data = surveyData(table, [2, 3, 4]);
    expect(data.questions).toEqual([
      'Jak se ti hra líbila? (1-5)',
      'Co zlepšit?',
      'Přijedeš znovu?',
    ]);
    expect(data.responses[0]).toEqual(['5', 'Víc jídla', 'Ano']);
    expect(JSON.stringify(data)).not.toContain('Hana');
  });

  it('summarizes scales, choices and free text', () => {
    expect(summarizeQuestion(['5', '4', '4,5', '3'])).toEqual({
      type: 'scale',
      count: 4,
      average: 4.13,
      min: 3,
      max: 5,
    });
    expect(summarizeQuestion(['Ano', 'Ano', 'Možná', 'Ano'])).toEqual({
      type: 'choice',
      count: 4,
      options: [
        { value: 'Ano', count: 3 },
        { value: 'Možná', count: 1 },
      ],
    });
    expect(summarizeQuestion(['Víc jídla', 'Kratší noc', ''])).toEqual({
      type: 'text',
      count: 2,
      answers: ['Víc jídla', 'Kratší noc'],
    });
  });
});

describe('tasks', () => {
  it('puts open tasks first, by due date', () => {
    const a = rec('task', 'Objednat seno', { due: '2027-04-01', status: 'todo' });
    const b = rec('task', 'Vytisknout dopisy', { due: null, status: 'doing' });
    const c = rec('task', 'Zamluvit statek', { due: '2027-01-10', status: 'done' });
    const d = rec('task', 'Koupit svíčky', { due: '2027-03-01', status: 'todo' });
    expect(sortTasks([a, b, c, d]).map((task) => task.title)).toEqual([
      'Koupit svíčky',
      'Objednat seno',
      'Vytisknout dopisy',
      'Zamluvit statek',
    ]);
    expect(isOverdue(d, '2027-03-02')).toBe(true);
    expect(isOverdue(c, '2027-03-02')).toBe(false);
    expect(isOverdue(b, '2027-03-02')).toBe(false);
  });
});
