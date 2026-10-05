import type { currencyKind } from '../kinds';
import { itemKind, readData } from '../kinds';
import type { RecordRow } from '../model';
import { formatNumber } from '../format';

export type CurrencyData = ReturnType<typeof readData<typeof currencyKind.data>>;

/** Czech plural form for a count: 1 orel, 2–4 orly, 0 / 5+ / decimals orlů. */
export function czechForm(
  count: number,
  forms: { one: string; few: string; many: string },
): string {
  if (!Number.isInteger(count)) return forms.many;
  const n = Math.abs(count);
  if (n === 1) return forms.one;
  if (n >= 2 && n <= 4) return forms.few;
  return forms.many;
}

/**
 * An amount in the game's money, e.g. 1.5 -> "1 orel 5 grošů", 0.3 -> "3
 * groše", 2 -> "2 orly". Rounded to whole sub-units.
 */
export function formatMoney(value: number, currency: CurrencyData): string {
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (currency.sub_per_unit <= 0) {
    const rounded = Math.round(absolute * 100) / 100;
    return `${sign}${formatNumber(rounded)} ${czechForm(rounded, currency)}`;
  }
  const totalSub = Math.round(absolute * currency.sub_per_unit);
  const main = Math.floor(totalSub / currency.sub_per_unit);
  const sub = totalSub % currency.sub_per_unit;
  const subForms = { one: currency.sub_one, few: currency.sub_few, many: currency.sub_many };
  const parts = [
    main > 0 ? `${String(main)} ${czechForm(main, currency)}` : '',
    sub > 0 ? `${String(sub)} ${czechForm(sub, subForms)}` : '',
  ].filter(Boolean);
  return parts.length ? `${sign}${parts.join(' ')}` : `0 ${currency.many}`;
}

/** The phase's price multiplier (1 when not set). */
export function multiplier(
  currency: CurrencyData | undefined,
  phaseId: string | null | undefined,
): number {
  if (!currency || !phaseId) return 1;
  return currency.multipliers[phaseId] ?? 1;
}

/** Can the item be bought in this phase? (No phases listed = always.) */
export function availableIn(item: RecordRow, phaseId: string | null | undefined): boolean {
  const phases = readData(itemKind, item).phase_ids;
  return (
    phases.length === 0 || (phaseId !== null && phaseId !== undefined && phases.includes(phaseId))
  );
}

/** Price and buy-back price of an item in a phase. */
export function phasePrices(
  item: RecordRow,
  currency: CurrencyData | undefined,
  phaseId: string | null | undefined,
): { price: number; buyback: number } {
  const data = readData(itemKind, item);
  const factor = multiplier(currency, phaseId);
  return { price: data.price * factor, buyback: data.buyback_price * factor };
}
