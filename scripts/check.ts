// Sanity checks for the engine wrapper. Run with: deno task check
import {
  buildPlayer, calculate, defenceFloor, findItem, findMonster, Potion, prepareMonster, Prayer, scaledMonster,
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
