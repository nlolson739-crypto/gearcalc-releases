import { useMemo, useState, type ReactNode } from 'react';
import { getCdnImage, getWikiImage } from '@/utils';
import { equipment, monsters, monsterKey, type EquipmentPiece, type Slot } from '~/engine';
import { isModeOnlyItem } from '~/rules/wiki';
import { RAIDS } from '~/raids';
import { makeSearch } from '~/search';

export const itemImage = (e: EquipmentPiece | null | undefined) => (e?.image ? getCdnImage(`equipment/${e.image}`) : '');
export const wikiImage = (file: string) => getWikiImage(file);

export function Panel({ title, children, className = '' }: { title?: ReactNode, children: ReactNode, className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && <div className="panel-title">{title}</div>}
      {children}
    </section>
  );
}

export function IconToggle({
  label, icon, on, onClick,
}: { label: string, icon: string, on: boolean, onClick: () => void }) {
  return (
    <button type="button" className={`icon-toggle${on ? ' on' : ''}`} aria-label={label} aria-pressed={on} title={label} onClick={onClick}>
      <img src={icon} alt="" />
    </button>
  );
}

export function IconRow({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="icon-row">
      <span className="icon-row-label">{label}</span>
      <div role="group" aria-label={label} className="icon-row-items">{children}</div>
    </div>
  );
}

export function Stepper({
  value, onChange, min = 0, max = 99, label, step = 1,
}: { value: number, onChange: (v: number) => void, min?: number, max?: number, label: string, step?: number }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Lower ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span className="mono">{value}</span>
      <button type="button" aria-label={`Raise ${label}`} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T, label: ReactNode, detail?: string }[], value: T, onChange: (v: T) => void, label: string }) {
  return (
    <div role="group" aria-label={label} className="segmented">
      {options.map((o) => (
        <button type="button" key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <span>{o.label}</span>
          {o.detail && <small>{o.detail}</small>}
        </button>
      ))}
    </div>
  );
}

// One search index per slot, built the first time that slot's picker opens.
const itemSearches = new Map<string, (q: string, limit: number) => EquipmentPiece[]>();
const slotPool = (slot: Slot | 'any-weapon') => equipment
  .filter((e) => !isModeOnlyItem(e.name) && (slot === 'any-weapon' ? e.slot === 'weapon' : e.slot === slot))
  .sort((a, b) => a.name.localeCompare(b.name));
function searchItems(slot: Slot | 'any-weapon', q: string, limit: number): EquipmentPiece[] {
  let run = itemSearches.get(slot);
  if (!run) {
    run = makeSearch(slotPool(slot), (e) => ({ text: e.name, tags: e.version ? [e.version] : [] }));
    itemSearches.set(slot, run);
  }
  return run(q, limit);
}

/** Search box over the wiki equipment list for one slot. */
export function ItemPicker({
  slot, value, onChange, placeholder,
}: { slot: Slot | 'any-weapon', value: EquipmentPiece | null, onChange: (e: EquipmentPiece | null) => void, placeholder?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    if (!open) return [];
    return searchItems(slot, q, 30);
  }, [q, open, slot]);
  return (
    <div className="item-picker">
      <div className="item-picker-current">
        <span className="item-icon">{value && <img src={itemImage(value)} alt="" />}</span>
        <input
          aria-label={`${slot} item`}
          title={value ? value.name + (value.version ? ` (${value.version})` : '') : undefined}
          value={open ? q : (value?.name ?? '')}
          placeholder={placeholder ?? 'None'}
          onFocus={() => { setOpen(true); setQ(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
        />
        {value && <button type="button" className="clear" aria-label={`Clear ${slot}`} onClick={() => onChange(null)}>×</button>}
      </div>
      {open && results.length > 0 && (
        <ul className="item-picker-list" role="listbox">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" onMouseDown={() => { onChange(e); setOpen(false); }}>
                <span className="item-icon"><img src={itemImage(e)} alt="" loading="lazy" /></span>
                <span>{e.name}{e.version ? <small> ({e.version})</small> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SLOT_ART = import.meta.glob('../../vendor/osrs-dps-calc/src/public/img/slots/*.png', { eager: true, import: 'default' }) as Record<string, string>;
export const slotArt = (slot: Slot) => Object.entries(SLOT_ART).find(([p]) => p.endsWith(`/${slot}.png`))?.[1] ?? '';

/**
 * One equipment slot as an icon button, like the in-game equipment tab. Clicking it opens a search popover.
 */
export function SlotButton({
  slot, value, onChange, label, art,
}: { slot: Slot | 'any-weapon', value: EquipmentPiece | null, onChange: (e: EquipmentPiece | null) => void, label?: string, art?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    if (!open) return [];
    return searchItems(slot, q, 40);
  }, [q, open, slot]);
  const name = label ?? slot;
  return (
    <div
      className="slot"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        type="button"
        className={`slot-btn${value ? ' filled' : ''}${open ? ' open' : ''}`}
        title={value ? `${name}: ${value.name}${value.version ? ` (${value.version})` : ''}` : `${name}: empty`}
        aria-label={value ? `${name}: ${value.name}` : `${name}: empty`}
        onClick={() => { setOpen(!open); setQ(''); }}
      >
        <img src={value ? itemImage(value) : art ?? (slot === 'any-weapon' ? slotArt('weapon') : slotArt(slot))} alt="" className={value ? '' : 'ghost'} />
      </button>
      {open && (
        <div className="slot-pop" role="dialog" aria-label={`Choose ${name}`}>
          <input autoFocus placeholder={`Search ${name}…`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
          <ul className="item-picker-list static" role="listbox">
            {value && <li><button type="button" onClick={() => { onChange(null); setOpen(false); }}><span className="item-icon" /><span className="muted">Remove {value.name}</span></button></li>}
            {results.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { onChange(e); setOpen(false); }}>
                  <span className="item-icon"><img src={itemImage(e)} alt="" loading="lazy" /></span>
                  <span>{e.name}{e.version ? <small> ({e.version})</small> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Search box over the wiki monster list (each version, e.g. Ocellus phases, is its own entry). */
export function MonsterPicker({ value, onChange, extra = [] }: {
  value: string, onChange: (key: string) => void, extra?: { key: string, label: string }[],
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const all = useMemo(() => [
    ...extra,
    ...monsters.map((m) => ({ key: monsterKey(m), label: m.name + (m.version ? ` · ${m.version}` : '') })),
  ], [extra]);
  const current = all.find((m) => m.key === value)?.label ?? '';
  // typed words can be in any order and shortened; raid names ("tob", "Theatre of Blood") also find their bosses
  const search = useMemo(() => {
    const raidOf = new Map<string, string>();
    for (const [raid, bosses] of Object.entries(RAIDS)) for (const [name] of bosses) raidOf.set(name.toLowerCase(), raid);
    return makeSearch(all, (m) => {
      const raid = raidOf.get(m.label.split(' · ')[0].toLowerCase());
      return { text: m.label, tags: raid ? [raid] : [] };
    });
  }, [all]);
  const results = useMemo(() => search(q, 30), [q, search]);
  return (
    <div className="item-picker">
      <div className="item-picker-current">
        <input
          aria-label="Monster"
          value={open ? q : current}
          onFocus={() => { setOpen(true); setQ(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {open && (
        <ul className="item-picker-list" role="listbox">
          {results.map((m) => (
            <li key={m.key}><button type="button" onMouseDown={() => { onChange(m.key); setOpen(false); }}>{m.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const pct = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
export const fmtTime = (sec: number | undefined) => {
  if (sec === undefined || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function WikiBadge({ approximate }: { approximate?: boolean }) {
  return <span className="wiki-badge">{approximate ? 'WIKI RULE · APPROX.' : 'WIKI RULE'}</span>;
}

/**
 * A number box for typed values (levels, bonuses). It can be empty or "-" while typing; the last valid number is kept
 * and shown again when the box loses focus.
 */
export function NumberField({
  label, value, min, max, onChange,
}: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <label className="spread number-field">
      <span className="small" style={{ color: 'var(--soft)' }}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        aria-label={label}
        value={focused ? text : String(value)}
        onChange={(e) => {
          setText(e.target.value);
          const v = Math.trunc(Number(e.target.value));
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        onFocus={(e) => { setFocused(true); setText(String(value)); e.target.select(); }}
        onBlur={() => setFocused(false)}
      />
    </label>
  );
}
