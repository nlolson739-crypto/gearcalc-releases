import { useRef, useState } from 'react';
import {
  allSpells, calculate, defenceFloor, EquipmentCategory, equipment, findItem, prepareMonster, scaledMonster, SLOTS, stylesFor,
  type DefenceReductions, type EquipmentPiece, type PlayerCombatStyle, type Slot,
} from '~/engine';
import {
  AmmoApplicability, ammoApplicability, CORRUPTED_GAUNTLET_EQUIPMENT_IDS, GAUNTLET_EQUIPMENT_IDS,
} from '@/lib/Equipment';
import { drainKeyFor, playerFor, runSetup } from '~/calc';
import {
  baseMonster, EXTRA_MONSTERS, gearOf, targetMonster, type AppState, type Setup,
} from '~/state';
import {
  fmtTime, itemImage, MonsterPicker, Panel, Segmented,
} from '~/ui/common';
import { ownedChecker } from '~/bank';
import { isModeOnlyItem } from '~/rules/wiki';
import BankPicker from '~/ui/BankPicker';
import ReductionControls from '~/ui/ReductionControls';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };
type Family = 'melee' | 'ranged' | 'magic';
type Goal = 'dps' | 'ttk' | 'spec';
type AttackType = 'stab' | 'slash' | 'crush' | 'ranged' | 'magic';

/** One kind of build the search optimises on its own, e.g. "Melee · Slash". */
interface Category {
  id: string;
  family: Family;
  label: string;
  type: AttackType;
  /** spec-drain mode: the one spec weapon this category is about */
  weapon?: EquipmentPiece;
}

const CATEGORIES: Category[] = [
  { id: 'stab', family: 'melee', label: 'Melee · Stab', type: 'stab' },
  { id: 'slash', family: 'melee', label: 'Melee · Slash', type: 'slash' },
  { id: 'crush', family: 'melee', label: 'Melee · Crush', type: 'crush' },
  { id: 'ranged', family: 'ranged', label: 'Ranged', type: 'ranged' },
  { id: 'magic', family: 'magic', label: 'Magic', type: 'magic' },
];

const SPEC_WEAPONS = ['Elder maul', 'Dragon warhammer', 'Arclight', 'Emberlight', 'Tonalztics of Ralos', 'Bandos godsword'];

// Spells that need a particular staff (god spells, Iban Blast) or that only bind are left out of the magic search.
const SPECIAL_STAFF_SPELLS = ['Iban Blast', 'Claws of Guthix', 'Flames of Zamorak', 'Saradomin Strike', 'Entangle', 'Snare', 'Bind'];
const SPELL_POOL = allSpells.filter((s) => s.max_hit > 0 && !SPECIAL_STAFF_SPELLS.includes(s.name)
  && ['standard', 'ancient', 'arceuus'].includes(s.spellbook));

// Items that only exist inside minigames, events or other game modes (per their wiki pages), so the search skips them.
const RESTRICTED = /deadman|wilderness wars|wilderness champion|emir's arena|soul wars|castle wars|last man standing|trailblazer|leagues|unobtainable|\bbeta\b|historical|\(bh\)|\(wrapped\)/i;
// "0" is fully degraded Barrows, which has no stats
const UNUSABLE_VERSIONS = ['Broken', 'Uncharged', 'Inactive', '0'];
const GAUNTLET = new Set([...GAUNTLET_EQUIPMENT_IDS, ...CORRUPTED_GAUNTLET_EQUIPMENT_IDS]);
const usable = (e: EquipmentPiece) => !GAUNTLET.has(e.id) && !isModeOnlyItem(e.name) && !RESTRICTED.test(e.name) && !RESTRICTED.test(e.version) && !UNUSABLE_VERSIONS.includes(e.version)
  // novelty "weapons" (Gnomeball, Ghost buster 500, ...) have no real attack speed in the data, which inflates their DPS
  && (e.slot !== 'weapon' || e.speed > 0);

// One entry per item name (the data has e.g. Locked / Normal copies of the same item).
const allUnique = (() => {
  const seen = new Map<string, EquipmentPiece>();
  for (const e of equipment.filter(usable)) {
    const k = `${e.slot}:${e.name}`;
    const cur = seen.get(k);
    if (!cur || (cur.version && (!e.version || ['Charged', 'Normal', 'Active', 'Undamaged'].includes(e.version)))) seen.set(k, e);
  }
  return [...seen.values()];
})();

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

/** Rough strength of an item for a build type: only used to pick which items the search tries. */
function score(e: EquipmentPiece, t: AttackType) {
  const o = e.offensive; const b = e.bonuses;
  if (t === 'ranged') return o.ranged + 1.5 * b.ranged_str;
  if (t === 'magic') return o.magic + 3 * b.magic_str;
  return o[t] + 1.5 * b.str;
}

const casts = (s: PlayerCombatStyle) => s.type === 'magic' && /cast/i.test(s.stance ?? '');
const POWERED = [EquipmentCategory.POWERED_STAFF, EquipmentCategory.POWERED_WAND];

/** Attack styles of a weapon that belong to a build type (magic: built-in spells, or autocasting a spell). */
function stylesForType(e: EquipmentPiece | null | undefined, t: AttackType): PlayerCombatStyle[] {
  return stylesFor(e).filter((s) => {
    if (t === 'magic') return s.type === 'magic' && (POWERED.includes(e?.category as EquipmentCategory) ? !casts(s) : /autocast/i.test(s.stance ?? ''));
    return s.type === t;
  });
}

const tick = () => new Promise((r) => { setTimeout(r, 0); });

interface Found {
  category: Category;
  setup: Setup;
  score: number;
  /** other weapons for the same build type, best first */
  others: { name: string, score: number }[];
}

export default function BestScreen({ state, setState }: Props) {
  const [families, setFamilies] = useState<Family[]>(['melee', 'ranged', 'magic']);
  const [goal, setGoal] = useState<Goal>('dps');
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [checked, setChecked] = useState(0);
  const [note, setNote] = useState('');
  // what the last search was run with, so the results can say when they're out of date
  const [searchedWith, setSearchedWith] = useState('');
  // which result was just copied into which setup, for a moment of feedback on the button
  const [used, setUsed] = useState<string | null>(null);
  const usedTimer = useRef<number>();
  const cancel = useRef(false);

  const monster = targetMonster(state);
  const inputsKey = JSON.stringify([state.target, state.reductions, state.buffs, state.activeBank, families, goal]);
  const setR = (patch: Partial<DefenceReductions>) => setState((s) => ({ ...s, reductions: { ...s.reductions, ...patch } }));
  const base = baseMonster(state.target);
  const defNow = scaledMonster(monster).skills.def;
  const floor = defenceFloor(monster);

  const evaluate = (s: Setup, spec: boolean): number => {
    if (spec) {
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

  async function run() {
    cancel.current = false;
    setFound([]);
    setNote('');
    setSearchedWith(inputsKey);
    setProgress(0);
    let evals = 0;
    const spec = goal === 'spec';
    // Limit the search to one imported bank, or search every item.
    const bank = state.banks.find((b) => b.id === state.activeBank);
    const owned = bank ? ownedChecker(bank) : () => true;
    const unique = allUnique.filter(owned);
    const missing: string[] = [];
    const cats: Category[] = spec
      ? SPEC_WEAPONS.map((n) => findItem(n)).filter((w): w is EquipmentPiece => !!w && owned(w))
        .map((w) => ({ id: `spec:${w.name}`, family: 'melee' as Family, label: w.name, type: 'crush' as AttackType, weapon: w }))
      : CATEGORIES.filter((c) => families.includes(c.family));
    const results: Found[] = [];

    for (let ci = 0; ci < cats.length && !cancel.current; ci++) {
      const cat = cats[ci];
      setStatus(`Searching ${cat.label}…`);
      const armourType: AttackType = spec ? 'crush' : cat.type;
      const pool: Partial<Record<Slot, EquipmentPiece[]>> = {};
      for (const slot of SLOTS) {
        if (slot === 'weapon') continue;
        pool[slot] = unique.filter((e) => e.slot === slot && score(e, armourType) > 0).sort((a, b) => score(b, armourType) - score(a, armourType)).slice(0, slot === 'ammo' ? 16 : 12);
      }
      const candidates = cat.weapon ? [cat.weapon]
        : distinctStats(unique.filter((e) => e.slot === 'weapon' && stylesForType(e, cat.type).length > 0));
      if (!candidates.length) { missing.push(cat.label); continue; }

      // Spells worth trying on staves: the strongest against this target with a reference staff.
      let spells: string[] = [];
      if (cat.type === 'magic') {
        const staff = findItem('Kodai wand') ?? candidates.find((w) => !POWERED.includes(w.category as EquipmentCategory));
        if (staff) {
          const ref: Setup = { id: 'ref', name: 'ref', color: '', gear: { weapon: staff.id }, style: stylesForType(staff, 'magic')[0]?.name };
          spells = SPELL_POOL.map((sp) => ({ n: sp.name, v: evaluate({ ...ref, spell: sp.name }, false) }))
            .sort((a, b) => b.v - a.v).slice(0, 6).map((x) => x.n);
          evals += SPELL_POOL.length;
        }
      }

      const bestStyle = (s: Setup): { setup: Setup, v: number } => {
        const styles = spec ? stylesFor(gearOf(s).weapon).filter((x) => x.stance !== 'Manual Cast') : stylesForType(gearOf(s).weapon, cat.type);
        let best = s; let bestV = -Infinity;
        for (const st of styles) {
          const options = !spec && cat.type === 'magic' && casts(st) ? spells.map((sp) => ({ ...s, style: st.name, spell: sp })) : [{ ...s, style: st.name, spell: undefined }];
          for (const c of options) {
            const v = evaluate(c, spec); evals++;
            if (v > bestV) { best = c; bestV = v; }
          }
        }
        return { setup: best, v: bestV };
      };

      // Start each weapon from the strongest-looking item in every slot, then swap one slot at a time.
      const start: Setup['gear'] = {};
      for (const slot of SLOTS) if (slot !== 'weapon' && pool[slot]?.length) start[slot] = pool[slot]![0].id;
      // Bows, crossbows and the like only work with their own ammo, so they get the best of what they can fire.
      const ammoFor = (w: EquipmentPiece): EquipmentPiece[] => {
        if (ammoApplicability(w.id) === AmmoApplicability.ALLOWED) return pool.ammo ?? [];
        return unique.filter((a) => a.slot === 'ammo' && ammoApplicability(w.id, a.id) === AmmoApplicability.INCLUDED)
          .sort((a, b) => score(b, 'ranged') - score(a, 'ranged')).slice(0, 16);
      };
      const optimise = async (w: EquipmentPiece, perSlot: number, passes: number) => {
        let { setup: cur, v: curV } = bestStyle(withWeapon(w));
        for (let pass = 0; pass < passes && !cancel.current; pass++) {
          let improved = false;
          for (const slot of SLOTS) {
            if (slot === 'weapon' || (slot === 'shield' && w.isTwoHanded)) continue;
            for (const cand of (slot === 'ammo' ? ammoFor(w) : pool[slot] ?? []).slice(0, perSlot)) {
              const c = { ...cur, gear: { ...cur.gear, [slot]: cand.id } };
              const v = evaluate(c, spec); evals++;
              if (v > curV + 1e-9) { cur = c; curV = v; improved = true; }
            }
            const none = { ...cur, gear: { ...cur.gear, [slot]: undefined } }; // an empty slot can beat a bad item
            const nv = evaluate(none, spec); evals++;
            if (nv > curV + 1e-9) { cur = none; curV = nv; improved = true; }
          }
          const bs = bestStyle(cur); cur = bs.setup; curV = bs.v;
          if (!improved) break;
          await tick();
        }
        return { setup: cur, v: curV };
      };

      // Pick the 25 weapons to search by real DPS in the starting gear, not by stats: a weapon's stats miss things like
      // the scythe's extra hits on large targets or a weapon's special effects.
      const withWeapon = (w: EquipmentPiece): Setup => ({
        id: cat.id, name: cat.label, color: '', gear: { ...start, weapon: w.id, ammo: ammoFor(w)[0]?.id ?? start.ammo, ...(w.isTwoHanded ? { shield: undefined } : {}) },
      });
      const ranked: { w: EquipmentPiece, v: number }[] = [];
      for (let wi = 0; wi < candidates.length && !cancel.current; wi++) {
        ranked.push({ w: candidates[wi], v: bestStyle(withWeapon(candidates[wi])).v });
        if (wi % 40 === 39) { setChecked(evals); await tick(); }
      }
      const weapons = ranked.sort((a, b) => b.v - a.v).slice(0, 25).map((x) => x.w);

      // quick pass for those weapons, then a full one for the best 3
      const quick: { w: EquipmentPiece, v: number }[] = [];
      for (let wi = 0; wi < weapons.length && !cancel.current; wi++) {
        quick.push({ w: weapons[wi], v: (await optimise(weapons[wi], 4, 1)).v });
        setProgress((ci + 0.5 * (wi + 1) / weapons.length) / cats.length);
        setChecked(evals);
        await tick();
      }
      quick.sort((a, b) => b.v - a.v);
      const full: { setup: Setup, v: number }[] = [];
      const tops = quick.slice(0, cat.weapon ? 1 : 3);
      for (let wi = 0; wi < tops.length && !cancel.current; wi++) {
        full.push(await optimise(tops[wi].w, 12, 3));
        setProgress((ci + 0.5 + 0.5 * (wi + 1) / tops.length) / cats.length);
        setChecked(evals);
        await tick();
      }
      full.sort((a, b) => b.v - a.v);
      // TTK scores are negative (a shorter kill scores higher), so only DPS and spec drain need to be above 0
      if (full[0] && Number.isFinite(full[0].v) && (goal === 'ttk' || full[0].v > 0)) {
        const others = [...full.slice(1).map((f) => ({ name: gearOf(f.setup).weapon?.name ?? '?', score: f.v })),
          ...quick.slice(tops.length, tops.length + 2).map((q) => ({ name: q.w.name, score: q.v }))];
        results.push({ category: cat, setup: full[0].setup, score: full[0].v, others });
        setFound([...results].sort((a, b) => b.score - a.score));
      }
    }
    setChecked(evals);
    setStatus(cancel.current ? 'Stopped.' : '');
    setNote(spec && !cats.length ? 'This bank has none of the spec weapons.'
      : missing.length ? `No weapons in this bank for: ${missing.join(', ')}.` : '');
    setProgress(null);
  }

  const metricLabel = goal === 'spec' ? 'Expected Defence drained' : goal === 'ttk' ? 'Time to kill' : 'DPS';
  const fmt = (v: number) => (goal === 'spec' ? v.toFixed(1) : goal === 'ttk' ? fmtTime(-v) : v.toFixed(2));
  const toggleFamily = (f: Family) => setFamilies((l) => (l.includes(f) ? (l.length > 1 ? l.filter((x) => x !== f) : l) : [...l, f]));

  return (
    <main className="page">
      <aside className="side" aria-label="Search options">
        <Panel title="Find the best setup">
          <MonsterPicker value={state.target} onChange={(k) => setState((s) => ({ ...s, target: k }))} extra={EXTRA_MONSTERS} />
          <div className="small" style={{ color: 'var(--soft)' }}>Gear to use</div>
          <BankPicker state={state} setState={setState} />
          <div className="small" style={{ color: 'var(--soft)' }}>Rank by</div>
          <Segmented<Goal> label="Rank by" value={goal} onChange={(g) => { setGoal(g); setFound([]); setChecked(0); setNote(''); }} options={[{ value: 'dps', label: 'DPS' }, { value: 'ttk', label: 'Time to kill' }, { value: 'spec', label: 'Spec drain' }]} />
          {goal !== 'spec' && (
            <>
              <div className="small" style={{ color: 'var(--soft)' }}>Styles to include</div>
              <div role="group" aria-label="Styles to include" className="segmented">
                {(['melee', 'ranged', 'magic'] as Family[]).map((f) => (
                  <button type="button" key={f} className={families.includes(f) ? 'on' : ''} aria-pressed={families.includes(f)} onClick={() => toggleFamily(f)}>
                    <span>{f[0].toUpperCase() + f.slice(1)}</span>
                    <small>{f === 'melee' ? 'stab, slash, crush' : f === 'magic' ? 'staves + spells' : 'bows, thrown'}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="tiny muted">
            {goal === 'spec'
              ? 'Ranks the defence-drain spec weapons by expected Defence drained per spec (hit chance × drain), each in its best gear.'
              : 'Finds the best build for each style (melee split into stab, slash and crush) and ranks them against each other. Uses the prayers, potions and buffs from the DPS tab and the defence reductions below.'}
          </div>
          {progress === null
            ? <button type="button" className="btn primary" onClick={run}>Search setups</button>
            : <button type="button" className="btn" onClick={() => { cancel.current = true; }}>Stop</button>}
          {progress !== null && (
            <>
              <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <div className="tiny muted">{status}</div>
            </>
          )}
        </Panel>
        <Panel title="Defence reductions">
          <div className="spread small">
            <span>
              Defence <span className="mono">{base.skills.def}</span> → <strong className="mono" style={{ color: floor > 0 && defNow <= floor ? 'var(--teal)' : 'var(--text-strong)' }}>{defNow}</strong>
            </span>
            <span className="tiny muted">{floor > 0 ? `floor ${floor}` : 'no floor'}</span>
          </div>
          <ReductionControls reductions={state.reductions} onChange={setR} compact />
          <div className="tiny muted">The same drains as the DPS and Defence reduction tabs: specs that landed before you switch to this setup.</div>
        </Panel>
      </aside>

      <section className="main" aria-label="Results">
        <div className="spread">
          <h1>{goal === 'spec' ? 'Best defence-drain specs' : 'Best builds, all styles ranked'}</h1>
          <span className="small muted">{checked ? `${checked.toLocaleString()} combinations checked` : 'Not searched yet'}</span>
        </div>
        <div aria-live="polite" className="sr-only">{used ? `Copied into setup ${state.setups.findIndex((s) => used.endsWith(`:${s.id}`)) + 1}` : ''}</div>
        {found.length > 0 && progress === null && searchedWith !== inputsKey && (
          <div className="stale-note">
            <span>The target, buffs, defence reductions or gear changed since this search.</span>
            <button type="button" className="btn" onClick={run}>Search again</button>
          </div>
        )}
        {note && <div className="small muted">{note}</div>}
        {found.map((f, i) => {
          const g = gearOf(f.setup);
          return (
            <div key={f.category.id} className={`result-card${i === 0 ? ' first' : ''}`}>
              <span className="result-rank">{i + 1}</span>
              <span className="item-icon" style={{ width: 52, height: 48 }}><img src={itemImage(g.weapon)} alt="" /></span>
              <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="cat-badge">{f.category.label}</span>
                  <span style={{ fontWeight: 600 }}>{g.weapon?.name ?? '—'} · {f.setup.style}{f.setup.spell ? ` · ${f.setup.spell}` : ''}</span>
                </span>
                <div className="result-items">
                  {SLOTS.filter((s) => s !== 'weapon' && g[s]).map((s) => <span key={s} className="item-icon" title={g[s]!.name}><img src={itemImage(g[s])} alt={g[s]!.name} /></span>)}
                </div>
                {f.others.length > 0 && (
                  <span className="tiny muted">Other {f.category.label.toLowerCase()} weapons: {f.others.map((o) => `${o.name} (${fmt(o.score)})`).join(' · ')}</span>
                )}
              </div>
              <div className="metric"><span>{metricLabel}</span><span>{fmt(f.score)}</span></div>
              <div className="row">
                {state.setups.map((s, si) => {
                  const done = used === `${f.category.id}:${s.id}`;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={`btn${done ? ' done' : ''}`}
                      aria-label={`Use as ${si + 1}: copy this build into ${s.name} on the DPS tab`}
                      onClick={() => {
                        setState((st) => ({
                          ...st,
                          setups: st.setups.map((x, xi) => (xi === si ? {
                            ...x, gear: f.setup.gear, style: f.setup.style, spell: f.setup.spell, name: `${f.category.label} · ${g.weapon?.name ?? ''}`,
                          } : x)),
                        }));
                        setUsed(`${f.category.id}:${s.id}`);
                        window.clearTimeout(usedTimer.current);
                        usedTimer.current = window.setTimeout(() => setUsed(null), 2200);
                      }}
                    >
                      {done ? `✓ Setup ${si + 1}` : `Use as ${si + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="small muted" style={{ margin: 0 }}>
          For each style the search ranks every weapon by real DPS against this target (staves with the 6 strongest
          spells), takes the best 25,
          gives each a quick gear pass, then fully optimises the best 3 by swapping one slot at a time. Minigame, event and
          other-mode items are skipped, and set bonuses that need several pieces at once (e.g. Void) may be missed. Every
          number comes from the OSRS Wiki DPS engine. Choose one of your imported banks under Gear to use to search only
          the gear you own.
        </p>
      </section>
    </main>
  );
}
