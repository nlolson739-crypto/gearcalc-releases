import { useEffect, useState } from 'react';
import {
  findItem, findMonster, monsterKey, monsters, NO_REDUCTIONS, Potion, prepareMonster, Prayer,
  type DefenceReductions, type EquipmentPiece, type Monster, type Slot,
} from '~/engine';
import { XARTH_CORPSE } from '~/rules/wiki';
import {
  ARM_PRAYERS, BRAIN_PRAYERS, OFFENSIVE_PRAYERS, PrayerMap,
} from '@/enums/Prayer';
import { equipment } from '~/engine';

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
  reductions: DefenceReductions;
  buffs: Buffs;
  setups: Setup[];
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
};

const STORAGE_KEY = 'gearcalc-state-v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // v0.24 and earlier kept a single `prayer`
      if (saved.buffs && !Array.isArray(saved.buffs.prayers)) {
        saved.buffs.prayers = saved.buffs.prayer === null || saved.buffs.prayer === undefined ? [] : [saved.buffs.prayer];
        delete saved.buffs.prayer;
      }
      return { ...DEFAULT_STATE, ...saved };
    }
  } catch { /* private window or blocked storage: use defaults */ }
  return DEFAULT_STATE;
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);
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

export const targetMonster = (s: AppState): Monster => prepareMonster(baseMonster(s.target), s.reductions);

export const gearOf = (setup: Setup) => Object.fromEntries(
  Object.entries(setup.gear).map(([slot, id]) => [slot, itemById(id)]),
) as Partial<Record<Slot, EquipmentPiece | null>>;
