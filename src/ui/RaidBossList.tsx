import { useState } from 'react';
import { findMonster, monsterKey } from '~/engine';
import { Panel } from '~/ui/common';

// Raid bosses as named in the wiki data (normal mode). Each entry: [name, version, label].
export const RAIDS: Record<string, [string, string, string][]> = {
  'The Fractured Archive': [
    ['Archive Guardian', 'Grounded', 'Archive Guardian'],
    ['Ezekiel', '', 'Ezekiel'],
    ['Bork', '', 'Bork'],
    ['The Smorks', '', 'Smorks'],
    ['Moia', '', 'Moia'],
    ['Dreadnoth the Jellied', '', 'Dreadnoth'],
    ['Xarth', '', 'Xarth'],
    ["Dagon'hai Elder", '', "Dagon'hai Elder"],
    ['Ocellus', 'Phase 1', 'Ocellus · Phase 1'],
    ['Ocellus', 'Phase 2', 'Ocellus · Phase 2'],
    ['Ocellus', 'Phase 3', 'Ocellus · Phase 3'],
  ],
  'Chambers of Xeric': [
    ['Tekton', 'Normal', 'Tekton'],
    ['Tekton', 'Enraged', 'Tekton · Enraged'],
    ['Ice demon', 'Normal', 'Ice demon'],
    ['Vanguard', 'Melee', 'Vanguard · Melee'],
    ['Vanguard', 'Ranged', 'Vanguard · Ranged'],
    ['Vanguard', 'Magic', 'Vanguard · Magic'],
    ['Vasa Nistirio', 'Normal', 'Vasa Nistirio'],
    ['Vespula', 'Normal', 'Vespula'],
    ['Muttadile', 'Large', 'Muttadile'],
    ['Skeletal Mystic', 'Normal', 'Skeletal Mystic'],
    ['Deathly mage', 'Normal', 'Deathly mage'],
    ['Deathly ranger', 'Normal', 'Deathly ranger'],
    ['Great Olm', 'Head (Normal)', 'Great Olm · Head'],
    ['Great Olm', 'Left claw (Normal)', 'Great Olm · Left claw'],
    ['Great Olm', 'Right claw (Normal)', 'Great Olm · Right claw'],
  ],
  'Theatre of Blood': [
    ['The Maiden of Sugadinti', 'Normal', 'Maiden'],
    ['Pestilent Bloat', 'Normal', 'Bloat'],
    ['Nylocas Vasilias', 'Normal', 'Nylocas Vasilias'],
    ['Sotetseg', 'Normal', 'Sotetseg'],
    ['Xarpus', 'Normal mode', 'Xarpus'],
    ['Verzik Vitur', 'Normal mode, Phase 1', 'Verzik · Phase 1'],
    ['Verzik Vitur', 'Normal mode, Phase 2', 'Verzik · Phase 2'],
    ['Verzik Vitur', 'Normal mode, Phase 3', 'Verzik · Phase 3'],
  ],
  'Tombs of Amascut': [
    ['Akkha', '', 'Akkha'],
    ["Akkha's Shadow", '', "Akkha's Shadow"],
    ['Ba-Ba', '', 'Ba-Ba'],
    ['Kephri', 'Shielded', 'Kephri · Shielded'],
    ['Kephri', 'Aggressive', 'Kephri · Unshielded'],
    ['Zebak', 'Normal', 'Zebak'],
    ["Elidinis' Warden", 'Active', "Elidinis' Warden"],
    ["Tumeken's Warden", 'Active', "Tumeken's Warden"],
    ["Tumeken's Warden", 'Enraged', "Tumeken's Warden · Enraged"],
  ],
};

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
