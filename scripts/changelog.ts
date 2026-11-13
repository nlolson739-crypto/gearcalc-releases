// Builds the "What's new" list for vite.config.ts (see changelog() below). Run directly to print it:
//   deno run -A scripts/changelog.ts
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diffData, type ChangelogEntry, type DataSet } from '../src/data/changes.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// What changed with each calculator update, for the app's "What's new": every commit of this repository that moved
// vendor.lock to a newer wiki engine, with the engine's change notes and what changed in its monster, gear and spell
// numbers. Needs the git history of both repositories (the release builds have it); entries that can't be compared
// say so instead.
export function changelog(limit = 12): ChangelogEntry[] {
  const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const vendor = here('../vendor/osrs-dps-calc');
  const files = ['monsters', 'equipment', 'spells'] as const;
  const dataAt = (commit: string): DataSet | null => {
    try {
      return Object.fromEntries(files.map((f) => [f, JSON.parse(git(['-C', vendor, 'show', `${commit}:cdn/json/${f}.json`]))]));
    } catch {
      return null;
    }
  };
  const out: ChangelogEntry[] = [];
  let commits: string[] = [];
  try {
    commits = git(['-C', here('..'), 'log', '--format=%H %cI', '--', 'vendor.lock']).trim().split('\n').filter(Boolean);
  } catch {
    return out;
  }
  for (const line of commits) {
    if (out.length >= limit) break;
    const [hash, date] = line.split(' ');
    let lock: string; let prev: string;
    try {
      lock = git(['show', `${hash}:vendor.lock`]).trim();
      prev = git(['show', `${hash}^:vendor.lock`]).trim();
    } catch {
      continue; // the first commit: nothing to compare with
    }
    if (!lock || lock === prev) continue;
    let version = '';
    try { version = git(['show', `${hash}:VERSION`]).trim(); } catch { /* older commits */ }
    let notes: string[] = [];
    try {
      notes = git(['-C', vendor, 'log', '--format=%s', `${prev}..${lock}`]).trim().split('\n')
        .filter((n) => n && !/^\[automated\] update json files/i.test(n));
    } catch { /* history not fetched */ }
    const before = dataAt(prev); const after = dataAt(lock);
    out.push({
      version, date, engine: lock.slice(0, 7), notes, data: before && after ? diffData(before, after) : null,
    });
  }
  return out;
}


if (import.meta.main) {
  const t = Date.now();
  const cl = changelog();
  for (const e of cl) {
    console.log(e.version, e.date, e.engine, `notes ${e.notes.length}`, e.data ? `changed ${e.data.changed.length} added ${e.data.added.length} removed ${e.data.removed.length}` : 'no data');
    for (const n of e.notes.slice(0, 5)) console.log('   note:', n);
    for (const c of (e.data?.changed ?? []).slice(0, 8)) console.log('   ', c.kind, c.name, c.changes.map((x) => `${x.field} ${x.from} -> ${x.to}`).join('; '));
  }
  console.log(`${JSON.stringify(cl).length} bytes, ${Date.now() - t} ms`);
}
