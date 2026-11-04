import { useEffect, useState } from 'react';
import {
  findItem, findMonster, monsterKey, monsters, NO_REDUCTIONS, phaseFor, Potion, prepareMonster, Prayer,
  type DefenceReductions, type EquipmentPiece, type Monster, type Slot,
} from '~/engine';
import { XARTH_CORPSE } from '~/rules/wiki';
import {
  ARM_PRAYERS, BRAIN_PRAYERS, OFFENSIVE_PRAYERS, PrayerMap,
} from '@/enums/Prayer';
import { equipment } from '~/engine';
import type { Bank } from '~/bank';

export interface Setup {
  id: string;
  name: string;
  color: string;
  gear: Partial<Record<Slot, number>>;
  style?: string;
  /** spell name, used when the chosen style casts (autocast or manual cast) */
  spell?: string;
  specWeapon?: number;
}

export interface Buffs {
  /** Offensive prayers. Each setup uses the ones matching its combat style (the engine filters by style). */
  prayers: Prayer[];
  potions: Potion[];
  thrall: 0 | 1 | 2 | 3;
  onSlayerTask: boolean;
  markOfDarkness: boolean;
  charge: boolean;
  /** Fractured Archive elemental fragments: +2 max hit to that element's spells (wiki "Elemental fragments") */
  fragFire?: boolean;
  fragWater?: boolean;
  fragEarth?: boolean;
  fragAir?: boolean;
  sunfire?: boolean;
}

export interface AppState {
  target: string;
  /** chosen fight phase per target key (only for monsters the wiki engine gives phases); missing = the first phase */
  phases: Record<string, string>;
  reductions: DefenceReductions;
  buffs: Buffs;
  setups: Setup[];
  /** banks imported from RuneLite's Bank Memory plugin */
  banks: Bank[];
  /** the bank the best-setup search is limited to; null searches all gear */
  activeBank: string | null;
}

/**
 * Turn a prayer on or off the way the game allows. Same rules as the wiki calculator's togglePlayerPrayer, except
 * that they apply within one combat style: setups are separate loadouts, so a melee, a ranged and a magic prayer can
 * all be chosen and each setup uses its own.
 */
export function togglePrayer(list: Prayer[], p: Prayer): Prayer[] {
  if (list.includes(p)) return list.filter((x) => x !== p);
  const style = PrayerMap[p].combatStyle;
  const keep = list.filter((x) => {
    if (PrayerMap[x].combatStyle !== style || !OFFENSIVE_PRAYERS.includes(x)) return true;
    if (BRAIN_PRAYERS.includes(p)) return ARM_PRAYERS.includes(x);
    if (ARM_PRAYERS.includes(p)) return BRAIN_PRAYERS.includes(x);
    return false;
  });
  return [...keep, p];
}

export const SETUP_COLORS = ['#f0b44c', '#7cb4ff', '#5fd0b5', '#e58ad8'];

const ids = (names: Partial<Record<Slot, string>>): Partial<Record<Slot, number>> => Object.fromEntries(
  Object.entries(names).map(([s, n]) => [s, findItem(n!)?.id]).filter(([, id]) => id !== undefined),
);

const p3 = findMonster('Ocellus', 'Phase 3');

const torva = {
  head: 'Torva full helm', cape: 'Infernal cape', neck: 'Amulet of rancour', weapon: 'Scythe of vitur', body: 'Torva platebody',
  legs: 'Torva platelegs', hands: 'Ferocious gloves', feet: 'Primordial boots', ring: 'Ultor ring',
};

export const DEFAULT_STATE: AppState = {
  target: p3 ? monsterKey(p3) : monsterKey(monsters[0]),
  phases: {},
  reductions: { ...NO_REDUCTIONS, elderMaul: 2 },
  buffs: {
    prayers: [Prayer.PIETY, Prayer.RIGOUR, Prayer.AUGURY], potions: [Potion.SUPER_COMBAT], thrall: 3, onSlayerTask: false, markOfDarkness: false, charge: false,
  },
  setups: [
    { id: 'a', name: 'Setup 1 · Torva', color: SETUP_COLORS[0], gear: ids(torva), style: 'Jab', specWeapon: findItem('Elder maul')?.id },
    { id: 'b', name: 'Setup 2 · Torva', color: SETUP_COLORS[1], gear: ids(torva), style: 'Chop', specWeapon: findItem('Bandos godsword')?.id },
    {
      id: 'c',
      name: 'Setup 3 · Inquisitor',
      color: SETUP_COLORS[2],
      gear: ids({
        ...torva, head: "Inquisitor's great helm", body: "Inquisitor's hauberk", legs: "Inquisitor's plateskirt",
      }),
      style: 'Jab',
      specWeapon: findItem('Elder maul')?.id,
    },
  ],
  banks: [],
  activeBank: null,
};

const STORAGE_KEY = 'gearcalc-state-v1';
/**
 * Imported banks are also kept under their own key (since v0.34), so resetting saved setups or a save that can't be
 * read never takes the banks with it. The desktop app also copies them to %APPDATA%\GearCalc\banks.json (see
 * useBankBackup), which survives even if the web view's storage is lost.
 */
const BANKS_KEY = 'gearcalc-banks-v1';
type SavedBanks = Pick<AppState, 'banks' | 'activeBank'>;

/** Bank names are unique since v0.29; gives older repeats a number ("Main", "Main (2)"). */
function uniqueBankNames(banks: Bank[]): Bank[] {
  const seen = new Set<string>();
  return banks.map((b) => {
    const base = String(b.name ?? '').trim() || 'Bank';
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    seen.add(name.toLowerCase());
    return { ...b, name };
  });
}

const isBank = (b: unknown): b is Bank => !!b && typeof b === 'object' && typeof (b as Bank).id === 'string'
  && Array.isArray((b as Bank).items);

/** Reads a banks record ({ banks, activeBank }); null if it isn't one. */
export function toSavedBanks(v: unknown): SavedBanks | null {
  const r = v as Partial<SavedBanks> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.banks)) return null;
  const banks = uniqueBankNames(r.banks.filter(isBank));
  const activeBank = typeof r.activeBank === 'string' && banks.some((b) => b.id === r.activeBank) ? r.activeBank : null;
  return { banks, activeBank };
}

const parseSavedBanks = (raw: string | null | undefined): SavedBanks | null => {
  if (!raw) return null;
  try { return toSavedBanks(JSON.parse(raw)); } catch { return null; }
};

function loadBanks(): SavedBanks | null {
  try { return parseSavedBanks(localStorage.getItem(BANKS_KEY)); } catch { return null; }
}

function load(): AppState {
  const banks = loadBanks();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch (e) {
        // keep the unreadable save instead of letting the defaults overwrite it
        try { localStorage.setItem(`${STORAGE_KEY}-unreadable`, raw); } catch { /* ignore */ }
        throw e;
      }
      // v0.24 and earlier kept a single `prayer`
      if (saved.buffs && !Array.isArray(saved.buffs.prayers)) {
        saved.buffs.prayers = saved.buffs.prayer === null || saved.buffs.prayer === undefined ? [] : [saved.buffs.prayer];
        delete saved.buffs.prayer;
      }
      // the banks key wins: it's kept even when the setups are reset (saves before v0.34 only have them in here)
      Object.assign(saved, banks ?? toSavedBanks(saved) ?? { banks: [], activeBank: null });
      // phases were added in v0.33
      if (!saved.phases || typeof saved.phases !== 'object' || Array.isArray(saved.phases)) saved.phases = {};
      return { ...DEFAULT_STATE, ...saved };
    }
  } catch { /* private window, blocked storage or an unreadable save: use defaults */ }
  return { ...DEFAULT_STATE, ...banks };
}

type BackupApi = { load_banks?: () => Promise<string | null>, save_banks?: (text: string) => Promise<boolean> };
const backupApi = (): BackupApi | undefined => (window as unknown as { pywebview?: { api?: BackupApi } }).pywebview?.api;

/**
 * Desktop app only: keeps a copy of the imported banks in %APPDATA%\GearCalc\banks.json. On start, banks that are in
 * the file but missing from the page's storage (lost storage, a reset) are put back; after that every change is
 * written to the file. Nothing is written before that first read, so an empty start can't wipe the backup.
 */
function useBankBackup(state: AppState, setState: (f: (s: AppState) => AppState) => void) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const api = backupApi();
      if (typeof api?.load_banks !== 'function') return; // a plain browser: storage only
      try {
        const file = parseSavedBanks(await api.load_banks());
        if (!cancelled && file?.banks.length) {
          setState((s) => {
            const have = new Set(s.banks.map((b) => b.id));
            const missing = file.banks.filter((b) => !have.has(b.id));
            if (!missing.length) return s;
            const activeBank = s.activeBank ?? (s.banks.length ? null : file.activeBank);
            return { ...s, banks: uniqueBankNames([...s.banks, ...missing]), activeBank };
          });
        }
      } catch { /* unreadable backup: keep what the page has */ }
      if (!cancelled) setReady(true);
    };
    // pywebview adds the api's methods late: they're usable after 'pywebviewready' (or now, if that already happened)
    if (backupApi()?.load_banks) restore();
    else window.addEventListener('pywebviewready', restore, { once: true });
    return () => { cancelled = true; window.removeEventListener('pywebviewready', restore); };
  }, [setState]);
  useEffect(() => {
    const api = backupApi();
    if (ready && typeof api?.save_banks === 'function') {
      api.save_banks(JSON.stringify({ banks: state.banks, activeBank: state.activeBank })).catch(() => {});
    }
  }, [ready, state.banks, state.activeBank]);
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);
  useEffect(() => {
    try { localStorage.setItem(BANKS_KEY, JSON.stringify({ banks: state.banks, activeBank: state.activeBank })); } catch { /* ignore */ }
  }, [state.banks, state.activeBank]);
  useBankBackup(state, setState);
  return [state, setState] as const;
}

// ---- lookups ------------------------------------------------------------------------------------------------

const byId = new Map(equipment.map((e) => [e.id, e]));
export const itemById = (id: number | undefined): EquipmentPiece | null => (id === undefined ? null : byId.get(id) ?? null);

export const EXTRA_MONSTERS = [{ key: monsterKey(XARTH_CORPSE), label: 'Corpse (Xarth)', monster: XARTH_CORPSE }];

export function baseMonster(key: string): Omit<Monster, 'inputs'> {
  return EXTRA_MONSTERS.find((m) => m.key === key)?.monster
    ?? monsters.find((m) => monsterKey(m) === key)
    ?? monsters[0];
}

/** The chosen phase of the current target, as the engine will use it (undefined for monsters without phases). */
export const targetPhase = (s: AppState): string | undefined => phaseFor(baseMonster(s.target), s.phases?.[s.target]);

/** The current target ready for the engine: its phase plus the given drains (default: the saved ones). */
export const targetMonster = (s: AppState, reductions: Partial<DefenceReductions> = s.reductions): Monster => prepareMonster(
  baseMonster(s.target), reductions, s.phases?.[s.target],
);

/** Sets the phase for the current target. */
export const withPhase = (s: AppState, phase: string): AppState => ({ ...s, phases: { ...s.phases, [s.target]: phase } });

export const gearOf = (setup: Setup) => Object.fromEntries(
  Object.entries(setup.gear).map(([slot, id]) => [slot, itemById(id)]),
) as Partial<Record<Slot, EquipmentPiece | null>>;
