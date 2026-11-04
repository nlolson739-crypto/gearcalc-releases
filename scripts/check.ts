// Sanity checks for the engine wrapper. Run with: deno task check
import {
  buildPlayer, calculate, defenceFloor, findItem, findMonster, phasesFor, Potion, prepareMonster, Prayer, scaledMonster,
} from '~/engine';

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
