import {
  allSpells, buildPlayer, calculate, prepareMonster, scaledMonster, type CalcResult, type DefenceReductions, type EquipmentPiece, type Monster,
} from '~/engine';
import { THRALLS } from '~/rules/wiki';
import {
  baseMonster, gearOf, itemById, type AppState, type Buffs, type Setup,
} from '~/state';

export interface SetupResult extends CalcResult {
  thrallDps: number;
  totalDps: number;
  totalTtk: number | undefined;
}

export const thrallDps = (tier: Buffs['thrall']) => THRALLS.find((t) => t.tier === tier)?.dps ?? 0;

export function playerFor(setup: Setup, buffs: Buffs, monster: Monster, weaponOverride?: EquipmentPiece | null, styleOverride?: string) {
  const gear = gearOf(setup);
  if (weaponOverride !== undefined) {
    gear.weapon = weaponOverride;
    if (weaponOverride?.isTwoHanded) gear.shield = null;
  }
  return buildPlayer({
    name: setup.name,
    gear,
    styleName: styleOverride ?? setup.style,
    prayers: buffs.prayers ?? [],
    potions: buffs.potions,
    spell: weaponOverride === undefined && setup.spell ? allSpells.find((s) => s.name === setup.spell) ?? null : null,
    buffs: {
      onSlayerTask: buffs.onSlayerTask,
      markOfDarknessSpell: buffs.markOfDarkness,
      chargeSpell: buffs.charge,
      fragmentOfFire: !!buffs.fragFire,
      fragmentOfWater: !!buffs.fragWater,
      fragmentOfEarth: !!buffs.fragEarth,
      fragmentOfWind: !!buffs.fragAir,
      usingSunfireRunes: !!buffs.sunfire,
    },
  }, monster);
}

export function runSetup(setup: Setup, buffs: Buffs, monster: Monster): SetupResult {
  const r = calculate(playerFor(setup, buffs, monster), monster);
  const t = thrallDps(buffs.thrall);
  const totalDps = r.dps + t;
  const hp = monster.inputs.monsterCurrentHp || monster.skills.hp;
  return {
    ...r, thrallDps: t, totalDps, totalTtk: totalDps > 0 ? hp / totalDps : undefined,
  };
}

// Spec weapons whose special attack drains Defence, mapped to the engine's defence-reduction inputs.
const DRAIN_KEYS: Record<string, keyof DefenceReductions> = {
  'Elder maul': 'elderMaul',
  'Dragon warhammer': 'dwh',
  Arclight: 'arclight',
  Emberlight: 'emberlight',
  'Tonalztics of Ralos': 'tonalztic',
  'Bandos godsword': 'bgs',
  'Seercull': 'seercull',
};
export const drainKeyFor = (e: EquipmentPiece | null | undefined) => (e ? DRAIN_KEYS[e.name] : undefined);

export interface SpecResult {
  weapon: EquipmentPiece;
  accuracy: number;
  maxHit: number;
  /** Defence after one landed spec (BGS: after an average-damage hit) */
  defenceAfter: number | null;
}

export function runSpec(setup: Setup, buffs: Buffs, monster: Monster, state: AppState): SpecResult | null {
  const weapon = itemById(setup.specWeapon);
  if (!weapon) return null;
  const r = calculate(playerFor(setup, buffs, monster, weapon, ''), monster, true);
  const key = drainKeyFor(weapon);
  let defenceAfter: number | null = null;
  if (key) {
    const red = { ...state.reductions } as DefenceReductions;
    if (key === 'bgs') red.bgs += Math.round(r.maxHit / 2);
    else if (key === 'tonalztic') red.tonalztic += 2;
    else (red[key] as number) += 1;
    defenceAfter = scaledMonster(prepareMonster(baseMonster(state.target), red)).skills.def;
  }
  return {
    weapon, accuracy: r.accuracy, maxHit: r.maxHit, defenceAfter,
  };
}
