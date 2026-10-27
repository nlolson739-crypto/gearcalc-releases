import { useMemo } from 'react';
import specArt from '@/public/img/misc/power.webp';
import { PotionMap } from '@/utils';
import { PrayerMap } from '@/enums/Prayer';
import { getCdnImage } from '@/utils';
import {
  Potion, Prayer, SLOTS, scaledMonster, stylesFor, type Slot,
} from '~/engine';
import { runSetup, runSpec, thrallDps } from '~/calc';
import {
  baseMonster, EXTRA_MONSTERS, gearOf, itemById, SETUP_COLORS, targetMonster, type AppState, type Buffs, type Setup,
} from '~/state';
import { THRALLS, THRALL_SOURCE, wikiUrl } from '~/rules/wiki';
import {
  fmtTime, IconRow, IconToggle, MonsterPicker, Panel, pct, SlotButton, Stepper, wikiImage,
} from '~/ui/common';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };

const PRAYERS: Prayer[] = [Prayer.PIETY, Prayer.CHIVALRY, Prayer.RIGOUR, Prayer.AUGURY];
const POTIONS: Potion[] = [Potion.SUPER_COMBAT, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS, Potion.RANGING, Potion.SATURATED_HEART, Potion.FORGOTTEN_BREW];
const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head', cape: 'Cape', neck: 'Neck', ammo: 'Ammo', weapon: 'Weapon', body: 'Body', shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring',
};

export default function DpsScreen({ state, setState }: Props) {
  const monster = targetMonster(state);
  const after = scaledMonster(monster);
  const base = baseMonster(state.target);
  const { buffs } = state;
  const setBuffs = (f: (b: Buffs) => Buffs) => setState((s) => ({ ...s, buffs: f(s.buffs) }));
  const setSetup = (id: string, f: (x: Setup) => Setup) => setState((s) => ({ ...s, setups: s.setups.map((x) => (x.id === id ? f(x) : x)) }));

  const results = useMemo(() => state.setups.map((s) => runSetup(s, buffs, monster)), [state, monster]);
  const specs = useMemo(() => state.setups.map((s) => runSpec(s, buffs, monster, state)), [state, monster]);
  const deltas = useMemo(() => {
    const rows: { label: string, values: number[] }[] = [];
    const diff = (b: Buffs) => state.setups.map((s, i) => runSetup(s, b, monster).totalDps - results[i].totalDps);
    if (buffs.prayer !== null) rows.push({ label: `Without ${PrayerMap[buffs.prayer].name}`, values: diff({ ...buffs, prayer: null }) });
    for (const p of buffs.potions) rows.push({ label: `Without ${PotionMap[p].name}`, values: diff({ ...buffs, potions: buffs.potions.filter((x) => x !== p) }) });
    if (buffs.thrall) rows.push({ label: 'Without thrall', values: diff({ ...buffs, thrall: 0 }) });
    if (buffs.onSlayerTask) rows.push({ label: 'Off Slayer task', values: diff({ ...buffs, onSlayerTask: false }) });
    return rows;
  }, [state, monster, results]);

  const cols = `170px repeat(${state.setups.length}, minmax(0, 1fr))`;
  const bestOf = (vals: (number | undefined)[], low = false) => {
    const nums = vals.filter((v): v is number => v !== undefined && Number.isFinite(v));
    if (nums.length < 2 || nums.every((n) => n === nums[0])) return undefined; // nothing to pick between
    return low ? Math.min(...nums) : Math.max(...nums);
  };
  const row = (label: string, vals: (number | undefined)[], fmt: (v: number) => string, low = false) => {
    const best = bestOf(vals, low);
    return (
      <div className="results-row" style={{ gridTemplateColumns: cols }} key={label}>
        <span>{label}</span>
        {vals.map((v, i) => <span key={i} className={`val${v !== undefined && v === best && state.setups.length > 1 ? ' best' : ''}`}>{v === undefined ? '—' : fmt(v)}</span>)}
      </div>
    );
  };

  const addSetup = () => setState((s) => {
    if (s.setups.length >= 4) return s;
    const src = s.setups[s.setups.length - 1];
    const id = Math.random().toString(36).slice(2, 7);
    return { ...s, setups: [...s.setups, { ...src, id, name: `Setup ${s.setups.length + 1}`, color: SETUP_COLORS[s.setups.length] }] };
  });

  return (
    <main className="page">
      <aside className="side" aria-label="Target and buffs">
        <Panel title="Target">
          <MonsterPicker value={state.target} onChange={(k) => setState((s) => ({ ...s, target: k }))} extra={EXTRA_MONSTERS} />
          <div className="row">
            {base.image && <img src={getCdnImage(`monsters/${base.image}`)} alt="" style={{ maxHeight: 64, maxWidth: 80 }} />}
            <div className="small muted">{base.attributes.length ? base.attributes.join(', ') : 'No special attributes'}</div>
          </div>
          <div className="stat-grid">
            <div className="stat"><span>Hitpoints</span><span>{base.skills.hp}</span></div>
            <div className="stat"><span>Defence</span><span>{after.skills.def}{after.skills.def !== base.skills.def ? ` / ${base.skills.def}` : ''}</span></div>
            <div className="stat"><span>Magic</span><span>{after.skills.magic}</span></div>
            <div className="stat"><span>Stab def</span><span>+{base.defensive.stab}</span></div>
            <div className="stat"><span>Slash def</span><span>+{base.defensive.slash}</span></div>
            <div className="stat"><span>Crush def</span><span>+{base.defensive.crush}</span></div>
            <div className="stat"><span>Magic def</span><span>+{base.defensive.magic}</span></div>
            <div className="stat"><span>Ranged def</span><span>+{base.defensive.standard}</span></div>
            <div className="stat"><span>Elder mauls</span><span><Stepper label="elder maul specs" value={state.reductions.elderMaul} max={6} onChange={(v) => setState((s) => ({ ...s, reductions: { ...s.reductions, elderMaul: v } }))} /></span></div>
          </div>
          <a href="#defence" className="small">Other defence reductions</a>
        </Panel>

        <Panel title="Buffs · all setups">
          <IconRow label="Prayer">
            {PRAYERS.map((p) => (
              <IconToggle key={p} label={PrayerMap[p].name} icon={PrayerMap[p].image as unknown as string} on={buffs.prayer === p} onClick={() => setBuffs((b) => ({ ...b, prayer: b.prayer === p ? null : p }))} />
            ))}
          </IconRow>
          <IconRow label="Potions">
            {POTIONS.map((p) => (
              <IconToggle key={p} label={PotionMap[p].name} icon={PotionMap[p].image as unknown as string} on={buffs.potions.includes(p)} onClick={() => setBuffs((b) => ({ ...b, potions: b.potions.includes(p) ? b.potions.filter((x) => x !== p) : [...b.potions, p] }))} />
            ))}
          </IconRow>
          <IconRow label="Thrall">
            {THRALLS.map((t) => (
              <IconToggle key={t.tier} label={`${t.name} thrall (0–${t.maxHit}, ${t.dps} DPS)`} icon={wikiImage(t.icon)} on={buffs.thrall === t.tier} onClick={() => setBuffs((b) => ({ ...b, thrall: b.thrall === t.tier ? 0 : t.tier }))} />
            ))}
          </IconRow>
          <IconRow label="Other">
            <IconToggle label="On Slayer task" icon={wikiImage('Slayer helmet (i).png')} on={buffs.onSlayerTask} onClick={() => setBuffs((b) => ({ ...b, onSlayerTask: !b.onSlayerTask }))} />
            <IconToggle label="Mark of Darkness" icon={wikiImage('Mark of Darkness.png')} on={buffs.markOfDarkness} onClick={() => setBuffs((b) => ({ ...b, markOfDarkness: !b.markOfDarkness }))} />
            <IconToggle label="Charge" icon={wikiImage('Charge.png')} on={buffs.charge} onClick={() => setBuffs((b) => ({ ...b, charge: !b.charge }))} />
          </IconRow>
          <div className="small muted">
            {buffs.thrall ? <>Thrall adds {thrallDps(buffs.thrall)} DPS (always hits, <a href={wikiUrl(THRALL_SOURCE.page)} target="_blank" rel="noreferrer">wiki</a>). </> : null}
            Click an icon to turn it on, again to turn it off.
          </div>
        </Panel>
      </aside>

      <section className="main" aria-label="Setups and results">
        <div className="spread">
          <h1>Compare setups</h1>
          <button type="button" className="btn primary" onClick={addSetup} disabled={state.setups.length >= 4}>Add setup</button>
        </div>

        <div className="setups">
          {state.setups.map((s) => {
            const gear = gearOf(s);
            // Manual casting is only worth listing for weapons with no other way to attack (or no weapon).
            const all = stylesFor(gear.weapon);
            const styles = all.length > 1 ? all.filter((x) => x.stance !== 'Manual Cast') : all;
            const style = styles.find((x) => x.name === s.style) ?? styles[0];
            return (
              <Panel key={s.id}>
                <div className="setup-head">
                  <span className="swatch" style={{ background: s.color }} />
                  <input type="text" aria-label="Setup name" value={s.name} onChange={(e) => setSetup(s.id, (x) => ({ ...x, name: e.target.value }))} />
                  {state.setups.length > 1 && (
                    <button type="button" className="btn" aria-label={`Remove ${s.name}`} onClick={() => setState((st) => ({ ...st, setups: st.setups.filter((x) => x.id !== s.id) }))}>×</button>
                  )}
                </div>
                <div className="setup-body">
                  <div className="equip-grid">
                    {SLOTS.map((slot) => (
                      <div key={slot} style={{ gridArea: slot }}>
                        <SlotButton slot={slot} label={SLOT_LABEL[slot]} value={gear[slot] ?? null} onChange={(e) => setSetup(s.id, (x) => ({ ...x, gear: { ...x.gear, [slot]: e?.id } }))} />
                      </div>
                    ))}
                    <div style={{ gridArea: 'spec' }} className="spec-slot">
                      <SlotButton slot="any-weapon" label="Spec weapon" value={itemById(s.specWeapon)} onChange={(e) => setSetup(s.id, (x) => ({ ...x, specWeapon: e?.id }))} art={specArt} />
                      <span>Spec</span>
                    </div>
                  </div>
                  <div role="group" aria-label="Attack style" className="style-list">
                    {styles.map((x) => (
                      <button type="button" key={x.name + x.stance} className={x === style ? 'on' : ''} aria-pressed={x === style} onClick={() => setSetup(s.id, (y) => ({ ...y, style: x.name }))}>
                        <span>{x.displayNameOverride ?? x.name}</span>
                        <small>{x.type ? x.type[0].toUpperCase() + x.type.slice(1) : 'None'} · {x.stance}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <Panel>
          <div className="results">
            <div className="results-grid">
              <div className="results-row head" style={{ gridTemplateColumns: cols }}>
                <span>Result</span>
                {state.setups.map((s) => <span key={s.id} className="row"><span className="swatch" style={{ background: s.color }} />{s.name}</span>)}
              </div>
              {row('Max hit', results.map((r) => r.maxHit), (v) => String(v))}
              {row('Accuracy', results.map((r) => r.accuracy), pct)}
              {row('DPS', results.map((r) => r.totalDps), (v) => v.toFixed(2))}
              {row('Time to kill', results.map((r) => r.totalTtk), fmtTime, true)}
              {row('Attack speed', results.map((r) => r.attackSpeed), (v) => `${v} ticks`, true)}
              {row('Spec hit chance', specs.map((x) => x?.accuracy), pct)}
              {row('Spec max hit', specs.map((x) => x?.maxHit), (v) => String(v))}
              {row('Defence after spec', specs.map((x) => (x?.defenceAfter ?? undefined)), (v) => String(v), true)}
              {deltas.length > 0 && <div className="section-label">DPS WITHOUT EACH BUFF</div>}
              {deltas.map((d) => (
                <div className="results-row delta" style={{ gridTemplateColumns: cols }} key={d.label}>
                  <span>{d.label}</span>
                  {d.values.map((v, i) => <span key={i} className="val" style={{ color: v < -0.005 ? 'var(--loss)' : 'var(--muted)' }}>{v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(2)}</span>)}
                </div>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Calculated by the OSRS Wiki DPS engine. Gold marks the best setup in each row. DPS and time to kill include the thrall.
            Defence after spec assumes the spec lands (Bandos godsword: an average hit).
          </p>
        </Panel>
      </section>
    </main>
  );
}
