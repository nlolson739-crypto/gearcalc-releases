// Updates the vendored OSRS Wiki DPS engine and data, then checks whether the wiki pages behind GearCalc's own
// rules have changed since they were read. Run with: deno task update-data
const UA = 'osrs-combat-cache (personal use; GearCalc update check)';
const vendor = new URL('../vendor/osrs-dps-calc/', import.meta.url);
const lockFile = new URL('../vendor.lock', import.meta.url);

async function git(...args: string[]) {
  const out = await new Deno.Command('git', { args: ['-C', vendor.pathname.replace(/^\/(\w:)/, '$1'), ...args] }).output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).trim();
}

const before = await git('rev-parse', 'HEAD');
await git('pull', '--ff-only', '--quiet');
const after = await git('rev-parse', 'HEAD');
await Deno.writeTextFile(lockFile, `${after}\n`);
console.log(before === after ? `Wiki engine already up to date (${after.slice(0, 7)}).` : `Wiki engine updated ${before.slice(0, 7)} -> ${after.slice(0, 7)}:\n${await git('log', '--oneline', `${before}..${after}`)}`);

// Every wiki page GearCalc's rules cite, with the revision they were read at.
const rulesSrc = await Deno.readTextFile(new URL('../src/rules/wiki.ts', import.meta.url));
const cited = new Map<string, number>();
for (const m of rulesSrc.matchAll(/page: (['"])(.+?)\1, revision: (\d+)/g)) cited.set(m[2], Number(m[3]));

const titles = [...cited.keys()];
const latest = new Map<string, number>();
for (let i = 0; i < titles.length; i += 40) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', prop: 'revisions', rvprop: 'ids', titles: titles.slice(i, i + 40).join('|'),
  });
  const res = await fetch(`https://oldschool.runescape.wiki/api.php?${q}`, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  for (const p of Object.values<{ title: string, revisions?: { revid: number }[] }>(data.query.pages)) {
    if (p.revisions) latest.set(p.title, p.revisions[0].revid);
  }
}

const changed = titles.filter((t) => latest.get(t) !== cited.get(t));
if (!changed.length) console.log(`All ${titles.length} cited wiki pages are unchanged.`);
else {
  console.log(`\n${changed.length} cited wiki page(s) changed since GearCalc read them. Review these rules:`);
  for (const t of changed) console.log(`  - ${t}: read at ${cited.get(t)}, now ${latest.get(t) ?? 'missing'}  https://oldschool.runescape.wiki/w/${encodeURIComponent(t.replaceAll(' ', '_'))}`);
}
