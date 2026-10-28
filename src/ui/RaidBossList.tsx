import { useState } from 'react';
import { findMonster, monsterKey } from '~/engine';
import { Panel } from '~/ui/common';
import { RAIDS } from '~/raids';

export { RAIDS };


const STORE = 'gearcalc-raid';
const loadRaid = () => {
  try { const r = localStorage.getItem(STORE); if (r && r in RAIDS) return r; } catch { /* ignore */ }
  return 'The Fractured Archive';
};

/** Raid picker plus that raid's bosses; picking a boss sets it as the target. */
export default function RaidBossList({ target, onPick }: { target: string, onPick: (key: string) => void }) {
  const [raid, setRaid] = useState(loadRaid);
  const choose = (r: string) => {
    setRaid(r);
    try { localStorage.setItem(STORE, r); } catch { /* ignore */ }
  };
  return (
    <Panel>
      <select className="raid-select" aria-label="Raid" value={raid} onChange={(e) => choose(e.target.value)}>
        {Object.keys(RAIDS).map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="boss-list">
        {RAIDS[raid].map(([name, version, label]) => {
          const mon = findMonster(name, version);
          if (!mon) return null;
          const key = monsterKey(mon);
          return (
            <button type="button" key={key} className={key === target ? 'on' : ''} onClick={() => onPick(key)}>
              <span>{label}</span>
              <span className="mono small muted">{mon.skills.def}</span>
            </button>
          );
        })}
      </div>
      {raid !== 'The Fractured Archive' && (
        <div className="tiny muted">Normal mode, solo raid scaling. Other modes and versions are in the target search.</div>
      )}
    </Panel>
  );
}
