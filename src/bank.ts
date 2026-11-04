import { equipment, type EquipmentPiece } from '~/engine';

/** A bank imported from the RuneLite Bank Memory plugin: item id → quantity. */
export interface Bank {
  id: string;
  name: string;
  /** [item id, quantity] */
  items: [number, number][];
  imported: number;
  /** item names (lower case) the best-setup search should leave out, though the bank holds them */
  excluded?: string[];
  /** item names (lower case) the search may use although the bank doesn't hold them */
  added?: string[];
}

/**
 * Reads Bank Memory's "Copy item data to clipboard" text: a header line "Item id\tItem name\tItem quantity", then one
 * tab-separated line per item. Placeholders (quantity 0) are skipped. Returns null when the text isn't in that format.
 */
export function parseBankMemory(text: string): { items: [number, number][], names: Map<number, string> } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const start = /^item id\titem name\titem quantity$/i.test(lines[0]) ? 1 : 0;
  const qty = new Map<number, number>();
  const names = new Map<number, string>();
  let bad = 0;
  for (const line of lines.slice(start)) {
    const cols = line.split('\t');
    const id = Number(cols[0]);
    const q = Number(cols[cols.length - 1]);
    if (cols.length < 3 || !Number.isInteger(id) || !Number.isFinite(q)) { bad++; continue; }
    if (q <= 0) continue;
    qty.set(id, (qty.get(id) ?? 0) + q);
    names.set(id, cols.slice(1, -1).join('\t'));
  }
  if (!qty.size || bad > lines.length / 2) return null;
  return { items: [...qty.entries()], names };
}

const norm = (n: string) => n.toLowerCase().trim();

/**
 * Which equipment the bank holds. Owning any version of an item counts as owning it: a charged scythe for the
 * uncharged one, "Ahrim's hood 75" for the undamaged hood, and so on (the wiki data lists these under one name).
 */
export function ownedChecker(bank: Bank): (e: EquipmentPiece) => boolean {
  const ids = new Set(bank.items.map(([id]) => id));
  const names = new Set(equipment.filter((e) => ids.has(e.id)).map((e) => norm(e.name)));
  return (e) => ids.has(e.id) || names.has(norm(e.name));
}

/** The key items are switched on and off by: the name, so every version of an item goes together (as owning does). */
export const itemKey = (e: { name: string }) => norm(e.name);

const names = (v: unknown): Set<string> => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** What the best-setup search may use with this bank: what it holds minus what's switched off, plus what's added. */
export function usableChecker(bank: Bank): (e: EquipmentPiece) => boolean {
  const owned = ownedChecker(bank);
  const off = names(bank.excluded);
  const extra = names(bank.added);
  return (e) => {
    const k = itemKey(e);
    return extra.has(k) || (owned(e) && !off.has(k));
  };
}

/** One piece per item name from a list, preferring the plain or charged version (for icons and the item list). */
export function onePerName(items: EquipmentPiece[]): EquipmentPiece[] {
  const best = new Map<string, EquipmentPiece>();
  const rank = (e: EquipmentPiece) => (!e.version ? 0 : ['Charged', 'Normal', 'Active', 'Undamaged'].includes(e.version) ? 1 : 2);
  for (const e of items) {
    const k = itemKey(e);
    const cur = best.get(k);
    if (!cur || rank(e) < rank(cur)) best.set(k, e);
  }
  return [...best.values()];
}

/** How many distinct pieces of equipment (by name) a bank holds. */
export const equipmentCount = (bank: Bank) => {
  const owned = ownedChecker(bank);
  return new Set(equipment.filter(owned).map((e) => norm(e.name))).size;
};
