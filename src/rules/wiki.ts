// Facts GearCalc uses that the wiki DPS engine doesn't model. Every entry comes from an OSRS Wiki page;
// `source` records the page and revision, so `deno task update-data` can flag an entry when the page changes.
import type { Monster } from '~/engine';

export interface WikiSource {
  page: string;
  revision: number;
}

export const wikiUrl = (page: string) => `https://oldschool.runescape.wiki/w/${encodeURIComponent(page.replaceAll(' ', '_'))}`;

// ---- items that only exist inside a minigame or a limited-time game mode -----------------------------------
// Each page says the item comes from (or only works in) a minigame, a league or the Grid Master event, so it isn't
// part of the regular game. Rewards from those modes that are used in the regular game (ornament kits, outfits,
// imbues, Fighter torso...) are not listed.
export const MODE_ONLY_ITEMS: { source: WikiSource, items: string[] }[] = [
  // Emir's Arena: Calamity armour from the arena hospital's equipment chests
  { source: { page: "Koriff's coif", revision: 15333969 }, items: ["Koriff's coif", "Koriff's cowl", "Koriff's headband"] },
  { source: { page: "Maoma's great helm", revision: 15333980 }, items: ["Maoma's full helm", "Maoma's great helm", "Maoma's med helm"] },
  { source: { page: "Saika's hood", revision: 15333849 }, items: ["Saika's hood", "Saika's shroud", "Saika's veil"] },
  { source: { page: 'Calamity chest', revision: 15333981 }, items: ['Calamity chest', 'Elite calamity chest', 'Superior calamity chest'] },
  { source: { page: 'Calamity breeches', revision: 15333982 }, items: ['Calamity breeches', 'Elite calamity breeches', 'Superior calamity breeches'] },
  { source: { page: 'Wristbands of the Arena', revision: 15333834 }, items: ['Wristbands of the Arena', 'Wristbands of the Arena (i)'] },
  // Barbarian Assault: arrows from the Attacker item machine during a game
  { source: { page: 'Barbed arrow', revision: 15188735 }, items: ['Barbed arrow'] },
  { source: { page: 'Blunt arrow', revision: 15188734 }, items: ['Blunt arrow'] },
  { source: { page: 'Bullet arrow', revision: 15188732 }, items: ['Bullet arrow'] },
  { source: { page: 'Field arrow', revision: 15188733 }, items: ['Field arrow'] },
  // Castle Wars: usable only in Castle Wars
  { source: { page: 'Castle wars arrow', revision: 15193208 }, items: ['Castle wars arrow'] },
  { source: { page: 'Castle wars bolts', revision: 15193209 }, items: ['Castle wars bolts'] },
  // Wilderness Wars event (2017)
  { source: { page: 'Wilderness champion amulet', revision: 15275860 }, items: ['Wilderness champion amulet'] },
  // Grid Master: obtained during the Grid Master event
  { source: { page: 'Gloves of the Damned', revision: 15312973 }, items: ['Gloves of the Damned'] },
  { source: { page: 'Echo axe', revision: 15239873 }, items: ['Echo axe', 'Echo harpoon'] },
  { source: { page: 'Echo pickaxe', revision: 15340358 }, items: ['Echo pickaxe'] },
  // Leagues: echo drops and relic items obtained during a league
  { source: { page: "Banker's briefcase", revision: 15350999 }, items: ["Banker's briefcase"] },
  { source: { page: 'Crystal blessing', revision: 15208804 }, items: ['Crystal blessing'] },
  { source: { page: 'Crystal dagger (perfected)', revision: 15192953 }, items: ['Crystal dagger (perfected)'] },
  { source: { page: "Devil's element", revision: 15286396 }, items: ["Devil's element"] },
  { source: { page: 'Drygore blowpipe', revision: 15286395 }, items: ['Drygore blowpipe'] },
  { source: { page: 'Evil eye (item)', revision: 15358562 }, items: ['Evil eye (item)'] },
  { source: { page: 'Fang of the hound', revision: 15213366 }, items: ['Fang of the hound'] },
  { source: { page: 'Infernal tecpatl', revision: 15209880 }, items: ['Infernal tecpatl'] },
  { source: { page: "King's barrage", revision: 15213537 }, items: ["King's barrage"] },
  { source: { page: 'Lithic sceptre', revision: 15210732 }, items: ['Lithic sceptre'] },
  { source: { page: "Nature's recurve", revision: 15211098 }, items: ["Nature's recurve"] },
  { source: { page: "Sage's axe", revision: 15224281 }, items: ["Sage's axe"] },
  { source: { page: 'Searing boots', revision: 15286565 }, items: ['Searing boots'] },
  { source: { page: 'Shadowflame quadrant', revision: 15225448 }, items: ['Shadowflame quadrant'] },
  { source: { page: 'Transmutation ledger', revision: 15205665 }, items: ['Transmutation ledger'] },
  { source: { page: "V's helm", revision: 15286407 }, items: ["V's helm"] },
  { source: { page: 'Clue compass (item)', revision: 15192896 }, items: ['Clue compass (item)'] },
  { source: { page: 'Portable waystone', revision: 15190745 }, items: ['Portable waystone'] },
  { source: { page: 'Globetrotter pendant', revision: 15191643 }, items: ['Globetrotter pendant'] },
  { source: { page: 'Fairy mushroom', revision: 15205871 }, items: ['Fairy mushroom'] },
  { source: { page: "Forager's pouch", revision: 15204266 }, items: ["Forager's pouch"] },
];
const MODE_ONLY_NAMES = new Set(MODE_ONLY_ITEMS.flatMap((m) => m.items));
export const isModeOnlyItem = (name: string) => MODE_ONLY_NAMES.has(name);

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
