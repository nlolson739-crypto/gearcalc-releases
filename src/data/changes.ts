// Compares two copies of the wiki engine's data (monsters, gear, spells) and lists what changed in the numbers the
// DPS calculations use: monster levels and defences, gear bonuses and speeds, spell max hits. Used at build time
// (vite.config.ts, for each calculator update) and in the app (downloaded wiki data vs the built-in copy).
// Plain TypeScript with no imports, so vite.config.ts can use it too.

export type DataKind = 'monster' | 'item' | 'spell';
export interface FieldChange { field: string, from: string, to: string }
export interface EntryChange { kind: DataKind, name: string, changes: FieldChange[] }
export interface DataDiff {
  changed: EntryChange[];
  added: { kind: DataKind, name: string }[];
  removed: { kind: DataKind, name: string }[];
}
export interface DataSet { monsters?: unknown[], equipment?: unknown[], spells?: unknown[] }

/** One calculator update (a GearCalc version that moved to a newer wiki engine). Built by vite.config.ts. */
export interface ChangelogEntry {
  version: string;
  date: string;
  engine: string;
  /** the wiki calculator's own change notes (data-only updates left out: those are in `data`) */
  notes: string[];
  /** null when the history needed to compare wasn't available */
  data: DataDiff | null;
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (typeof x === 'object' && x !== null ? x as Obj : {});

const SKILL: Record<string, string> = {
  atk: 'Attack level', str: 'Strength level', def: 'Defence level', magic: 'Magic level', ranged: 'Ranged level', hp: 'Hitpoints',
};
const MON_DEF: Record<string, string> = {
  stab: 'Stab defence', slash: 'Slash defence', crush: 'Crush defence', magic: 'Magic defence',
  light: 'Light ranged defence', standard: 'Standard ranged defence', heavy: 'Heavy ranged defence', flat_armour: 'Flat armour',
};
const ATT: Record<string, string> = {
  stab: 'Stab attack', slash: 'Slash attack', crush: 'Crush attack', magic: 'Magic attack', ranged: 'Ranged attack',
};
const BON: Record<string, string> = {
  str: 'Melee strength', ranged_str: 'Ranged strength', magic_str: 'Magic damage', prayer: 'Prayer',
};

const show = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return 'none';
  if (Array.isArray(v)) return v.length ? [...v].map(String).sort().join(', ') : 'none';
  if (typeof v === 'object') {
    const parts = Object.entries(v as Obj).filter(([, x]) => x !== null && x !== undefined && x !== false).map(([k, x]) => (x === true ? k : `${k} ${x}`));
    return parts.length ? parts.join(', ') : 'none';
  }
  return String(v);
};

/** The calculation-relevant numbers of one entry, as label -> shown value. */
function fields(kind: DataKind, e: Obj): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (map: Record<string, string>, src: unknown) => {
    const o = obj(src);
    for (const [k, label] of Object.entries(map)) if (k in o) out[label] = show(o[k]);
  };
  if (kind === 'monster') {
    add(SKILL, e.skills);
    add(MON_DEF, e.defensive);
    out.Size = show(e.size);
    out.Attributes = show(e.attributes);
    out.Weakness = show(e.weakness);
    out.Immunities = show(e.immunities);
  } else if (kind === 'item') {
    add(ATT, e.offensive);
    add(BON, e.bonuses);
    out['Attack speed'] = show(e.speed);
    out['Weapon type'] = show(e.category);
    out['Two-handed'] = show(e.isTwoHanded);
    out.Slot = show(e.slot);
  } else {
    out['Max hit'] = show(e.max_hit);
    out.Element = show(e.element);
  }
  return out;
}

const nameOf = (e: Obj) => `${String(e.name ?? '?')}${e.version ? ` (${String(e.version)})` : ''}`;
const keyOf = (kind: DataKind, e: Obj) => (kind === 'spell' ? String(e.name) : `${String(e.id)}:${String(e.version ?? '')}`);

function diffList(kind: DataKind, oldList: unknown[] | undefined, newList: unknown[] | undefined, out: DataDiff) {
  if (!oldList || !newList) return;
  const before = new Map(oldList.map((x) => [keyOf(kind, obj(x)), obj(x)]));
  const after = new Map(newList.map((x) => [keyOf(kind, obj(x)), obj(x)]));
  // The data repeats some entries under several ids (e.g. a boss's two NPC ids): report each name once.
  const seen = new Set<string>();
  for (const [k, e] of after) {
    const old = before.get(k);
    if (!old) continue;
    const a = fields(kind, old); const b = fields(kind, e);
    const changes = Object.keys({ ...a, ...b }).filter((f) => a[f] !== b[f]).map((f) => ({ field: f, from: a[f] ?? 'none', to: b[f] ?? 'none' }));
    if (!changes.length) continue;
    const sig = `${nameOf(e)}|${JSON.stringify(changes)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.changed.push({ kind, name: nameOf(e), changes });
  }
  // New or removed names (one line per name, not per id or copy)
  const names = (m: Map<string, Obj>) => new Set([...m.values()].map(nameOf));
  const oldNames = names(before); const newNames = names(after);
  for (const n of newNames) if (!oldNames.has(n)) out.added.push({ kind, name: n });
  for (const n of oldNames) if (!newNames.has(n)) out.removed.push({ kind, name: n });
}

export function diffData(before: DataSet, after: DataSet): DataDiff {
  const out: DataDiff = { changed: [], added: [], removed: [] };
  diffList('monster', before.monsters, after.monsters, out);
  diffList('item', before.equipment, after.equipment, out);
  diffList('spell', before.spells, after.spells, out);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  out.changed.sort(byName); out.added.sort(byName); out.removed.sort(byName);
  return out;
}

export const isEmptyDiff = (d: DataDiff | null | undefined) => !d || (!d.changed.length && !d.added.length && !d.removed.length);
