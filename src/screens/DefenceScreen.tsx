import { useMemo } from 'react';
import {
  defenceFloor, findItem, NO_REDUCTIONS, prepareMonster, scaledMonster, type DefenceReductions,
} from '~/engine';
import RaidBossList from '~/ui/RaidBossList';
import { baseMonster, EXTRA_MONSTERS, type AppState } from '~/state';
import {
  IconToggle, itemImage, MonsterPicker, Panel, Stepper, wikiImage,
} from '~/ui/common';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };

type CountKey = 'elderMaul' | 'dwh' | 'arclight' | 'emberlight' | 'tonalztic' | 'bgs' | 'seercull' | 'ayak';
// 'count' specs drain per landed hit; 'damage' specs drain by the damage the spec dealt (from each weapon's wiki page).
const SPECS: { key: CountKey, item: string, label: string, kind: 'count' | 'damage', max: number }[] = [
  { key: 'elderMaul', item: 'Elder maul', label: 'Elder maul: specs that hit', kind: 'count', max: 6 },
  { key: 'dwh', item: 'Dragon warhammer', label: 'Dragon warhammer: specs that hit', kind: 'count', max: 6 },
  { key: 'arclight', item: 'Arclight', label: 'Arclight: specs that hit', kind: 'count', max: 10 },
  { key: 'emberlight', item: 'Emberlight', label: 'Emberlight: specs that hit', kind: 'count', max: 10 },
  { key: 'tonalztic', item: 'Tonalztics of Ralos', label: 'Ralos: hitsplats that hit (up to 2 per spec)', kind: 'count', max: 12 },
  { key: 'bgs', item: 'Bandos godsword', label: 'Bandos godsword: total damage dealt (drains Defence first)', kind: 'damage', max: 999 },
  { key: 'seercull', item: 'Seercull', label: 'Seercull: damage dealt (drains Magic)', kind: 'damage', max: 999 },
  { key: 'ayak', item: 'Eye of Ayak', label: 'Eye of Ayak: damage dealt (drains magic defence)', kind: 'damage', max: 999 },
];

export default function DefenceScreen({ state, setState }: Props) {
  const base = baseMonster(state.target);
  const r = state.reductions;
  const setR = (patch: Partial<DefenceReductions>) => setState((s) => ({ ...s, reductions: { ...s.reductions, ...patch } }));
  const m = prepareMonster(base, r);
  const after = scaledMonster(m);
  const floor = defenceFloor(m);
  const def = after.skills.def;
  const capped = floor > 0 && def <= floor;

  const toCap = useMemo(() => SPECS.filter((s) => ['elderMaul', 'dwh', 'arclight', 'emberlight', 'tonalztic'].includes(s.key)).map((s) => {
    if (floor === 0) return `${s.item.split(' ')[0]} –`;
    let n = 0;
    while (n < 40 && scaledMonster(prepareMonster(base, { ...NO_REDUCTIONS, [s.key]: n })).skills.def > floor) n++;
    return `${s.item === 'Tonalztics of Ralos' ? 'Ralos' : s.item.replace('Dragon warhammer', 'DWH')} ${n >= 40 ? 'n/a' : n}${s.key === 'tonalztic' ? ' hits' : ''}`;
  }), [state.target, floor]);

  const skills: [string, string, number, number][] = [
    ['Attack', 'Attack icon.png', base.skills.atk, after.skills.atk],
    ['Strength', 'Strength icon.png', base.skills.str, after.skills.str],
    ['Defence', 'Defence icon.png', base.skills.def, after.skills.def],
    ['Magic', 'Magic icon.png', base.skills.magic, after.skills.magic],
    ['Ranged', 'Ranged icon.png', base.skills.ranged, after.skills.ranged],
    ['Magic defence', 'Magic defence icon.png', base.defensive.magic, after.defensive.magic],
  ];

  return (
    <main className="page">
      <aside className="side" aria-label="Bosses">
        <Panel title="Target">
          <MonsterPicker value={state.target} onChange={(k) => setState((s) => ({ ...s, target: k }))} extra={EXTRA_MONSTERS} />
        </Panel>
        <RaidBossList target={state.target} onPick={(key) => setState((s) => ({ ...s, target: key, reductions: { ...NO_REDUCTIONS } }))} />
      </aside>

      <section className="main" aria-label="Defence reduction">
        <Panel>
          <div className="spread">
            <h1>{base.name}{base.version ? ` · ${base.version}` : ''}</h1>
            <span className="small muted">{base.attributes.includes('demon' as never) ? 'Demon · ' : ''}{floor > 0 ? `Drain floor ${floor}` : 'No drain floor'}</span>
          </div>
          <div className="row" style={{ alignItems: 'flex-end', gap: '12px 28px' }}>
            <div>
              <div className="small muted">Defence now</div>
              <div className="mono" style={{ fontSize: 48, fontWeight: 600, lineHeight: 1, color: capped ? 'var(--teal)' : 'var(--text-strong)' }}>{def}</div>
            </div>
            <div className="mono small" style={{ color: capped ? 'var(--teal)' : 'var(--muted)', paddingBottom: 4 }}>
              {floor > 0 ? (capped ? `At the floor (${floor})` : `${def - floor} above the floor`) : 'Can reach 0'}
            </div>
          </div>
          <div className="bar">
            <div style={{ width: `${(def / Math.max(1, base.skills.def)) * 100}%` }} />
            {floor > 0 && <i style={{ left: `${(floor / base.skills.def) * 100}%` }} />}
          </div>
        </Panel>

        <Panel title="Special attacks that hit">
          <div className="spec-grid">
            {SPECS.map((s) => {
              const it = findItem(s.item);
              const v = r[s.key];
              return (
                <div key={s.key} className={`spec-cell${v ? ' active' : ''}`} title={s.label}>
                  <img src={itemImage(it)} alt={s.item} />
                  {s.kind === 'count'
                    ? <Stepper label={s.label} value={v} max={s.max} onChange={(x) => setR({ [s.key]: x } as Partial<DefenceReductions>)} />
                    : (
                      <label className="dmg-input">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={s.max}
                          aria-label={s.label}
                          value={v || ''}
                          placeholder="0"
                          onChange={(e) => setR({ [s.key]: Math.max(0, Math.min(s.max, Math.floor(Number(e.target.value) || 0))) } as Partial<DefenceReductions>)}
                        />
                        <span>dmg</span>
                      </label>
                    )}
                </div>
              );
            })}
          </div>
          <div className="row">
            <IconToggle label="Vulnerability (−10% Defence)" icon={wikiImage('Vulnerability.png')} on={r.vulnerability} onClick={() => setR({ vulnerability: !r.vulnerability, accursed: false })} />
            <IconToggle label="Accursed sceptre spec (−15% Defence and Magic)" icon={itemImage(findItem('Accursed sceptre'))} on={r.accursed} onClick={() => setR({ accursed: !r.accursed, vulnerability: false })} />
            <button type="button" className="btn" onClick={() => setR({ ...NO_REDUCTIONS })}>Reset</button>
          </div>
          <div className="tiny" style={{ color: 'var(--soft)' }}>
            <strong>Ralos:</strong> each number on its counter is 1 hitsplat that landed, not 1 spec. A Ralos spec can hit up to 2 hitsplats,
            so one fully landed spec = 2. Bandos godsword, Seercull and Eye of Ayak: type the damage the spec dealt.
          </div>
          <div className="mono small" style={{ color: 'var(--soft)' }}>{floor > 0 ? `To the floor from full: ${toCap.join(' · ')}` : 'No drain floor on this target.'}</div>
          <div className="tiny muted">
            Drains are applied the way the wiki engine applies them: Accursed or Vulnerability, then elder maul, dragon warhammer,
            Arclight, Emberlight, Ralos, Seercull, Bandos godsword damage, then Eye of Ayak.
          </div>
        </Panel>

        <Panel title="Stats after specials">
          <div className="skills-after">
            {skills.map(([name, icon, b, now]) => (
              <div key={name} title={name}>
                <img src={wikiImage(icon)} alt={name} style={{ width: 25, height: 25, objectFit: 'contain' }} />
                <span className={`now${now < b ? ' drained' : ''}`}>{now}</span>
                <span className="mono tiny muted">of {b}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}
