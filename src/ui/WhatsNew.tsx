import { useEffect, useMemo, useState } from 'react';
import {
  diffData, isEmptyDiff, type ChangelogEntry, type DataDiff, type DataKind,
} from '~/data/changes';
import { builtIn as builtInMonsters } from '~/data/monsters';
import { builtIn as builtInEquipment } from '~/data/equipment';
import { builtIn as builtInSpells } from '~/data/spells';
import { wikiDataStatus } from '~/data/wikiData';
import { Segmented } from '~/ui/common';

// "What's new": what changed in the wiki calculator and in its monster, gear and spell numbers, so it's clear when
// a boss's stats (and so a setup's DPS) changed. Two sources:
//  - each calculator update GearCalc shipped (worked out at build time from the git history, vite.config.ts)
//  - the wiki data the desktop app downloaded since, compared with the copy built into this version.

declare const __CHANGELOG__: ChangelogEntry[] | undefined;
const CHANGELOG: ChangelogEntry[] = typeof __CHANGELOG__ !== 'undefined' && Array.isArray(__CHANGELOG__) ? __CHANGELOG__ : [];
const SEEN_KEY = 'gearcalc-whatsnew-seen';

type Kind = 'all' | DataKind;
const KIND_LABEL: Record<DataKind, string> = { monster: 'Monster', item: 'Gear', spell: 'Spell' };
const MAX_NAMES = 60;

const day = (iso: string | null | undefined) => (iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');

/** The downloaded wiki data compared with the built-in copy (only the files that were downloaded and used). */
function downloadedDiff(): DataDiff | null {
  const d = globalThis.__gearcalcWikiData;
  if (!d || !(d.monsters || d.equipment || d.spells)) return null;
  return diffData(
    { monsters: d.monsters && builtInMonsters, equipment: d.equipment && builtInEquipment, spells: d.spells && builtInSpells },
    { monsters: d.monsters, equipment: d.equipment, spells: d.spells },
  );
}

function DiffView({
  diff, kind, filter, target,
}: { diff: DataDiff, kind: Kind, filter: string, target: string }) {
  const q = filter.trim().toLowerCase();
  const keep = (e: { kind: DataKind, name: string }) => (kind === 'all' || e.kind === kind) && (!q || e.name.toLowerCase().includes(q));
  const isTarget = (name: string) => !!target && (name === target || name.startsWith(`${target} (`));
  // the current target first, then monsters, gear, spells
  const order: DataKind[] = ['monster', 'item', 'spell'];
  const changed = diff.changed.filter(keep).sort((a, b) => Number(isTarget(b.name)) - Number(isTarget(a.name))
    || order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
  const added = diff.added.filter(keep);
  const removed = diff.removed.filter(keep);
  if (!changed.length && !added.length && !removed.length) {
    return <p className="small muted">{q || kind !== 'all' ? 'Nothing matches.' : 'No monster, gear or spell numbers changed.'}</p>;
  }
  const names = (list: { kind: DataKind, name: string }[]) => {
    const shown = list.slice(0, MAX_NAMES).map((e) => e.name).join(', ');
    return list.length > MAX_NAMES ? `${shown} and ${list.length - MAX_NAMES} more` : shown;
  };
  return (
    <div className="wn-diff">
      {changed.map((e) => (
        <div key={`${e.kind}:${e.name}`} className={`wn-entry${isTarget(e.name) ? ' target' : ''}`}>
          <div className="wn-entry-head">
            <span className="wn-kind">{KIND_LABEL[e.kind]}</span>
            <span className="wn-name">{e.name}</span>
            {isTarget(e.name) && <span className="wn-kind gold">Your target</span>}
          </div>
          <div className="wn-changes">
            {e.changes.map((c) => (
              <span key={c.field} className="wn-change">
                {c.field} <span className="wn-from">{c.from}</span> → <span className="wn-to">{c.to}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      {added.length > 0 && (
        <details className="wn-names"><summary>New in the data ({added.length})</summary><p>{names(added)}</p></details>
      )}
      {removed.length > 0 && (
        <details className="wn-names"><summary>No longer in the data ({removed.length})</summary><p>{names(removed)}</p></details>
      )}
    </div>
  );
}

export default function WhatsNew({ target }: { target: string }) {
  const status = wikiDataStatus();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('all');
  const [filter, setFilter] = useState('');
  // worked out once, after the first paint (it reads every monster and item)
  const [downloaded, setDownloaded] = useState<DataDiff | null | undefined>(undefined);
  useEffect(() => {
    const t = window.setTimeout(() => setDownloaded(downloadedDiff()), 0);
    return () => window.clearTimeout(t);
  }, []);

  // What the dot is about: the newest calculator update plus the downloaded data in use.
  const newestKey = `${CHANGELOG[0]?.engine ?? ''}|${status.source === 'downloaded' ? status.dataDate ?? '' : ''}`;
  const [seen, setSeen] = useState<string | null>(() => {
    try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
  });
  const hasDownloaded = downloaded !== undefined && !isEmptyDiff(downloaded);
  const unseen = seen !== newestKey && (CHANGELOG.length > 0 || hasDownloaded);

  const show = () => {
    setOpen(true);
    setSeen(newestKey);
    try { localStorage.setItem(SEEN_KEY, newestKey); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const entries = useMemo(() => CHANGELOG, []);

  return (
    <>
      <button type="button" className="btn small wn-btn" onClick={show} title="What changed in the wiki calculator and in boss, gear and spell stats">
        What&apos;s new
        {unseen && <span className="wn-dot" aria-label="(new changes)" />}
      </button>
      {open && (
        <div className="update-backdrop" role="dialog" aria-modal="true" aria-labelledby="wn-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="update-card wn-card">
            <div className="spread">
              <h2 id="wn-title">What&apos;s new in the calculations</h2>
              <button type="button" className="btn" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            <p className="small muted">
              Changes to the OSRS Wiki DPS calculator and to the monster, gear and spell numbers it uses. A changed number
              here changes the DPS of setups that use it.
            </p>
            <div className="wn-controls">
              <input type="text" aria-label="Filter by name" placeholder="Filter by boss, item or spell…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Segmented<Kind>
                label="Show"
                value={kind}
                onChange={setKind}
                options={[{ value: 'all', label: 'All' }, { value: 'monster', label: 'Monsters' }, { value: 'item', label: 'Gear' }, { value: 'spell', label: 'Spells' }]}
              />
            </div>
            <div className="wn-body">
              {hasDownloaded && downloaded && (
                <section className="wn-section">
                  <h3>Downloaded wiki data <span className="muted">· {day(status.dataDate)}</span></h3>
                  <p className="tiny muted">Newer than the data built into this version; already in use.</p>
                  <DiffView diff={downloaded} kind={kind} filter={filter} target={target} />
                </section>
              )}
              {entries.map((e) => (
                <section key={e.engine} className="wn-section">
                  <h3>{e.version ? `v${e.version}` : 'Update'} <span className="muted">· {day(e.date)} · calculator {e.engine}</span></h3>
                  {e.notes.length > 0
                    ? (
                      <>
                        <div className="tiny muted">Calculator changes from the wiki:</div>
                        <ul className="wn-notes">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                      </>
                    )
                    : <p className="tiny muted">No changes to the calculator&apos;s code, only its data.</p>}
                  {e.data
                    ? <DiffView diff={e.data} kind={kind} filter={filter} target={target} />
                    : <p className="small muted">The numbers for this update couldn&apos;t be compared.</p>}
                </section>
              ))}
              {!entries.length && !hasDownloaded && <p className="small muted">No changes recorded yet.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
