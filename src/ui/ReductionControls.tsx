import {
  findItem, NO_REDUCTIONS, type DefenceReductions,
} from '~/engine';
import {
  IconToggle, itemImage, Stepper, wikiImage,
} from '~/ui/common';

type CountKey = 'elderMaul' | 'dwh' | 'arclight' | 'emberlight' | 'tonalztic' | 'bgs' | 'seercull' | 'ayak';
// 'count' specs drain per landed hit; 'damage' specs drain by the damage the spec dealt (from each weapon's wiki page).
export const SPECS: { key: CountKey, item: string, label: string, kind: 'count' | 'damage', max: number }[] = [
  { key: 'elderMaul', item: 'Elder maul', label: 'Elder maul: specs that hit', kind: 'count', max: 6 },
  { key: 'dwh', item: 'Dragon warhammer', label: 'Dragon warhammer: specs that hit', kind: 'count', max: 6 },
  { key: 'arclight', item: 'Arclight', label: 'Arclight: specs that hit', kind: 'count', max: 10 },
  { key: 'emberlight', item: 'Emberlight', label: 'Emberlight: specs that hit', kind: 'count', max: 10 },
  { key: 'tonalztic', item: 'Tonalztics of Ralos', label: 'Ralos: hitsplats that hit (up to 2 per spec)', kind: 'count', max: 12 },
  { key: 'bgs', item: 'Bandos godsword', label: 'Bandos godsword: total damage dealt (drains Defence first)', kind: 'damage', max: 999 },
  { key: 'seercull', item: 'Seercull', label: 'Seercull: damage dealt (drains Magic)', kind: 'damage', max: 999 },
  { key: 'ayak', item: 'Eye of Ayak', label: 'Eye of Ayak: damage dealt (drains magic defence)', kind: 'damage', max: 999 },
];

/** The spec counters, damage boxes and Vulnerability / Accursed toggles. Used by the Defence and Best setup tabs. */
export default function ReductionControls({ reductions: r, onChange, compact = false }: {
  reductions: DefenceReductions,
  onChange: (patch: Partial<DefenceReductions>) => void,
  compact?: boolean,
}) {
  return (
    <>
      <div className={`spec-grid${compact ? ' compact' : ''}`}>
        {SPECS.map((s) => {
          const v = r[s.key];
          return (
            <div key={s.key} className={`spec-cell${v ? ' active' : ''}`} title={s.label}>
              <img src={itemImage(findItem(s.item))} alt={s.item} />
              {s.kind === 'count'
                ? <Stepper label={s.label} value={v} max={s.max} onChange={(x) => onChange({ [s.key]: x } as Partial<DefenceReductions>)} />
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
                      onChange={(e) => onChange({ [s.key]: Math.max(0, Math.min(s.max, Math.floor(Number(e.target.value) || 0))) } as Partial<DefenceReductions>)}
                    />
                    <span>dmg</span>
                  </label>
                )}
            </div>
          );
        })}
      </div>
      <div className="row">
        <IconToggle label="Vulnerability (−10% Defence)" icon={wikiImage('Vulnerability.png')} on={r.vulnerability} onClick={() => onChange({ vulnerability: !r.vulnerability, accursed: false })} />
        <IconToggle label="Accursed sceptre spec (−15% Defence and Magic)" icon={itemImage(findItem('Accursed sceptre'))} on={r.accursed} onClick={() => onChange({ accursed: !r.accursed, vulnerability: false })} />
        <button type="button" className="btn" onClick={() => onChange({ ...NO_REDUCTIONS })}>Reset</button>
      </div>
    </>
  );
}
