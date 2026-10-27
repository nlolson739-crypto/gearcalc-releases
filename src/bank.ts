import { equipment, type EquipmentPiece } from '~/engine';

/** A bank imported from the RuneLite Bank Memory plugin: item id → quantity. */
export interface Bank {
  id: string;
  name: string;
  /** [item id, quantity] */
  items: [number, number][];
  imported: number;
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

/** How many distinct pieces of equipment (by name) a bank holds. */
export const equipmentCount = (bank: Bank) => {
  const owned = ownedChecker(bank);
  return new Set(equipment.filter(owned).map((e) => norm(e.name))).size;
};
