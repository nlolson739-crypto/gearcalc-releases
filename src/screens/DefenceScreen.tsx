import { useMemo } from 'react';
import {
  defenceFloor, findItem, NO_REDUCTIONS, prepareMonster, scaledMonster, type DefenceReductions,
} from '~/engine';
import RaidBossList from '~/ui/RaidBossList';
import ReductionControls, { SPECS } from '~/ui/ReductionControls';
import { baseMonster, EXTRA_MONSTERS, type AppState } from '~/state';
import {
  itemImage, MonsterPicker, Panel, wikiImage,
} from '~/ui/common';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };

// The order the wiki engine's applyDefenceReductions applies drains in (Accursed and Vulnerability are either/or).
const ORDER: { label: string, icon: string }[][] = [
  [{ label: 'Accursed sceptre', icon: itemImage(findItem('Accursed sceptre')) }, { label: 'Vulnerability', icon: wikiImage('Vulnerability.png') }],
  ...['Elder maul', 'Dragon warhammer', 'Arclight', 'Emberlight', 'Tonalztics of Ralos', 'Seercull', 'Bandos godsword', 'Eye of Ayak']
    .map((n) => [{ label: n, icon: itemImage(findItem(n)) }]),
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
          <ReductionControls reductions={r} onChange={setR} />
          <div className="tiny" style={{ color: 'var(--soft)' }}>
            <strong>Ralos:</strong> each number on its counter is 1 hitsplat that landed, not 1 spec. A Ralos spec can hit up to 2 hitsplats,
            so one fully landed spec = 2. Bandos godsword, Seercull and Eye of Ayak: type the damage the spec dealt.
          </div>
          <div className="mono small" style={{ color: 'var(--soft)' }}>{floor > 0 ? `To the floor from full: ${toCap.join(' · ')}` : 'No drain floor on this target.'}</div>
          <div className="order-strip" aria-label="Order the drains are applied in">
            <span className="tiny muted">Applied in this order:</span>
            {ORDER.map((step, i) => (
              <span key={step.map((x) => x.label).join()} className="order-step">
                {i > 0 && <span className="order-arrow" aria-hidden="true">→</span>}
                {step.map((x, j) => (
                  <span key={x.label} className="order-icon">
                    {j > 0 && <span className="tiny muted">/</span>}
                    <img src={x.icon} alt={x.label} title={x.label} />
                  </span>
                ))}
              </span>
            ))}
          </div>
          <div className="tiny muted">This is the wiki engine's order. Percentage drains (maul, warhammer) take more when they come before flat ones.</div>
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
