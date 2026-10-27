import { useRef, useState } from 'react';
import {
  EquipmentCategory, equipment, prepareMonster, scaledMonster, SLOTS, stylesFor, type DefenceReductions, type EquipmentPiece, type Slot,
} from '~/engine';
import { drainKeyFor, playerFor, runSetup } from '~/calc';
import { calculate } from '~/engine';
import { CORRUPTED_GAUNTLET_EQUIPMENT_IDS, GAUNTLET_EQUIPMENT_IDS } from '@/lib/Equipment';
import {
  baseMonster, EXTRA_MONSTERS, gearOf, targetMonster, type AppState, type Setup,
} from '~/state';
import {
  fmtTime, itemImage, MonsterPicker, Panel, Segmented,
} from '~/ui/common';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };
type Family = 'melee' | 'ranged' | 'magic';
type Goal = 'dps' | 'ttk' | 'spec';

interface Found {
  setup: Setup;
  score: number;
  label: string;
  detail: string;
}

const MELEE_TYPES = ['stab', 'slash', 'crush'];
const familyOfStyle = (t: string | null) => (t === null ? null : MELEE_TYPES.includes(t) ? 'melee' : t);

// Items that only exist inside minigames, events or other game modes (per their wiki pages), so the search skips them.
const RESTRICTED = /deadman|wilderness wars|wilderness champion|emir's arena|soul wars|castle wars|last man standing|trailblazer|leagues|unobtainable|\bbeta\b|historical|\(bh\)|\(wrapped\)/i;
const UNUSABLE_VERSIONS = ['Broken', 'Uncharged', 'Inactive'];
const GAUNTLET = new Set([...GAUNTLET_EQUIPMENT_IDS, ...CORRUPTED_GAUNTLET_EQUIPMENT_IDS]);
const usable = (e: EquipmentPiece) => !GAUNTLET.has(e.id) && !RESTRICTED.test(e.name) && !RESTRICTED.test(e.version) && !UNUSABLE_VERSIONS.includes(e.version);

// One entry per item name (the data has e.g. Locked / Normal copies of the same item).
const unique = (() => {
  const seen = new Map<string, EquipmentPiece>();
  for (const e of equipment.filter(usable)) {
    const k = `${e.slot}:${e.name}`;
    const cur = seen.get(k);
    if (!cur || (cur.version && (!e.version || ['Charged', 'Normal', 'Active'].includes(e.version)))) seen.set(k, e);
  }
  return [...seen.values()];
})();

function score(e: EquipmentPiece, f: Family) {
  const o = e.offensive; const b = e.bonuses;
  if (f === 'melee') return Math.max(o.stab, o.slash, o.crush) + 1.5 * b.str;
  if (f === 'ranged') return o.ranged + 1.5 * b.ranged_str;
  return o.magic + 3 * b.magic_str;
}

function weaponFits(e: EquipmentPiece, f: Family) {
  const styles = stylesFor(e).filter((s) => s.stance !== 'Manual Cast');
  if (f === 'magic') return e.category === EquipmentCategory.POWERED_STAFF || e.category === EquipmentCategory.POWERED_WAND;
  return styles.some((s) => familyOfStyle(s.type) === f);
}

/** Drops ornament and recolour copies: items with identical stats, speed and weapon type as an earlier one. */
function distinctStats(items: EquipmentPiece[]): EquipmentPiece[] {
  const bySig = new Map<string, EquipmentPiece>();
  for (const e of items) {
    const sig = JSON.stringify([e.offensive, e.bonuses, e.speed, e.category, e.isTwoHanded]);
    const cur = bySig.get(sig);
    if (!cur || e.name.length < cur.name.length) bySig.set(sig, e); // keep the plain name, not "Holy ..." / "... (o)"
  }
  return [...bySig.values()];
}

/** Best 3 results, skipping ones that only differ by an ornament or recolour (same score with the same style). */
function topDistinct(results: Found[]): Found[] {
  const out: Found[] = [];
  for (const r of [...results].sort((a, b) => b.score - a.score)) {
    if (!out.some((o) => Math.abs(o.score - r.score) < 1e-9 && o.setup.style === r.setup.style)) out.push(r);
  }
  return out.slice(0, 3);
}

const SPEC_WEAPONS =['Elder maul', 'Dragon warhammer', 'Arclight', 'Emberlight', 'Tonalztics of Ralos', 'Bandos godsword'];
const tick = () => new Promise((r) => { setTimeout(r, 0); });

export default function BestScreen({ state, setState }: Props) {
  const [family, setFamily] = useState<Family>('melee');
  const [goal, setGoal] = useState<Goal>('dps');
  const [from, setFrom] = useState(0);
  const [locked, setLocked] = useState<Slot[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [checked, setChecked] = useState(0);
  const cancel = useRef(false);

  const monster = targetMonster(state);
  const start = state.setups[Math.min(from, state.setups.length - 1)];

  const evaluate = (s: Setup): number => {
    if (goal === 'spec') {
      const weapon = gearOf(s).weapon ?? null;
      const key = drainKeyFor(weapon);
      if (!key) return 0;
      const r = calculate(playerFor(s, state.buffs, monster), monster, true);
      const red = { ...state.reductions } as DefenceReductions;
      if (key === 'bgs') red.bgs += Math.round(r.maxHit / 2);
      else if (key === 'tonalztic') red.tonalztic += 2;
      else (red[key] as number) += 1;
      const before = scaledMonster(monster).skills.def;
      const after = scaledMonster(prepareMonster(baseMonster(state.target), red)).skills.def;
      return r.accuracy * (before - after);
    }
    const r = runSetup(s, state.buffs, monster);
    return goal === 'ttk' ? -(r.totalTtk ?? Infinity) : r.totalDps;
  };

  const bestStyle = (s: Setup): Setup => {
    const styles = stylesFor(gearOf(s).weapon).filter((x) => (goal === 'spec' ? true : familyOfStyle(x.type) === family) && x.stance !== 'Manual Cast');
    let best = s; let bestV = -Infinity;
    for (const st of styles) {
      const c = { ...s, style: st.name };
      const v = evaluate(c);
      if (v > bestV) { best = c; bestV = v; }
    }
    return best;
  };

  async function run() {
    cancel.current = false;
    setFound([]);
    setProgress(0);
    let evals = 0;
    const startSetup: Setup = { ...start, specWeapon: undefined };
    const weaponPool = goal === 'spec'
      ? unique.filter((e) => e.slot === 'weapon' && SPEC_WEAPONS.includes(e.name))
      : distinctStats(unique.filter((e) => e.slot === 'weapon' && weaponFits(e, family))).sort((a, b) => score(b, family) - score(a, family)).slice(0, 60);
    const fam: Family = goal === 'spec' ? 'melee' : family;
    const pool: Partial<Record<Slot, EquipmentPiece[]>> = {};
    for (const slot of SLOTS) {
      if (slot === 'weapon') continue;
      pool[slot] = unique.filter((e) => e.slot === slot && score(e, fam) > 0).sort((a, b) => score(b, fam) - score(a, fam)).slice(0, 14);
    }

    // Swap one slot at a time (best style each time) until nothing improves.
    const optimise = async (from: Setup, perSlot: number, passes: number, onSlot: (f: number) => void) => {
      let cur = bestStyle(from); let curV = evaluate(cur); evals += 4;
      for (let pass = 0; pass < passes; pass++) {
        let improved = false;
        const slots = SLOTS.filter((x) => x !== 'weapon' && !locked.includes(x));
        for (let si = 0; si < slots.length; si++) {
          const slot = slots[si];
          if (cancel.current) return { cur, curV };
          if (slot === 'shield' && gearOf(cur).weapon?.isTwoHanded) continue;
          for (const cand of (pool[slot] ?? []).slice(0, perSlot)) {
            const c = { ...cur, gear: { ...cur.gear, [slot]: cand.id } };
            const v = evaluate(c); evals++;
            if (v > curV + 1e-9) { cur = c; curV = v; improved = true; }
          }
          onSlot((pass + (si + 1) / slots.length) / passes);
        }
        cur = bestStyle(cur); curV = evaluate(cur);
        if (!improved) break;
      }
      return { cur, curV };
    };

    // 1. quick armour pass for every candidate weapon, so weapons are ranked in gear that suits them
    const withWeapon = (w: EquipmentPiece): Setup => ({ ...startSetup, gear: { ...startSetup.gear, weapon: w.id, ...(w.isTwoHanded ? { shield: undefined } : {}) } });
    const quick: { setup: Setup, v: number }[] = [];
    for (let wi = 0; wi < weaponPool.length && !cancel.current; wi++) {
      const { cur, curV } = await optimise(withWeapon(weaponPool[wi]), 5, 1, () => {});
      quick.push({ setup: cur, v: curV });
      setProgress((wi + 1) / weaponPool.length * 0.5);
      setChecked(evals);
      await tick();
    }
    quick.sort((a, b) => b.v - a.v);
    const tops = quick.slice(0, 6);

    // 2. full optimisation of the best 6
    const results: Found[] = [];
    for (let wi = 0; wi < tops.length && !cancel.current; wi++) {
      const { cur, curV } = await optimise(tops[wi].setup, 14, 3, (f) => {
        setProgress(0.5 + ((wi + f) / tops.length) * 0.5);
        setChecked(evals);
      });
      await tick();
      const g = gearOf(cur);
      results.push({
        setup: { ...cur, name: `${g.weapon?.name ?? 'Setup'} · ${cur.style}` },
        score: curV,
        label: `${g.weapon?.name ?? '—'} · ${cur.style ?? ''}`,
        detail: SLOTS.filter((x) => x !== 'weapon').map((x) => g[x]?.name).filter(Boolean).join(', '),
      });
      setFound(topDistinct(results));
    }
    setChecked(evals);
    setProgress(null);
  }

  const metricLabel = goal === 'spec' ? 'Expected Defence drained' : goal === 'ttk' ? 'Time to kill' : 'DPS';
  const fmt = (v: number) => (goal === 'spec' ? v.toFixed(1) : goal === 'ttk' ? fmtTime(-v) : v.toFixed(2));

  return (
    <main className="page">
      <aside className="side" aria-label="Search options">
        <Panel title="Find the best setup">
          <MonsterPicker value={state.target} onChange={(k) => setState((s) => ({ ...s, target: k }))} extra={EXTRA_MONSTERS} />
          <div className="small" style={{ color: 'var(--soft)' }}>Combat style</div>
          <Segmented<Family> label="Combat style" value={family} onChange={setFamily} options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }, { value: 'magic', label: 'Magic', detail: 'powered staves' }]} />
          <div className="small" style={{ color: 'var(--soft)' }}>Rank by</div>
          <Segmented<Goal> label="Rank by" value={goal} onChange={setGoal} options={[{ value: 'dps', label: 'DPS' }, { value: 'ttk', label: 'Time to kill' }, { value: 'spec', label: 'Spec drain' }]} />
          <div className="small" style={{ color: 'var(--soft)' }}>Start from and keep locked slots of</div>
          <Segmented<string> label="Start from" value={String(from)} onChange={(v) => setFrom(Number(v))} options={state.setups.map((s, i) => ({ value: String(i), label: s.name }))} />
          <div className="row">
            {SLOTS.filter((s) => s !== 'weapon').map((s) => (
              <label key={s} className="row small" style={{ gap: 6, minHeight: 32 }}>
                <input type="checkbox" checked={locked.includes(s)} onChange={() => setLocked((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]))} style={{ accentColor: 'var(--gold)' }} />
                {s}
              </label>
            ))}
          </div>
          <div className="tiny muted">Uses the buffs, prayer, potions and defence reductions from the DPS screen.</div>
          {progress === null
            ? <button type="button" className="btn primary" onClick={run}>Search setups</button>
            : <button type="button" className="btn" onClick={() => { cancel.current = true; }}>Stop</button>}
          {progress !== null && <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        </Panel>
      </aside>

      <section className="main" aria-label="Results">
        <div className="spread">
          <h1>Top {goal === 'spec' ? 'defence-drain spec' : family} setups</h1>
          <span className="small muted">{checked ? `${checked} combinations checked` : 'Not searched yet'}</span>
        </div>
        {found.map((f, i) => {
          const g = gearOf(f.setup);
          return (
            <div key={f.label} className={`result-card${i === 0 ? ' first' : ''}`}>
              <span className="result-rank">{i + 1}</span>
              <span className="item-icon" style={{ width: 52, height: 48 }}><img src={itemImage(g.weapon)} alt="" /></span>
              <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{f.label}</span>
                <div className="result-items">
                  {SLOTS.filter((s) => s !== 'weapon' && g[s]).map((s) => <span key={s} className="item-icon" title={g[s]!.name}><img src={itemImage(g[s])} alt={g[s]!.name} /></span>)}
                </div>
                <span className="tiny muted">{f.detail}</span>
              </div>
              <div className="metric"><span>{metricLabel}</span><span>{fmt(f.score)}</span></div>
              <div className="row">
                {state.setups.map((s, si) => (
                  <button
                    type="button"
                    key={s.id}
                    className="btn"
                    onClick={() => setState((st) => ({
                      ...st,
                      setups: st.setups.map((x, xi) => (xi === si ? {
                        ...x, gear: f.setup.gear, style: f.setup.style, name: f.setup.name,
                      } : x)),
                    }))}
                  >
                    Use as {si + 1}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="small muted" style={{ margin: 0 }}>
          The search gives each of the 60 strongest weapons for the style a quick armour pass, then fully optimises the
          best 6 by swapping one slot at a time (from the strongest items for that slot) until nothing improves.
          Minigame, event and other-mode items are skipped. Every result is calculated by the OSRS Wiki DPS engine.
          Budget and owned-items filters aren't built yet.
        </p>
      </section>
    </main>
  );
}
