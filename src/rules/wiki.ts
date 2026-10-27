// Facts GearCalc uses that the wiki DPS engine doesn't model. Every entry comes from an OSRS Wiki page;
// `source` records the page and revision, so `deno task update-data` can flag an entry when the page changes.
import type { Monster } from '~/engine';

export interface WikiSource {
  page: string;
  revision: number;
}

export const wikiUrl = (page: string) => `https://oldschool.runescape.wiki/w/${encodeURIComponent(page.replaceAll(' ', '_'))}`;

// ---- thralls (wiki "Thrall" page table; thralls always hit, attack every 4 ticks) -------------------------

export const THRALL_SOURCE: WikiSource = { page: 'Thrall', revision: 15375202 };
export const THRALLS = [
  { tier: 1, name: 'Lesser', maxHit: 1, dps: 0.208, icon: 'Resurrect Lesser Ghost.png' },
  { tier: 2, name: 'Superior', maxHit: 2, dps: 0.416, icon: 'Resurrect Superior Ghost.png' },
  { tier: 3, name: 'Greater', maxHit: 3, dps: 0.625, icon: 'Resurrect Greater Ghost.png' },
] as const;

// ---- freeze and bind spells (each spell's wiki page) ---------------------------------------------------------

export interface FreezeSpell {
  name: string;
  book: 'Standard' | 'Ancient' | 'Arceuus';
  level: number;
  ticks: number;
  /** freeze length with the Ancient sceptre, ice spells only */
  sceptreTicks?: number;
  /** chance a successful hit binds; Mark of Darkness doubles grasp chances */
  bindChance: number;
  markBindChance: number;
  source: WikiSource;
}

export const FREEZE_SPELLS: FreezeSpell[] = [
  { name: 'Bind', book: 'Standard', level: 20, ticks: 8, bindChance: 1, markBindChance: 1, source: { page: 'Bind', revision: 15165009 } },
  { name: 'Snare', book: 'Standard', level: 50, ticks: 16, bindChance: 1, markBindChance: 1, source: { page: 'Snare', revision: 15175486 } },
  { name: 'Entangle', book: 'Standard', level: 79, ticks: 24, bindChance: 1, markBindChance: 1, source: { page: 'Entangle', revision: 15364849 } },
  { name: 'Ice Rush', book: 'Ancient', level: 58, ticks: 8, sceptreTicks: 8, bindChance: 1, markBindChance: 1, source: { page: 'Ice Rush', revision: 15304585 } },
  { name: 'Ice Burst', book: 'Ancient', level: 70, ticks: 16, sceptreTicks: 17, bindChance: 1, markBindChance: 1, source: { page: 'Ice Burst', revision: 15304594 } },
  { name: 'Ice Blitz', book: 'Ancient', level: 82, ticks: 24, sceptreTicks: 26, bindChance: 1, markBindChance: 1, source: { page: 'Ice Blitz', revision: 15304591 } },
  { name: 'Ice Barrage', book: 'Ancient', level: 94, ticks: 32, sceptreTicks: 35, bindChance: 1, markBindChance: 1, source: { page: 'Ice Barrage', revision: 15351509 } },
  { name: 'Ghostly Grasp', book: 'Arceuus', level: 35, ticks: 2, bindChance: 0.1, markBindChance: 0.2, source: { page: 'Ghostly Grasp', revision: 15252749 } },
  { name: 'Skeletal Grasp', book: 'Arceuus', level: 56, ticks: 3, bindChance: 0.25, markBindChance: 0.5, source: { page: 'Skeletal Grasp', revision: 14779872 } },
  { name: 'Undead Grasp', book: 'Arceuus', level: 79, ticks: 4, bindChance: 0.5, markBindChance: 1, source: { page: 'Undead Grasp', revision: 15303961 } },
];

// ---- monsters the engine's data doesn't include ------------------------------------------------------------

/** Corpse (Xarth), from its wiki page. Spawned by Xarth; frozen to stop it healing him. */
export const XARTH_CORPSE: Omit<Monster, 'inputs'> = {
  id: -16684,
  name: 'Corpse (Xarth)',
  version: '',
  image: '',
  size: 1,
  speed: 4,
  style: null,
  maxHit: 0,
  skills: { atk: 50, def: 100, hp: 62, magic: 100, ranged: 1, str: 40 },
  offensive: { atk: 0, magic: 0, magic_str: 0, ranged: 0, ranged_str: 0, str: 0 },
  defensive: {
    flat_armour: 0, stab: 0, slash: 0, crush: 0, magic: 0, light: 0, standard: 0, heavy: 0,
  },
  attributes: ['undead'],
  weakness: { element: 'water', severity: 40 },
  immunities: { burn: null },
  is_slayer_monster: false,
} as unknown as Omit<Monster, 'inputs'>;
export const XARTH_CORPSE_SOURCE: WikiSource = { page: 'Corpse (Xarth)', revision: 15383615 };

// ---- special rules ---------------------------------------------------------------------------------------

export interface FreezeThresholdRule {
  kind: 'freeze-threshold';
  targetName: string;
  /** magic attack bonus at which every cast is treated as a hit */
  withAugury: number;
  withoutAugury: number;
  approximate: boolean;
  summary: string;
  source: WikiSource;
}

export interface BindDurationRule {
  kind: 'bind-duration';
  targetName: string;
  spell: string;
  needsMark: boolean;
  ticks: number;
  approximate: boolean;
  summary: string;
  source: WikiSource;
}

export type Rule = FreezeThresholdRule | BindDurationRule;

export const RULES: Rule[] = [
  {
    kind: 'freeze-threshold',
    targetName: 'Corpse (Xarth)',
    withAugury: 33,
    withoutAugury: 70,
    approximate: true,
    summary: 'Corpses seem to be frozen every time at roughly +33 magic accuracy with Augury, or roughly +70 without. The wiki says the values are not exact.',
    source: { page: 'The Fractured Archive/Strategies', revision: 15383508 },
  },
  {
    kind: 'bind-duration',
    targetName: 'Corpse (Xarth)',
    spell: 'Undead Grasp',
    needsMark: true,
    ticks: 10,
    approximate: true,
    summary: 'Undead Grasp under Mark of Darkness holds corpses for at least about 10 ticks, longer than the usual 4.',
    source: XARTH_CORPSE_SOURCE,
  },
];

export const rulesFor = (targetName: string) => RULES.filter((r) => r.targetName === targetName);
