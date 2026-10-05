import { budgetLineKind, readData, type BudgetType } from '../kinds';
import type { RecordRow } from '../model';
import { compareCzech } from '../text';

export interface Sums {
  planned: number;
  actual: number;
}

export interface BudgetCategory extends Sums {
  type: BudgetType;
  category: string;
  lines: number;
}

export interface BudgetSummary {
  income: Sums;
  expense: Sums;
  /** Income minus expenses. */
  balance: Sums;
  /** Expenses divided by the headcount (0 without a headcount). */
  perHead: Sums;
  categories: BudgetCategory[];
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Planned against actual, by category, with cost per head. Unknown actuals count as 0. */
export function budgetSummary(lines: readonly RecordRow[], headcount: number): BudgetSummary {
  const income: Sums = { planned: 0, actual: 0 };
  const expense: Sums = { planned: 0, actual: 0 };
  const categories = new Map<string, BudgetCategory>();
  for (const line of lines) {
    const data = readData(budgetLineKind, line);
    const sums = data.type === 'income' ? income : expense;
    sums.planned += data.planned;
    sums.actual += data.actual ?? 0;
    const category = data.category.trim();
    const key = `${data.type}:${category}`;
    const entry = categories.get(key) ?? {
      type: data.type,
      category,
      planned: 0,
      actual: 0,
      lines: 0,
    };
    entry.planned += data.planned;
    entry.actual += data.actual ?? 0;
    entry.lines += 1;
    categories.set(key, entry);
  }
  const fix = (sums: Sums): Sums => ({ planned: round(sums.planned), actual: round(sums.actual) });
  return {
    income: fix(income),
    expense: fix(expense),
    balance: fix({
      planned: income.planned - expense.planned,
      actual: income.actual - expense.actual,
    }),
    perHead:
      headcount > 0
        ? fix({ planned: expense.planned / headcount, actual: expense.actual / headcount })
        : { planned: 0, actual: 0 },
    categories: [...categories.values()]
      .map((entry) => ({ ...entry, planned: round(entry.planned), actual: round(entry.actual) }))
      .sort(
        (a, b) =>
          (a.type === b.type ? 0 : a.type === 'income' ? -1 : 1) ||
          compareCzech(a.category, b.category),
      ),
  };
}

export interface BudgetSheetLabels {
  sheet: string;
  title: string;
  type: string;
  category: string;
  item: string;
  planned: string;
  actual: string;
  difference: string;
  note: string;
  income: string;
  expense: string;
  totalIncome: string;
  totalExpense: string;
  balance: string;
  headcount: string;
  perHead: string;
}

/** The budget as an `.xlsx` workbook: one line per row, then the totals. */
export async function budgetXlsx(input: {
  title: string;
  lines: readonly RecordRow[];
  headcount: number;
  labels: BudgetSheetLabels;
}): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const { labels } = input;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zázemí';
  workbook.title = input.title;
  const sheet = workbook.addWorksheet(labels.sheet);
  sheet.columns = [
    { header: labels.type, key: 'type', width: 10 },
    { header: labels.category, key: 'category', width: 22 },
    { header: labels.item, key: 'item', width: 34 },
    { header: labels.planned, key: 'planned', width: 14 },
    { header: labels.actual, key: 'actual', width: 14 },
    { header: labels.difference, key: 'difference', width: 14 },
    { header: labels.note, key: 'note', width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const sorted = [...input.lines].sort((a, b) => {
    const da = readData(budgetLineKind, a);
    const db = readData(budgetLineKind, b);
    return (
      (da.type === db.type ? 0 : da.type === 'income' ? -1 : 1) ||
      compareCzech(da.category, db.category) ||
      compareCzech(a.title, b.title)
    );
  });
  for (const line of sorted) {
    const data = readData(budgetLineKind, line);
    const row = sheet.addRow({
      type: data.type === 'income' ? labels.income : labels.expense,
      category: data.category,
      item: line.title,
      planned: data.planned,
      actual: data.actual ?? null,
      note: data.note,
    });
    const r = row.number;
    // A formula, so the sheet stays live when someone edits it in Excel.
    row.getCell('difference').value = { formula: `IF(ISBLANK(E${r}),"",E${r}-D${r})` };
  }

  const last = sheet.rowCount;
  const sumIf = (column: string, label: string) =>
    `SUMIF(A2:A${last},"${label}",${column}2:${column}${last})`;
  sheet.addRow([]);
  const totals: [string, string, string][] = [
    [labels.totalIncome, sumIf('D', labels.income), sumIf('E', labels.income)],
    [labels.totalExpense, sumIf('D', labels.expense), sumIf('E', labels.expense)],
  ];
  const first = sheet.rowCount + 1;
  for (const [label, planned, actual] of totals) {
    const row = sheet.addRow([label]);
    row.getCell(4).value = { formula: planned };
    row.getCell(5).value = { formula: actual };
    row.font = { bold: true };
  }
  const balance = sheet.addRow([labels.balance]);
  balance.getCell(4).value = { formula: `D${first}-D${first + 1}` };
  balance.getCell(5).value = { formula: `E${first}-E${first + 1}` };
  balance.font = { bold: true };
  const heads = sheet.addRow([labels.headcount]);
  heads.getCell(4).value = input.headcount;
  const perHead = sheet.addRow([labels.perHead]);
  perHead.getCell(4).value = {
    formula: `IF(D${heads.number}>0,D${first + 1}/D${heads.number},0)`,
  };
  perHead.getCell(5).value = {
    formula: `IF(D${heads.number}>0,E${first + 1}/D${heads.number},0)`,
  };
  for (const column of ['D', 'E', 'F']) {
    sheet.getColumn(column).numFmt = '#,##0.00 "Kč"';
  }
  heads.getCell(4).numFmt = '0';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
