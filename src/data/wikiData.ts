// The monster, gear and spell data the wiki engine runs on. GearCalc has a copy built in (from the vendored engine),
// and the desktop launcher downloads newer copies from the wiki once a day (app/wikidata.py) into ./wikidata/.
// loadWikiData() runs before the app (and so the engine) loads: it picks the newer of the two copies, checks the
// downloaded one has the shape this engine version understands, and leaves the choice on globalThis, where
// src/data/{monsters,equipment,spells}.ts read it. vite.config.ts points the engine's own JSON imports at those files.
import { EquipmentCategory } from '@/enums/EquipmentCategory';

export type DataFile = 'monsters' | 'equipment' | 'spells';
const FILES: DataFile[] = ['monsters', 'equipment', 'spells'];

export interface WikiDataStatus {
  /** where the data in use came from */
  source: 'built-in' | 'downloaded';
  /** when the wiki last changed the monster/gear data in use (ISO), if known */
  dataDate: string | null;
  /** when GearCalc last asked the wiki for newer data (ISO), if ever */
  checked: string | null;
  /** files that were downloaded but not used because this GearCalc version can't read them */
  rejected: DataFile[];
  /** entries skipped because their shape is unknown (e.g. a new weapon category), by file */
  skipped: Partial<Record<DataFile, number>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __gearcalcWikiData: (Partial<Record<DataFile, unknown[]>> & { status: WikiDataStatus }) | undefined;
}

// Set by vite.config.ts: when the built-in copy was last changed upstream.
declare const __BUILTIN_DATA_DATE__: string | null;
export const BUILTIN_DATA_DATE: string | null = typeof __BUILTIN_DATA_DATE__ === 'string' ? __BUILTIN_DATA_DATE__ : null;

// ---- shape checks -----------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const numbers = (x: unknown, keys: string[]) => isObj(x) && keys.every((k) => isNum(x[k]));
const allNumbers = (x: unknown) => isObj(x) && Object.values(x).every((v) => isNum(v));

const SLOTS = new Set(['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring']);
const CATEGORIES = new Set<string>(Object.values(EquipmentCategory));
const SPELLBOOKS = new Set(['standard', 'ancient', 'lunar', 'arceuus']);

const VALID: Record<DataFile, (e: unknown) => boolean> = {
  equipment: (e) => isObj(e) && isNum(e.id) && typeof e.name === 'string' && typeof e.version === 'string'
    && typeof e.slot === 'string' && SLOTS.has(e.slot)
    && typeof e.category === 'string' && CATEGORIES.has(e.category)
    && isNum(e.speed) && typeof e.isTwoHanded === 'boolean'
    && numbers(e.bonuses, ['str', 'ranged_str', 'magic_str', 'prayer'])
    && numbers(e.offensive, ['stab', 'slash', 'crush', 'magic', 'ranged'])
    && numbers(e.defensive, ['stab', 'slash', 'crush', 'magic', 'ranged']),
  monsters: (m) => isObj(m) && isNum(m.id) && typeof m.name === 'string' && typeof m.version === 'string'
    && isNum(m.size) && isNum(m.speed)
    && (typeof m.max_hit === 'string' || isNum(m.max_hit))
    && (m.style === null || m.style === undefined || (Array.isArray(m.style) && m.style.every((s) => typeof s === 'string')))
    && numbers(m.skills, ['atk', 'def', 'hp', 'magic', 'ranged', 'str'])
    && allNumbers(m.offensive) && allNumbers(m.defensive)
    && Array.isArray(m.attributes) && isObj(m.immunities),
  spells: (s) => isObj(s) && typeof s.name === 'string' && isNum(s.max_hit)
    && typeof s.spellbook === 'string' && SPELLBOOKS.has(s.spellbook)
    && (s.element === null || typeof s.element === 'string'),
};

// More than this share of unreadable entries means the file's format changed: don't use it at all.
const MAX_SKIPPED = 0.02;

/** The entries this engine version can use, or null if too many are unreadable. */
export function checkFile(file: DataFile, data: unknown): { entries: unknown[], skipped: number } | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const entries = data.filter(VALID[file]);
  const skipped = data.length - entries.length;
  return skipped / data.length > MAX_SKIPPED ? null : { entries, skipped };
}

// ---- loading ----------------------------------------------------------------------------------------------

interface DownloadInfo {
  checked?: string | null;
  files?: Partial<Record<DataFile, { modified?: string | null }>>;
}

const getJson = async (path: string): Promise<unknown> => {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

const newer = (a: string | null | undefined, b: string | null | undefined) => (a ? Date.parse(a) : 0) > (b ? Date.parse(b) : 0);

export async function loadWikiData(): Promise<WikiDataStatus> {
  const status: WikiDataStatus = {
    source: 'built-in', dataDate: BUILTIN_DATA_DATE, checked: null, rejected: [], skipped: {},
  };
  const chosen: Partial<Record<DataFile, unknown[]>> = {};
  try {
    const info = await getJson('wikidata/info.json') as DownloadInfo;
    status.checked = info.checked ?? null;
    let latest: string | null = null;
    for (const file of FILES) {
      const modified = info.files?.[file]?.modified;
      if (!newer(modified, BUILTIN_DATA_DATE)) continue; // the built-in copy is as new or newer
      try {
        const ok = checkFile(file, await getJson(`wikidata/${file}.json`));
        if (!ok) { status.rejected.push(file); continue; }
        chosen[file] = ok.entries;
        if (ok.skipped) status.skipped[file] = ok.skipped;
        if (file !== 'spells' && newer(modified, latest)) latest = modified ?? null;
      } catch {
        status.rejected.push(file);
      }
    }
    if (chosen.monsters || chosen.equipment) {
      status.source = 'downloaded';
      if (newer(latest, status.dataDate)) status.dataDate = latest;
    }
  } catch {
    // no downloaded data (browser preview, first start, offline): the built-in copy is used
  }
  globalThis.__gearcalcWikiData = { ...chosen, status };
  return status;
}

export const wikiDataStatus = (): WikiDataStatus => globalThis.__gearcalcWikiData?.status ?? {
  source: 'built-in', dataDate: BUILTIN_DATA_DATE, checked: null, rejected: [], skipped: {},
};
