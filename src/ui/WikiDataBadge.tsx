import { useEffect, useState } from 'react';
import { wikiDataStatus } from '~/data/wikiData';
import vendorLock from '../../vendor.lock?raw';

// Top-right status: how current the wiki data is. In the desktop app it also asks the launcher to look for newer
// data (at most once a day, see app/wikidata.py) and offers a reload when some arrived.
interface RefreshResult { checked: string | null, changed: string[], error: string | null, skipped?: boolean }
interface Api { refresh_wiki_data(): Promise<RefreshResult> }
const api = (): Api | undefined => (window as unknown as { pywebview?: { api?: Api } }).pywebview?.api;

declare const __ENGINE_DATE__: string | null;
const ENGINE_DATE = typeof __ENGINE_DATE__ === 'string' ? __ENGINE_DATE__ : null;

const day = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null);
const dayTime = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null);

export default function WikiDataBadge() {
  const status = wikiDataStatus();
  const [checked, setChecked] = useState(status.checked);
  const [arrived, setArrived] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const run = () => {
      const a = api();
      if (typeof a?.refresh_wiki_data !== 'function') return;
      a.refresh_wiki_data().then((r) => {
        if (r.checked) setChecked(r.checked);
        if (r.changed.length) setArrived(true);
        setFailed(!!r.error);
      }).catch(() => setFailed(true));
    };
    if (typeof api()?.refresh_wiki_data === 'function') run();
    else window.addEventListener('pywebviewready', run, { once: true });
  }, []);

  const date = day(status.dataDate);
  const waiting = status.rejected.length > 0;
  const lines = [
    `Monster and gear stats from the OSRS Wiki DPS calculator, last changed by the wiki on ${date ?? 'an unknown date'}`
      + ` (${status.source === 'downloaded' ? 'downloaded from the wiki' : 'built into this version'}).`,
    checked ? `Checked the wiki for newer data: ${dayTime(checked)}.` : 'GearCalc checks the wiki for newer data once a day.',
    failed ? 'The last check could not reach the wiki; it will try again later.' : '',
    waiting ? `Newer wiki data (${status.rejected.join(', ')}) needs a GearCalc update to read it.` : '',
    `Calculator engine: ${vendorLock.trim().slice(0, 7)}${ENGINE_DATE ? ` (${day(ENGINE_DATE)})` : ''}.`,
  ].filter(Boolean);

  return (
    <div className="data-status">
      <span className="data-status-text" title={lines.join('\n')}>
        <span className={`dot${waiting || failed ? ' warn' : ''}`} aria-hidden="true" />
        <span>{date ? `Wiki data from ${date}` : 'Wiki data built in'}</span>
        <span className="sr-only">. {lines.join(' ')}</span>
      </span>
      {arrived && (
        <button type="button" className="btn small" onClick={() => window.location.reload()} title="The wiki has newer monster or gear data. Reload to use it (your setups are kept).">
          New wiki data · Reload
        </button>
      )}
    </div>
  );
}
