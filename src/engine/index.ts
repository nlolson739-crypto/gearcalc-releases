// Thin wrapper over the OSRS Wiki DPS engine (vendor/osrs-dps-calc). All combat maths happens in the engine;
// this file only builds the Player and Monster objects it expects from GearCalc's simpler choices.
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import {
  availableEquipment, calculateAttackSpeed, calculateEquipmentBonusesFromGear,
} from '@/lib/Equipment';
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

export const monsterKey = (m: { id: number, version: string }) => `${m.id}:${m.version}`;
export const monsters = baseMonsters;

export const findItem = (name: string, version = ''): EquipmentPiece | undefined => equipment.find(
  (e) => e.name === name && (!version || e.version === version),
) ?? equipment.find((e) => e.name.toLowerCase() === name.toLowerCase());

export const findMonster = (name: string, version = '') => baseMonsters.find(
  (m) => m.name === name && (!version || m.version === version),
);

/** A monster ready for the engine, with GearCalc's defence reductions and current HP applied as inputs. */
export function prepareMonster(base: Omit<Monster, 'inputs'>, reductions: Partial<DefenceReductions> = {}): Monster {
  return {
    ...base,
    inputs: {
      ...INITIAL_MONSTER_INPUTS,
      monsterCurrentHp: base.skills.hp,
      defenceReductions: { ...NO_REDUCTIONS, ...reductions },
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
