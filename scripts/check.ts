// Sanity checks for the engine wrapper. Run with: deno task check
import {
  buildPlayer, calculate, dartsFor, defenceFloor, findItem, findMonster, phasesFor, Potion, prepareMonster, Prayer, scaledMonster, withDart,
} from '~/engine';
import { DEFAULT_STATE, gearOf } from '~/state';

const need = <T>(x: T | undefined, what: string): T => {
  if (!x) throw new Error(`missing ${what}`);
  return x;
};
const item = (n: string) => need(findItem(n), n);

const p3 = need(findMonster('Ocellus', 'Phase 3'), 'Ocellus P3');

const torva = {
  head: item('Torva full helm'), body: item('Torva platebody'), legs: item('Torva platelegs'),
  cape: item('Infernal cape'), neck: item('Amulet of rancour'), hands: item('Ferocious gloves'),
  feet: item('Primordial boots'), ring: item('Ultor ring'), weapon: item('Scythe of vitur'),
};
const inq = {
  ...torva, head: item("Inquisitor's great helm"), body: item("Inquisitor's hauberk"), legs: item("Inquisitor's plateskirt"),
};

for (const mauls of [0, 2]) {
  const m = prepareMonster(p3, { elderMaul: mauls });
  const after = scaledMonster(m);
  console.log(`\nOcellus P3 after ${mauls} elder maul(s): Defence ${after.skills.def} (floor ${defenceFloor(m)})`);
  for (const [label, gear] of [['Torva', torva], ['Inquisitor', inq]] as const) {
    for (const style of ['Chop', 'Jab']) {
      const p = buildPlayer({
        name: label, gear, styleName: style, prayers: [Prayer.PIETY], potions: [Potion.SUPER_COMBAT],
      }, m);
      const r = calculate(p, m);
      console.log(`  ${label.padEnd(10)} ${style.padEnd(4)} max ${String(r.maxHit).padStart(3)}  acc ${(r.accuracy * 100).toFixed(1).padStart(5)}%  dps ${r.dps.toFixed(2).padStart(6)}  ttk ${r.ttk?.toFixed(1) ?? '-'}s`);
    }
  }
}

// Defence drains vs the sheet we made from wiki numbers (maul to cap = 2 everywhere capped).
const bosses: [string, string][] = [['Archive Guardian', 'Grounded'], ['Ezekiel', ''], ['Bork', ''], ['Moia', ''], ['Xarth', ''], ['Ocellus', 'Phase 1'], ['Ocellus', 'Phase 2'], ['Ocellus', 'Phase 3']];
console.log('\nDefence after 1 / 2 elder mauls, floor:');
for (const [n, v] of bosses) {
  const b = need(findMonster(n, v), n);
  const d1 = scaledMonster(prepareMonster(b, { elderMaul: 1 })).skills.def;
  const d2 = scaledMonster(prepareMonster(b, { elderMaul: 2 })).skills.def;
  console.log(`  ${(n + ' ' + v).padEnd(26)} ${b.skills.def} -> ${d1} -> ${d2}  (floor ${defenceFloor(prepareMonster(b))})`);
}

// Fight phases from the wiki engine (MONSTER_PHASES_BY_ID): same gear, phase chosen vs the default first phase.
{
  const bork = need(findMonster('Bork', ''), 'Bork');
  console.log(`
Phases (Torva scythe, Piety, super combat; ${phasesFor(p3).length} Ocellus P3 phases, ${phasesFor(bork).length} Bork phases):`);
  const cases: [string, typeof p3, string | undefined, string][] = [
    ['Ocellus P3', p3, undefined, 'Chop'],
    ['Ocellus P3', p3, 'Phase 4 Explosions - With Speed-Up', 'Chop'],
    ['Bork', bork, undefined, 'Chop'],
    ['Bork', bork, 'Stunned', 'Chop'],
  ];
  const dps: number[] = [];
  for (const [label, mon, phase, style] of cases) {
    const m = prepareMonster(mon, {}, phase);
    const p = buildPlayer({
      name: label, gear: torva, styleName: style, prayers: [Prayer.PIETY], potions: [Potion.SUPER_COMBAT],
    }, m);
    const r = calculate(p, m);
    dps.push(r.dps);
    console.log(`  ${`${label} · ${m.inputs.phase}`.padEnd(52)} max ${String(r.maxHit).padStart(3)}  acc ${(r.accuracy * 100).toFixed(1).padStart(5)}%  dps ${r.dps.toFixed(2).padStart(6)}`);
  }
  if (prepareMonster(p3).inputs.phase !== 'Phase 3') throw new Error('Ocellus P3 should default to Phase 3');
  if (prepareMonster(p3, {}, 'Not a phase').inputs.phase !== 'Phase 3') throw new Error('an unknown phase should fall back to the first');
  if (dps[1] === dps[0]) throw new Error('Ocellus Phase 4 explosions changed nothing');
  if (!(dps[3] > dps[2])) throw new Error('stunned Bork should take more melee DPS');
}

// Ocellus Phase 1 against the wiki's recommended equipment (The Fractured Archive/Strategies, Reduced Defence):
// Obligator > Ascension crossbows > Twisted bow / Toxic blowpipe > Scythe of Vitur / Inquisitor's mace > Soulreaper axe.
{
  const m = prepareMonster(need(findMonster('Ocellus', 'Phase 1'), 'Ocellus P1'), { elderMaul: 2 });
  const rng = {
    head: item('Masori mask (f)'), body: item('Masori body (f)'), legs: item('Masori chaps (f)'), cape: item("Dizana's quiver"),
    neck: item('Necklace of anguish'), hands: item('Zaryte vambraces'), feet: item('Pegasian boots'), ring: item('Venator ring'),
  };
  const melee = { ...inq, ring: item('Ultor ring') };
  const pipe = need(findItem('Toxic blowpipe', 'Charged'), 'Toxic blowpipe');
  const dps = (gear: object, style: string, ranged: boolean) => calculate(buildPlayer({
    name: style, gear, styleName: style, prayers: [ranged ? Prayer.RIGOUR : Prayer.PIETY], potions: DEFAULT_STATE.buffs.potions,
  }, m), m).dps;
  const list: [string, number][] = [
    ['Obligator', dps({ ...melee, weapon: need(findItem('Obligator', 'Charged'), 'Obligator') }, 'Thrust-Agg', false)],
    ['Ascension crossbows', dps({ ...rng, weapon: item('Ascension crossbows'), ammo: item('Diamond ascension bolts (e)') }, 'Rapid', true)],
    ['Twisted bow', dps({ ...rng, weapon: item('Twisted bow'), ammo: item('Dragon arrow') }, 'Rapid', true)],
    ['Toxic blowpipe, strongest dart', dps({ ...rng, weapon: withDart(pipe) }, 'Rapid', true)],
    ['Scythe of Vitur', dps({ ...torva }, 'Chop', false)],
    ["Inquisitor's mace", dps({ ...melee, weapon: item("Inquisitor's mace"), shield: item('Avernic defender') }, 'Pummel', false)],
  ];
  console.log('\nOcellus P1, Defence 129, default potions (wiki order):');
  for (const [n, v] of list) console.log(`  ${n.padEnd(32)} ${v.toFixed(2).padStart(6)}`);
  const v = Object.fromEntries(list);
  if (!(v.Obligator > v['Ascension crossbows'] && v['Ascension crossbows'] > v['Twisted bow'] && v['Twisted bow'] > v['Scythe of Vitur'])) {
    throw new Error('Ocellus P1 order differs from the wiki');
  }
  if (Math.abs(v['Toxic blowpipe, strongest dart'] / v['Twisted bow'] - 1) > 0.05) throw new Error('blowpipe should be level with the twisted bow');

  // Blowpipes: the dart counts, the chosen one is kept, and each blowpipe only fires what it allows.
  const noDart = dps({ ...rng, weapon: pipe }, 'Rapid', true);
  if (!(v['Toxic blowpipe, strongest dart'] > noDart)) throw new Error('a dart should add damage to a blowpipe');
  const darts = dartsFor(pipe);
  if (darts[0].name !== 'Dragon dart') throw new Error(`strongest dart is ${darts[0].name}`);
  const low = darts[darts.length - 1];
  if (gearOf({ id: 'x', name: 'x', color: '', gear: { weapon: pipe.id }, dart: low.id }).weapon?.itemVars?.blowpipeDartId !== low.id) throw new Error('chosen dart not kept');
  if (gearOf({ id: 'x', name: 'x', color: '', gear: { weapon: pipe.id } }).weapon?.itemVars?.blowpipeDartId !== darts[0].id) throw new Error('blowpipe should default to its strongest dart');
  if (dartsFor(need(findItem('Camphor blowpipe', 'Charged'), 'Camphor blowpipe')).some((d) => d.name === 'Dragon dart')) throw new Error('camphor blowpipe cannot fire dragon darts');
  if (dartsFor(item('Twisted bow')).length || withDart(item('Twisted bow'))?.itemVars) throw new Error('only blowpipes take darts');
}

// What's new: the comparison finds a changed boss stat, a new item and a removed one, and nothing when nothing changed.
{
  const { diffData, isEmptyDiff } = await import('~/data/changes');
  const monsters = (await import('../vendor/osrs-dps-calc/cdn/json/monsters.json')).default as { name: string, version: string, skills: { def: number } }[];
  const equipment = (await import('../vendor/osrs-dps-calc/cdn/json/equipment.json')).default as { name: string }[];
  if (!isEmptyDiff(diffData({ monsters, equipment }, { monsters, equipment }))) throw new Error('same data should show no changes');
  const edited = monsters.map((m) => (m.name === 'Ocellus' && m.version === 'Phase 3' ? { ...m, skills: { ...m.skills, def: m.skills.def - 10 } } : m));
  const d = diffData({ monsters, equipment }, { monsters: edited, equipment: [...equipment.slice(1), { ...equipment[1], id: -1, name: 'Test sword' }] });
  const oc = d.changed.find((c) => c.name === 'Ocellus (Phase 3)');
  if (!oc || oc.changes.length !== 1 || oc.changes[0].field !== 'Defence level') throw new Error(`Ocellus change not found: ${JSON.stringify(d.changed)}`);
  if (!d.added.some((a) => a.name === 'Test sword')) throw new Error('new item not listed');
  if (!d.removed.some((r) => r.name === equipment[0].name || r.name.startsWith(`${equipment[0].name} (`))) throw new Error('removed item not listed');
  console.log(`
What's new comparison: ${oc.name} ${oc.changes[0].field} ${oc.changes[0].from} -> ${oc.changes[0].to}`);
}

// The shape check for downloaded wiki data must accept the engine's own data (else every download would be refused).
{
  const { checkFile } = await import('~/data/wikiData');
  const files = {
    monsters: (await import('../vendor/osrs-dps-calc/cdn/json/monsters.json')).default,
    equipment: (await import('../vendor/osrs-dps-calc/cdn/json/equipment.json')).default,
    spells: (await import('../vendor/osrs-dps-calc/cdn/json/spells.json')).default,
  };
  console.log('\nWiki data shape check (built-in copies):');
  for (const [name, data] of Object.entries(files)) {
    const ok = checkFile(name as 'monsters', data);
    if (!ok) throw new Error(`${name}.json fails the shape check`);
    console.log(`  ${name.padEnd(10)} ${ok.entries.length} usable, ${ok.skipped} skipped`);
  }
  if (checkFile('equipment', [{ id: 1, name: 'x' }])) throw new Error('shape check accepted a broken file');
}
