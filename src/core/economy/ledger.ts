import { itemKind, readData, transferKind } from '../kinds';
import type { RecordRow } from '../model';

/**
 * The ownership ledger: who holds what. Starting owners from the catalogue
 * plus every transfer in time order. Holders are record ids (characters,
 * NPCs, groups); null is the bank.
 */
export type Holdings = Map<string, Map<string, number>>;

export interface LedgerProblem {
  transfer_id: string;
  holder_id: string;
  item_id: string;
  /** How many the holder would be short. */
  missing: number;
}

function add(holdings: Holdings, holder: string, item: string, quantity: number) {
  const items = holdings.get(holder) ?? new Map<string, number>();
  const next = (items.get(item) ?? 0) + quantity;
  if (next === 0) items.delete(item);
  else items.set(item, next);
  holdings.set(holder, items);
}

/** Transfers in the order they happened (then by creation). */
export function sortTransfers(transfers: RecordRow[]): RecordRow[] {
  return [...transfers].sort((a, b) => {
    const x = readData(transferKind, a).at || a.created_at;
    const y = readData(transferKind, b).at || b.created_at;
    return x.localeCompare(y) || a.created_at.localeCompare(b.created_at);
  });
}

export function computeHoldings(
  items: RecordRow[],
  transfers: RecordRow[],
): { holdings: Holdings; problems: LedgerProblem[] } {
  const holdings: Holdings = new Map();
  const problems: LedgerProblem[] = [];
  for (const item of items.filter((row) => row.deleted_at === null)) {
    const data = readData(itemKind, item);
    if (data.starting_owner_id && data.starting_quantity > 0) {
      add(holdings, data.starting_owner_id, item.id, data.starting_quantity);
    }
  }
  for (const transfer of sortTransfers(transfers.filter((row) => row.deleted_at === null))) {
    const data = readData(transferKind, transfer);
    if (!data.item_id) continue;
    if (data.from_id) {
      const has = holdings.get(data.from_id)?.get(data.item_id) ?? 0;
      if (has < data.quantity) {
        problems.push({
          transfer_id: transfer.id,
          holder_id: data.from_id,
          item_id: data.item_id,
          missing: data.quantity - has,
        });
      }
      add(holdings, data.from_id, data.item_id, -data.quantity);
    }
    if (data.to_id) add(holdings, data.to_id, data.item_id, data.quantity);
  }
  return { holdings, problems };
}
