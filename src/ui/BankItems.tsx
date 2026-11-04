import { useMemo, useState } from 'react';
import {
  itemKey, onePerName, ownedChecker, type Bank,
} from '~/bank';
import { equipment, SLOTS, type EquipmentPiece, type Slot } from '~/engine';
import { makeSearch } from '~/search';
import { itemImage } from '~/ui/common';

const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head', cape: 'Cape', neck: 'Neck', ammo: 'Ammo', weapon: 'Weapon', body: 'Body', shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring',
};
const bySlotThenName = (a: EquipmentPiece, b: EquipmentPiece) => SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot)
  || a.name.localeCompare(b.name);

/**
 * The bank's gear as a dropdown list: each item can be switched off so the best-setup search leaves it out, and gear
 * the bank doesn't hold can be added (to see what buying it would do). Saved with the bank.
 */
export default function BankItems({ bank, searchable, onChange }: {
  bank: Bank,
  searchable: (e: EquipmentPiece) => boolean,
  onChange: (patch: Pick<Bank, 'excluded' | 'added'>) => void,
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [addQ, setAddQ] = useState('');

  const owned = useMemo(() => ownedChecker(bank), [bank.items]); // eslint-disable-line react-hooks/exhaustive-deps
  // one row per item name the search could use: the bank's gear, then the gear it doesn't hold (for adding)
  const gear = useMemo(() => onePerName(equipment.filter((e) => searchable(e) && owned(e))).sort(bySlotThenName), [owned, searchable]);
  const notOwned = useMemo(() => onePerName(equipment.filter((e) => searchable(e) && !owned(e))).sort(bySlotThenName), [owned, searchable]);
  const addSearch = useMemo(() => makeSearch(notOwned, (e) => ({ text: e.name, tags: [SLOT_LABEL[e.slot as Slot] ?? ''] })), [notOwned]);

  const off = new Set(bank.excluded ?? []);
  const addedKeys = new Set(bank.added ?? []);
  const added = notOwned.filter((e) => addedKeys.has(itemKey(e)));
  const used = gear.filter((e) => !off.has(itemKey(e))).length;

  const filterSearch = useMemo(() => makeSearch(gear, (e) => ({ text: e.name, tags: [SLOT_LABEL[e.slot as Slot] ?? ''] })), [gear]);
  const shown = filter.trim() ? filterSearch(filter, gear.length).sort(bySlotThenName) : gear;
  const addResults = open && addQ.trim() ? addSearch(addQ, 12).filter((e) => !addedKeys.has(itemKey(e))) : [];

  const setOff = (keys: string[], isOff: boolean) => {
    const next = new Set(off);
    for (const k of keys) { if (isOff) next.add(k); else next.delete(k); }
    onChange({ excluded: [...next], added: bank.added });
  };
  const setAdded = (k: string, on: boolean) => {
    const next = new Set(addedKeys);
    if (on) next.add(k); else next.delete(k);
    onChange({ excluded: bank.excluded, added: [...next] });
  };

  const summary = `${used} of ${gear.length} items used${added.length ? ` + ${added.length} added` : ''}`;

  return (
    <div className="bank-items">
      <button type="button" className={`btn small bank-items-toggle${open ? ' open' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Items in the search</span>
        <span className="tiny muted">{summary}</span>
        <span aria-hidden="true" className="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="bank-items-panel">
          <input type="text" aria-label="Filter your gear" placeholder="Filter your gear…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="bank-row">
            <span className="tiny muted">{filter.trim() ? `${shown.length} shown` : 'Untick what the search should leave out.'}</span>
            <span className="bank-row-actions">
              <button type="button" className="btn small" onClick={() => setOff(shown.map(itemKey), false)}>Use all</button>
              <button type="button" className="btn small" onClick={() => setOff(shown.map(itemKey), true)}>Use none</button>
            </span>
          </div>
          <div className="bank-item-list" role="group" aria-label="Your gear">
            {shown.length === 0 && <span className="tiny muted">No gear matches.</span>}
            {shown.map((e, i) => {
              const k = itemKey(e);
              const on = !off.has(k);
              return (
                <div key={k}>
                  {(i === 0 || shown[i - 1].slot !== e.slot) && <div className="bank-item-group">{SLOT_LABEL[e.slot as Slot] ?? e.slot}</div>}
                  <label className={`bank-item${on ? '' : ' off'}`} title={on ? `${e.name}: used` : `${e.name}: left out`}>
                    <input type="checkbox" checked={on} onChange={() => setOff([k], on)} />
                    <img src={itemImage(e)} alt="" loading="lazy" />
                    <span>{e.name}</span>
                  </label>
                </div>
              );
            })}
          </div>

          <div className="bank-item-group">Added (not in this bank)</div>
          {added.length > 0 && (
            <div className="bank-item-list short" role="group" aria-label="Added gear">
              {added.map((e) => (
                <div key={itemKey(e)} className="bank-item">
                  <img src={itemImage(e)} alt="" loading="lazy" />
                  <span>{e.name}<small className="muted"> · {SLOT_LABEL[e.slot as Slot] ?? e.slot}</small></span>
                  <button type="button" className="btn small" aria-label={`Remove ${e.name} from the search`} onClick={() => setAdded(itemKey(e), false)}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="item-picker">
            <input type="text" aria-label="Add gear you don't have" placeholder="Add gear you don't have…" value={addQ} onChange={(e) => setAddQ(e.target.value)} />
            {addResults.length > 0 && (
              <ul className="item-picker-list" role="listbox">
                {addResults.map((e) => (
                  <li key={itemKey(e)}>
                    <button type="button" onClick={() => { setAdded(itemKey(e), true); setAddQ(''); }}>
                      <span className="item-icon"><img src={itemImage(e)} alt="" loading="lazy" /></span>
                      <span>{e.name}<small className="muted"> · {SLOT_LABEL[e.slot as Slot] ?? e.slot}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {added.length === 0 && <span className="tiny muted">Add gear you're thinking of getting to see what it would change.</span>}
        </div>
      )}
    </div>
  );
}
