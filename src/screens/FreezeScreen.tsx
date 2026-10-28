import { useMemo, useState } from 'react';
import {
  allSpells, buildPlayer, calculate, findItem, monsterKey, prepareMonster, Potion, Prayer,
} from '~/engine';
import {
  FREEZE_SPELLS, rulesFor, wikiUrl, XARTH_CORPSE, type BindDurationRule, type FreezeSpell, type FreezeThresholdRule,
} from '~/rules/wiki';
import { PrayerMap } from '@/enums/Prayer';
import { baseMonster, EXTRA_MONSTERS } from '~/state';
import {
  IconRow, IconToggle, itemImage, MonsterPicker, NumberField, Panel, pct, Segmented, WikiBadge, wikiImage,
} from '~/ui/common';

const SALVE = findItem('Salve amulet(ei)');

// Prayers that raise magic accuracy, weakest first (their boosts come from the wiki engine).
const MAGIC_PRAYERS = [Prayer.MYSTIC_WILL, Prayer.MYSTIC_LORE, Prayer.MYSTIC_MIGHT, Prayer.MYSTIC_VIGOUR, Prayer.AUGURY];
const prayerIcon = (p: Prayer) => PrayerMap[p].image as unknown as string;

// Full Void mage sets (wiki "Void Knight equipment" / "Elite Void Knight equipment"): +45% magic accuracy; the engine
// applies it when all four pieces are worn.
type VoidSet = 'none' | 'void' | 'elite';
const VOID_GEAR: Record<Exclude<VoidSet, 'none'>, Partial<Record<'head' | 'body' | 'legs' | 'hands', ReturnType<typeof findItem>>>> = {
  void: { head: findItem('Void mage helm'), body: findItem('Void knight top'), legs: findItem('Void knight robe'), hands: findItem('Void knight gloves') },
  elite: { head: findItem('Void mage helm'), body: findItem('Elite void top'), legs: findItem('Elite void robe'), hands: findItem('Void knight gloves') },
};

// Magic attack bonus range for a whole setup (heavy armour can push it below 0).
const BONUS_MIN = -200;
const BONUS_MAX = 400;

export default function FreezeScreen() {
  const [target, setTarget] = useState(monsterKey(XARTH_CORPSE));
  const [spellName, setSpellName] = useState('Undead Grasp');
  const [mark, setMark] = useState(true);
  const [heart, setHeart] = useState(false);
  const [salve, setSalve] = useState(true);
  const [sceptre, setSceptre] = useState(false);
  const [prayer, setPrayer] = useState<Prayer | null>(Prayer.AUGURY);
  const [bonus, setBonus] = useState(43);
  const [magicLevel, setMagicLevel] = useState(99);
  const [voidSet, setVoidSet] = useState<VoidSet>('none');

  const base = baseMonster(target);
  const monster = prepareMonster(base);
  const undead = base.attributes.includes('undead' as never);
  const rules = rulesFor(base.name);
  const threshold = rules.find((r): r is FreezeThresholdRule => r.kind === 'freeze-threshold');
  const durationRules = rules.filter((r): r is BindDurationRule => r.kind === 'bind-duration');

  // Hit chance from the wiki engine: a manual cast with the given magic attack bonus and prayer.
  const hitChance = (spell: FreezeSpell, withSalve: boolean) => {
    const s = allSpells.find((x) => x.name === spell.name) ?? null;
    const p = buildPlayer({
      name: 'freeze',
      gear: { neck: withSalve ? SALVE : null, ...(voidSet === 'none' ? {} : VOID_GEAR[voidSet]) },
      styleName: 'Spell',
      prayers: prayer === null ? [] : [prayer],
      potions: heart ? [Potion.SATURATED_HEART] : [],
      spell: s,
      skills: { magic: magicLevel },
      buffs: { markOfDarknessSpell: mark },
    }, monster);
    p.offensive = { ...p.offensive, magic: bonus };
    return calculate(p, monster).accuracy;
  };

  // The wiki gives a threshold with Augury and one with no prayer. Any other magic prayer (or Void) only adds accuracy,
  // so the no-prayer threshold still holds with it; the Augury one doesn't. The wiki doesn't say what Magic level the
  // values assume, so they're only applied at 99 Magic.
  const thresholdApplies = !!threshold && magicLevel >= 99;
  const thresholdFor = threshold && thresholdApplies ? (prayer === Prayer.AUGURY ? threshold.withAugury : threshold.withoutAugury) : null;
  const ruled = () => thresholdFor !== null && bonus >= thresholdFor;
  const bindChance = (s: FreezeSpell) => (mark ? s.markBindChance : s.bindChance);
  const ticks = (s: FreezeSpell) => {
    const r = durationRules.find((d) => d.spell === s.name && (!d.needsMark || mark));
    if (r) return { n: r.ticks, note: 'wiki, this target' };
    if (sceptre && s.sceptreTicks) return { n: s.sceptreTicks, note: 'Ancient sceptre' };
    return { n: s.ticks, note: '' };
  };
  const freezeChance = (s: FreezeSpell, withSalve: boolean) => {
    const formula = hitChance(s, withSalve) * bindChance(s);
    return { formula, value: ruled() ? bindChance(s) : formula, ruled: ruled() };
  };

  const spell = FREEZE_SPELLS.find((s) => s.name === spellName)!;
  const cells = useMemo(() => [true, false].map((sv) => freezeChance(spell, sv)), [spellName, mark, heart, bonus, target, prayer, magicLevel, voidSet]);
  const table = useMemo(() => FREEZE_SPELLS.map((s) => {
    const c = freezeChance(s, salve && undead);
    const t = ticks(s);
    return { s, c, t, avg: c.value * t.n };
  }), [mark, heart, bonus, target, salve, sceptre, prayer, magicLevel, voidSet]);
  const prayerName = prayer === null ? 'No prayer' : PrayerMap[prayer].name;
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
          <IconRow label="Prayer">
            <button type="button" className={`icon-toggle text${prayer === null ? ' on' : ''}`} aria-pressed={prayer === null} title="No prayer" onClick={() => setPrayer(null)}>None</button>
            {MAGIC_PRAYERS.map((p) => (
              <IconToggle key={p} label={PrayerMap[p].name} icon={prayerIcon(p)} on={prayer === p} onClick={() => setPrayer(prayer === p ? null : p)} />
            ))}
          </IconRow>
          <IconRow label="Buffs">
            <IconToggle label="Mark of Darkness (grasp spells)" icon={wikiImage('Mark of Darkness.png')} on={mark} onClick={() => setMark(!mark)} />
            <IconToggle label="Saturated heart" icon={wikiImage('Saturated heart.png')} on={heart} onClick={() => setHeart(!heart)} />
            <IconToggle label="Salve amulet (ei) (spell table)" icon={itemImage(SALVE)} on={salve} onClick={() => setSalve(!salve)} />
            <IconToggle label="Ancient sceptre (longer ice freezes)" icon={itemImage(findItem('Ancient sceptre'))} on={sceptre} onClick={() => setSceptre(!sceptre)} />
          </IconRow>
          <div className="small" style={{ color: 'var(--soft)' }}>
            {spell.name}: {bindChance(spell) === 1 ? 'every hit freezes' : `${Math.round(bindChance(spell) * 100)}% of hits bind`} for {ticks(spell).n} ticks
          </div>
          <div className="small" style={{ color: 'var(--soft)' }}>Void set bonus</div>
          <Segmented<VoidSet>
            label="Void set bonus"
            value={voidSet}
            onChange={setVoidSet}
            options={[{ value: 'none', label: 'None' }, { value: 'void', label: 'Void mage' }, { value: 'elite', label: 'Elite void' }]}
          />
          {voidSet !== 'none' && <div className="tiny muted">Full {voidSet === 'elite' ? 'elite ' : ''}Void mage set (helm, top, robe, gloves): +45% magic accuracy (OSRS Wiki). Count the pieces' own stats in the magic attack bonus below.</div>}
          <NumberField label="Magic level" value={magicLevel} min={1} max={99} onChange={setMagicLevel} />
          <NumberField label="Magic attack bonus" value={bonus} min={BONUS_MIN} max={BONUS_MAX} onChange={setBonus} />
          <div className="tiny muted">Magic level before boosts (Saturated heart is under Buffs). Magic attack bonus is the whole setup's, e.g. purging staff (+37) and book of the dead (+6) = +43 before armour penalties.</div>
        </Panel>
      </aside>

      <section className="main" aria-label="Freeze chance">
        <div className="spread">
          <h1>Freeze chance per cast</h1>
          <span className="small muted">{prayerName}, with and without the Salve amulet (ei)</span>
        </div>
        <Panel>
          <div className="freeze-pair">
            {cells.map((c, ci) => (
              <div key={ci} className={`freeze-cell${c.ruled ? ' ruled' : ''}`}>
                <span className="row small" style={{ color: 'var(--soft)' }}>
                  {ci === 0 && <img src={itemImage(SALVE)} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                  {ci === 0 ? `Salve (ei)${undead ? '' : ' (no effect: not undead)'}` : 'No Salve'}
                </span>
                <span className="big" style={{ color: c.value >= 0.999 ? 'var(--teal)' : c.value >= 0.8 ? 'var(--gold)' : 'var(--text)' }}>{show(c)}</span>
                <span className="tiny muted">{c.ruled ? `Formula alone says ${pct(c.formula)}` : thresholdFor !== null ? `Below the wiki threshold (+${thresholdFor})` : 'Wiki engine accuracy × bind chance'}</span>
                {c.ruled && <WikiBadge approximate={threshold?.approximate} />}
              </div>
            ))}
          </div>
          {threshold && !thresholdApplies && (
            <div className="tiny muted">The wiki's freeze threshold for this target (+{threshold.withAugury} with Augury, +{threshold.withoutAugury} without) doesn't say what Magic level it assumes, so it's only used at 99 Magic. Below that the wiki engine's formula is shown.</div>
          )}
          {thresholdApplies && threshold && prayer !== null && prayer !== Prayer.AUGURY && (
            <div className="tiny muted">The wiki gives a threshold with Augury (+{threshold.withAugury}) and with no prayer (+{threshold.withoutAugury}). {prayerName} only adds accuracy, so the no-prayer one is used.</div>
          )}
        </Panel>

        <Panel title="Every freeze spell on this target">
          <div className="results">
            <div className="spell-table">
              <div className="tr head"><span>Spell</span><span>Freeze length</span><span>Binds on hit</span><span>Freeze chance</span><span>Avg ticks / cast</span></div>
              {table.map(({
                s, c, t, avg,
              }) => (
                <div key={s.name} className={`tr${s.name === spellName ? ' on' : ''}`}>
                  <span className="spell-name">
                    <img src={wikiImage(`${s.name}.png`)} alt="" />
                    <span><a href={wikiUrl(s.source.page)} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</a><br /><span className="tiny muted">{s.book} · lvl {s.level}</span></span>
                  </span>
                  <span>{t.n} ticks{t.note ? <span className="tiny muted"> ({t.note})</span> : null}</span>
                  <span>{Math.round(bindChance(s) * 100)}%</span>
                  <span>{show(c)}</span>
                  <span style={{ fontWeight: 600, color: Math.abs(avg - bestAvg) < 0.01 ? 'var(--gold)' : undefined }}>{avg.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="tiny muted">Lengths, bind chances and levels from each spell's wiki page (linked). Grasp binds roll only on a hit; Mark of Darkness doubles them. Freeze chance uses the prayer chosen on the left ({prayerName}){salve && undead ? ' and the Salve (ei)' : ''}. Avg ticks = freeze chance × length.</div>
        </Panel>

        {rules.length > 0 && (
          <Panel title="Wiki rules for this target">
            {rules.map((r) => (
              <div key={r.kind + r.source.page} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <WikiBadge approximate={r.approximate} />
                <div className="small" style={{ color: '#c3c9d3' }}>{r.summary}</div>
                {r.kind === 'freeze-threshold' && (thresholdFor !== null ? (
                  <div className="row mono small">
                    <span style={{ color: bonus >= thresholdFor ? 'var(--teal)' : 'var(--gold)' }}>
                      {prayerName} (+{thresholdFor}): {bonus >= thresholdFor ? 'met' : `needs +${thresholdFor - bonus} more`}
                    </span>
                  </div>
                ) : (
                  <div className="tiny muted">Not used at {magicLevel} Magic: the wiki doesn't say what Magic level these values assume, so GearCalc uses them at 99 only.</div>
                ))}
                <div className="tiny muted">Source: <a href={wikiUrl(r.source.page)} target="_blank" rel="noreferrer">OSRS Wiki · {r.source.page}</a> (revision {r.source.revision})</div>
              </div>
            ))}
          </Panel>
        )}
      </section>
    </main>
  );
}
