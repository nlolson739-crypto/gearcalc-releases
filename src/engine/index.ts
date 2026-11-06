// Thin wrapper over the OSRS Wiki DPS engine (vendor/osrs-dps-calc). All combat maths happens in the engine;
// this file only builds the Player and Monster objects it expects from GearCalc's simpler choices.
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { createMonsterInputs, getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { MONSTER_PHASES_BY_ID } from '@/lib/constants';
import {
  availableEquipment, calculateAttackSpeed, calculateEquipmentBonusesFromGear,
} from '@/lib/Equipment';
import { EQUIPMENT_OPTIONS } from '@/app/components/player/equipment/equipmentOptions';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getCombatStylesForCategory, PotionMap } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import Potion from '@/enums/Potion';
import { Prayer } from '@/enums/Prayer';
import { spells, Spell } from '@/types/Spell';
import type { Monster } from '@/types/Monster';
import type {
  EquipmentPiece, Player, PlayerEquipment, PlayerSkills,
} from '@/types/Player';
import type { PlayerCombatStyle } from '@/types/PlayerCombatStyle';

export { Potion, Prayer, EquipmentCategory };
export type {
  Monster, Player, EquipmentPiece, PlayerCombatStyle, Spell,
};

export type Slot = keyof PlayerEquipment;
export const SLOTS: Slot[] = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];

export type DefenceReductions = Monster['inputs']['defenceReductions'];
export const NO_REDUCTIONS: DefenceReductions = { ...INITIAL_MONSTER_INPUTS.defenceReductions };

// ---- data -----------------------------------------------------------------------------------------------

export const equipment: EquipmentPiece[] = availableEquipment;
export const allSpells: Spell[] = spells;
const baseMonsters = getMonsters();

export const monsterKey = (m: { id: number, version?: string }) => `${m.id}:${m.version ?? ''}`;
export const monsters = baseMonsters;

/** Finds an item by name; without a version it prefers the plain entry, then the charged one. */
export const findItem = (name: string, version = ''): EquipmentPiece | undefined => {
  const matches = equipment.filter((e) => e.name.toLowerCase() === name.toLowerCase());
  if (version) return matches.find((e) => e.version === version);
  return matches.find((e) => !e.version)
    ?? matches.find((e) => ['Charged', 'Normal', 'Active'].includes(e.version))
    ?? matches[0];
};

export const findMonster = (name: string, version = '') => baseMonsters.find(
  (m) => m.name === name && (!version || m.version === version),
);

/** The fight phases the wiki engine knows for a monster (e.g. Ocellus Phase 3 / 4, Bork stunned); empty if none. */
export const phasesFor = (m: { id: number }): readonly string[] => MONSTER_PHASES_BY_ID[m.id] ?? [];

/** The phase the engine will use: the chosen one if this monster has it, else its first phase (as the wiki does). */
export const phaseFor = (m: { id: number }, phase?: string | null): string | undefined => {
  const phases = phasesFor(m);
  return phase && phases.includes(phase) ? phase : phases[0];
};

/**
 * A monster ready for the engine, with GearCalc's defence reductions, current HP and fight phase applied as inputs.
 * Without a phase (or with one this monster doesn't have) it gets its first phase, like the wiki's createMonsterInputs.
 */
export function prepareMonster(
  base: Omit<Monster, 'inputs'>,
  reductions: Partial<DefenceReductions> = {},
  phase?: string | null,
): Monster {
  return {
    ...base,
    inputs: {
      ...createMonsterInputs(base.id),
      monsterCurrentHp: base.skills.hp,
      defenceReductions: { ...NO_REDUCTIONS, ...reductions },
      phase: phaseFor(base, phase),
    },
  } as Monster;
}

/** The monster after scaling and defence reductions, as the engine sees it (for "stats after specials"). */
export const scaledMonster = (m: Monster): Monster => scaleMonster(m);
export const defenceFloor = (m: Monster): number => getDefenceFloor(m);

// ---- player ---------------------------------------------------------------------------------------------

export interface SetupInput {
  name: string;
  gear: Partial<Record<Slot, EquipmentPiece | null>>;
  styleName?: string;
  prayers: Prayer[];
  potions: Potion[];
  spell?: Spell | null;
  skills?: Partial<PlayerSkills>;
  buffs?: Partial<Player['buffs']>;
}

const BASE_SKILLS: PlayerSkills = {
  atk: 99, def: 99, hp: 99, magic: 99, prayer: 99, ranged: 99, str: 99, mining: 99, herblore: 99, farming: 99,
};

// Same defaults the wiki calculator uses for a new loadout (its src/state.tsx generateEmptyPlayer).
const DEFAULT_BUFFS: Player['buffs'] = {
  potions: [],
  onSlayerTask: false,
  inWilderness: false,
  kandarinDiary: true,
  chargeSpell: false,
  markOfDarknessSpell: false,
  forinthrySurge: false,
  soulreaperStacks: 5,
  baAttackerLevel: 0,
  chinchompaDistance: 4,
  usingSunfireRunes: false,
  fragmentOfWind: false,
  fragmentOfWater: false,
  fragmentOfEarth: false,
  fragmentOfFire: false,
};

// The darts the wiki calculator lets each blowpipe fire (it lists every blowpipe once per dart, up to the dart tier
// that blowpipe allows). The engine reads the dart from the weapon's itemVars; without one a blowpipe has no dart strength.
const dartsByBlowpipe = new Map<number, EquipmentPiece[]>();
for (const { equipment: e } of EQUIPMENT_OPTIONS) {
  const dart = e.itemVars?.blowpipeDartId === undefined ? undefined : availableEquipment.find((x) => x.id === e.itemVars?.blowpipeDartId);
  if (dart) dartsByBlowpipe.set(e.id, [...(dartsByBlowpipe.get(e.id) ?? []), dart]);
}
for (const list of dartsByBlowpipe.values()) list.sort((a, b) => b.bonuses.ranged_str - a.bonuses.ranged_str);

/** The darts a blowpipe can fire, strongest first; empty for every other weapon. */
export const dartsFor = (weapon: { id: number } | null | undefined): EquipmentPiece[] => dartsByBlowpipe.get(weapon?.id ?? -1) ?? [];

/** The weapon with its dart loaded: the given one if the blowpipe can fire it, else the strongest. Other weapons stay as they are. */
export function withDart(weapon: EquipmentPiece | null | undefined, dartId?: number): EquipmentPiece | null | undefined {
  const darts = dartsFor(weapon);
  if (!weapon || !darts.length) return weapon;
  const dart = darts.find((d) => d.id === dartId) ?? darts[0];
  return { ...weapon, itemVars: { ...weapon.itemVars, blowpipeDartId: dart.id, blowpipeDartName: dart.name } };
}

export const stylesFor = (weapon: EquipmentPiece | null | undefined): PlayerCombatStyle[] => getCombatStylesForCategory(
  weapon?.category || EquipmentCategory.NONE,
);

/** Boosts from the chosen potions: for each skill the strongest potion wins, as in game. */
export function potionBoosts(potions: Potion[], skills: PlayerSkills): PlayerSkills {
  const boosts: PlayerSkills = {
    atk: 0, def: 0, hp: 0, magic: 0, prayer: 0, ranged: 0, str: 0, mining: 0, herblore: 0, farming: 0,
  };
  for (const p of potions) {
    const b = PotionMap[p].calculateFn(skills);
    for (const k of Object.keys(b) as (keyof PlayerSkills)[]) boosts[k] = Math.max(boosts[k], b[k] ?? 0);
  }
  return boosts;
}

export function buildPlayer(input: SetupInput, monster: Monster): Player {
  const skills = { ...BASE_SKILLS, ...input.skills };
  const eq: PlayerEquipment = {
    head: null, cape: null, neck: null, ammo: null, weapon: null, body: null, shield: null, legs: null, hands: null, feet: null, ring: null,
  };
  for (const s of SLOTS) eq[s] = input.gear[s] ?? null;
  const styles = stylesFor(eq.weapon);
  const style = styles.find((x) => x.name === input.styleName) ?? styles[0];
  const player: Player = {
    uuid: input.name, // the engine's loadout id; its sums never read it
    name: input.name,
    style,
    skills,
    boosts: potionBoosts(input.potions, skills),
    equipment: eq,
    attackSpeed: 4,
    prayers: input.prayers,
    bonuses: { str: 0, ranged_str: 0, magic_str: 0, prayer: 0 },
    defensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    offensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    buffs: { ...DEFAULT_BUFFS, ...input.buffs, potions: input.potions },
    spell: input.spell ?? null,
  };
  const b = calculateEquipmentBonusesFromGear(player, monster);
  player.bonuses = b.bonuses;
  player.offensive = b.offensive;
  player.defensive = b.defensive;
  player.attackSpeed = calculateAttackSpeed(player, monster);
  return player;
}

// ---- results --------------------------------------------------------------------------------------------

export interface CalcResult {
  maxHit: number;
  accuracy: number;
  dps: number;
  ttk: number | undefined;
  attackRoll: number;
  defenceRoll: number;
  attackSpeed: number;
}

export function calculate(player: Player, monster: Monster, usingSpecialAttack = false): CalcResult {
  const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: player.name, usingSpecialAttack });
  return {
    maxHit: calc.getDistribution().getMax(),
    accuracy: calc.getHitChance(),
    dps: calc.getDps(),
    ttk: calc.getTtk(),
    attackRoll: calc.getMaxAttackRoll(),
    defenceRoll: calc.getNPCDefenceRoll(),
    attackSpeed: player.attackSpeed,
  };
}
