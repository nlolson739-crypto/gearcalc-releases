import { useMemo, useState } from 'react';
import {
  allSpells, buildPlayer, calculate, findItem, monsterKey, prepareMonster, Potion, Prayer,
} from '~/engine';
import {
  FREEZE_SPELLS, rulesFor, wikiUrl, XARTH_CORPSE, type BindDurationRule, type FreezeSpell, type FreezeThresholdRule,
} from '~/rules/wiki';
import { baseMonster, EXTRA_MONSTERS } from '~/state';
import {
  IconRow, IconToggle, itemImage, MonsterPicker, Panel, pct, Stepper, WikiBadge, wikiImage,
} from '~/ui/common';

const SALVE = findItem('Salve amulet(ei)');

export default function FreezeScreen() {
  const [target, setTarget] = useState(monsterKey(XARTH_CORPSE));
  const [spellName, setSpellName] = useState('Undead Grasp');
  const [mark, setMark] = useState(true);
  const [heart, setHeart] = useState(false);
  const [salve, setSalve] = useState(true);
  const [sceptre, setSceptre] = useState(false);
  const [bonus, setBonus] = useState(43);

  const base = baseMonster(target);
  const monster = prepareMonster(base);
  const undead = base.attributes.includes('undead' as never);
  const rules = rulesFor(base.name);
  const threshold = rules.find((r): r is FreezeThresholdRule => r.kind === 'freeze-threshold');
  const durationRules = rules.filter((r): r is BindDurationRule => r.kind === 'bind-duration');

  // Hit chance from the wiki engine: a manual cast with the given magic attack bonus.
  const hitChance = (spell: FreezeSpell, augury: boolean, withSalve: boolean) => {
    const s = allSpells.find((x) => x.name === spell.name) ?? null;
    const p = buildPlayer({
      name: 'freeze',
      gear: { neck: withSalve ? SALVE : null },
      styleName: 'Spell',
      prayers: augury ? [Prayer.AUGURY] : [],
      potions: heart ? [Potion.SATURATED_HEART] : [],
      spell: s,
      buffs: { markOfDarknessSpell: mark },
    }, monster);
    p.offensive = { ...p.offensive, magic: bonus };
    return calculate(p, monster).accuracy;
  };

  const ruled = (augury: boolean) => !!threshold && bonus >= (augury ? threshold.withAugury : threshold.withoutAugury);
  const bindChance = (s: FreezeSpell) => (mark ? s.markBindChance : s.bindChance);
  const ticks = (s: FreezeSpell) => {
    const r = durationRules.find((d) => d.spell === s.name && (!d.needsMark || mark));
    if (r) return { n: r.ticks, note: 'wiki, this target' };
    if (sceptre && s.sceptreTicks) return { n: s.sceptreTicks, note: 'Ancient sceptre' };
    return { n: s.ticks, note: '' };
  };
  const freezeChance = (s: FreezeSpell, augury: boolean, withSalve: boolean) => {
    const formula = hitChance(s, augury, withSalve) * bindChance(s);
    return { formula, value: ruled(augury) ? bindChance(s) : formula, ruled: ruled(augury) };
  };

  const spell = FREEZE_SPELLS.find((s) => s.name === spellName)!;
  const grid = useMemo(() => [true, false].map((aug) => [true, false].map((sv) => freezeChance(spell, aug, sv))), [spellName, mark, heart, bonus, target]);
  const table = useMemo(() => FREEZE_SPELLS.map((s) => {
    const a = freezeChance(s, true, salve && undead);
    const n = freezeChance(s, false, salve && undead);
    const t = ticks(s);
    return { s, a, n, t, avg: a.value * t.n };
  }), [mark, heart, bonus, target, salve, sceptre]);
  const bestAvg = Math.max(...table.map((x) => x.avg));

  const show = (c: { value: number, ruled: boolean }) => (c.ruled && c.value >= 0.999 ? 'Guaranteed' : pct(c.value));

  return (
    <main className="page">
      <aside className="side" aria-label="Your cast">
        <Panel title="Target">
          <MonsterPicker value={target} onChange={setTarget} extra={EXTRA_MONSTERS} />
          <div className="stat-grid">
            <div className="stat"><span>Magic</span><span>{base.skills.magic}</span></div>
            <div className="stat"><span>Magic def</span><span>+{base.defensive.magic}</span></div>
            <div className="stat"><span>Type</span><span style={{ fontSize: 15 }}>{undead ? 'Undead' : base.attributes[0] ?? '—'}</span></div>
          </div>
        </Panel>
        <Panel title="Your cast">
          {(['Standard', 'Ancient', 'Arceuus'] as const).map((book) => (
            <IconRow key={book} label={book}>
              {FREEZE_SPELLS.filter((s) => s.book === book).map((s) => (
                <IconToggle key={s.name} label={`${s.name} (level ${s.level})`} icon={wikiImage(`${s.name}.png`)} on={spellName === s.name} onClick={() => setSpellName(s.name)} />
              ))}
            </IconRow>
          ))}
          <IconRow label="Buffs">
            <IconToggle label="Mark of Darkness (grasp spells)" icon={wikiImage('Mark of Darkness.png')} on={mark} onClick={() => setMark(!mark)} />
            <IconToggle label="Saturated heart" icon={wikiImage('Saturated heart.png')} on={heart} onClick={() => setHeart(!heart)} />
            <IconToggle label="Salve amulet (ei) (spell table)" icon={itemImage(SALVE)} on={salve} onClick={() => setSalve(!salve)} />
            <IconToggle label="Ancient sceptre (longer ice freezes)" icon={itemImage(findItem('Ancient sceptre'))} on={sceptre} onClick={() => setSceptre(!sceptre)} />
          </IconRow>
          <div className="small" style={{ color: 'var(--soft)' }}>
            {spell.name}: {bindChance(spell) === 1 ? 'every hit freezes' : `${Math.round(bindChance(spell) * 100)}% of hits bind`} for {ticks(spell).n} ticks
          </div>
          <div className="spread">
            <span className="small" style={{ color: 'var(--soft)' }}>Magic attack bonus</span>
            <Stepper label="magic attack bonus" value={bonus} min={-80} max={250} onChange={setBonus} />
          </div>
          <div className="row">
            {[0, 33, 43, 70].map((v) => <button type="button" key={v} className="btn" onClick={() => setBonus(v)}>+{v}</button>)}
          </div>
          <div className="tiny muted">The whole setup's magic attack bonus, e.g. purging staff (+37) and book of the dead (+6) = +43 before armour penalties.</div>
        </Panel>
      </aside>

      <section className="main" aria-label="Freeze chance">
        <div className="spread">
          <h1>Freeze chance per cast</h1>
          <span className="small muted">With and without Augury and the Salve amulet (ei)</span>
        </div>
        <Panel>
          <div className="results">
            <div className="freeze-matrix">
              <span />
              <span className="row small" style={{ color: 'var(--soft)' }}><img src={itemImage(SALVE)} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />Salve (ei){undead ? '' : ' (no effect: not undead)'}</span>
              <span className="small" style={{ color: 'var(--soft)' }}>No Salve</span>
              {grid.map((rowCells, ri) => [
                <span key={`l${ri}`} className="row small" style={{ color: 'var(--soft)' }}>
                  {ri === 0 && <img src={wikiImage('Augury.png')} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />}
                  {ri === 0 ? 'Augury' : 'No Augury'}
                </span>,
                ...rowCells.map((c, ci) => (
                  <div key={`${ri}${ci}`} className={`freeze-cell${c.ruled ? ' ruled' : ''}`}>
                    <span className="big" style={{ color: c.value >= 0.999 ? 'var(--teal)' : c.value >= 0.8 ? 'var(--gold)' : 'var(--text)' }}>{show(c)}</span>
                    <span className="tiny muted">{c.ruled ? `Formula alone says ${pct(c.formula)}` : threshold ? `Below the wiki threshold (+${ri === 0 ? threshold.withAugury : threshold.withoutAugury})` : 'Wiki engine accuracy × bind chance'}</span>
                    {c.ruled && <WikiBadge approximate={threshold?.approximate} />}
                  </div>
                )),
              ])}
            </div>
          </div>
        </Panel>

        <Panel title="Every freeze spell on this target">
          <div className="results">
            <div className="spell-table">
              <div className="tr head"><span>Spell</span><span>Freeze length</span><span>Binds on hit</span><span>Augury</span><span>No Augury</span><span>Avg ticks / cast</span></div>
              {table.map(({
                s, a, n, t, avg,
              }) => (
                <div key={s.name} className={`tr${s.name === spellName ? ' on' : ''}`}>
                  <span className="spell-name">
                    <img src={wikiImage(`${s.name}.png`)} alt="" />
                    <span><a href={wikiUrl(s.source.page)} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</a><br /><span className="tiny muted">{s.book} · lvl {s.level}</span></span>
                  </span>
                  <span>{t.n} ticks{t.note ? <span className="tiny muted"> ({t.note})</span> : null}</span>
                  <span>{Math.round(bindChance(s) * 100)}%</span>
                  <span>{show(a)}</span>
                  <span>{show(n)}</span>
                  <span style={{ fontWeight: 600, color: Math.abs(avg - bestAvg) < 0.01 ? 'var(--gold)' : undefined }}>{avg.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="tiny muted">Lengths, bind chances and levels from each spell's wiki page (linked). Grasp binds roll only on a hit; Mark of Darkness doubles them. Avg ticks = freeze chance with Augury × length.</div>
        </Panel>

        {rules.length > 0 && (
          <Panel title="Wiki rules for this target">
            {rules.map((r) => (
              <div key={r.kind + r.source.page} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <WikiBadge approximate={r.approximate} />
                <div className="small" style={{ color: '#c3c9d3' }}>{r.summary}</div>
                {r.kind === 'freeze-threshold' && (
                  <div className="row mono small">
                    <span style={{ color: bonus >= r.withAugury ? 'var(--teal)' : 'var(--gold)' }}>With Augury: {bonus >= r.withAugury ? 'met' : `needs +${r.withAugury - bonus} more`}</span>
                    <span style={{ color: bonus >= r.withoutAugury ? 'var(--teal)' : 'var(--gold)' }}>Without Augury: {bonus >= r.withoutAugury ? 'met' : `needs +${r.withoutAugury - bonus} more`}</span>
                  </div>
                )}
                <div className="tiny muted">Source: <a href={wikiUrl(r.source.page)} target="_blank" rel="noreferrer">OSRS Wiki · {r.source.page}</a> (revision {r.source.revision})</div>
              </div>
            ))}
          </Panel>
        )}
      </section>
    </main>
  );
}
