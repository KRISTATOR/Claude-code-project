import { compareCzech } from '../text';

/** House numbers sort numerically ("2" before "10"), then by name. */
const numeric = new Intl.Collator('cs', { numeric: true }).compare;

export function compareByHouse(
  a: { house_number: string; name: string },
  b: { house_number: string; name: string },
): number {
  if (a.house_number && !b.house_number) return -1;
  if (!a.house_number && b.house_number) return 1;
  const byHouse = numeric(a.house_number, b.house_number);
  return byHouse !== 0 ? byHouse : compareCzech(a.name, b.name);
}
