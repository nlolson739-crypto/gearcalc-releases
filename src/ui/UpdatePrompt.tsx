import { useEffect, useRef, useState } from 'react';

// The desktop launcher (app/launcher.py) exposes the updater as window.pywebview.api. In a plain browser it's absent
// and this component never shows.
interface UpdateInfo { version: string, current: string, mb: number, patch: boolean, canWrite: boolean, page: string }
interface Progress { stage: 'idle' | 'downloading' | 'ready' | 'failed', done: number, total: number, error: string }
interface Api {
  check_update(): Promise<UpdateInfo | null>;
  start_update(): Promise<boolean>;
  update_progress(): Promise<Progress>;
  cancel_update(): Promise<boolean>;
  install_update(): Promise<boolean>;
}
const api = (): Api | undefined => (window as unknown as { pywebview?: { api?: Api } }).pywebview?.api;

type View = 'hidden' | 'ask' | 'downloading' | 'ready' | 'failed';

export default function UpdatePrompt() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [view, setView] = useState<View>('hidden');
  const [prog, setProg] = useState<Progress | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    const check = () => {
      const a = api();
      if (typeof a?.check_update !== 'function') return;
      a.check_update().then((i) => { if (i) { setInfo(i); setView('ask'); } }).catch(() => {});
    };
    // pywebview creates window.pywebview.api before it adds the methods; they're only usable after
    // 'pywebviewready' (or right away if that has already happened).
    if (typeof api()?.check_update === 'function') check();
    else window.addEventListener('pywebviewready', check, { once: true });
    return () => window.clearInterval(timer.current);
  }, []);

  const start = async () => {
    const a = api();
    if (!a) return;
    setView('downloading');
    setProg(null);
    await a.start_update();
    window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      const p = await a.update_progress();
      setProg(p);
      if (p.stage === 'ready') {
        window.clearInterval(timer.current);
        setView('ready');
        a.install_update(); // GearCalc closes, the files are swapped, and it starts again
      } else if (p.stage === 'failed') {
        window.clearInterval(timer.current);
        setView('failed');
      } else if (p.stage === 'idle') {
        window.clearInterval(timer.current);
        setView('ask');
      }
    }, 250);
  };

  if (view === 'hidden' || !info) return null;
  const mb = (n: number) => (n / 1e6).toFixed(1);
  const pctDone = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  return (
    <div className="update-backdrop" role="dialog" aria-modal="true" aria-labelledby="upd-title">
      <div className="update-card">
        {view === 'ask' && (
          <>
            <h2 id="upd-title">Update available</h2>
            <p>GearCalc v{info.version} is available.</p>
            <div className="row">
              <span className="pill">Current Ver: {info.current}</span>
              <span className="pill gold">New Ver: {info.version}</span>
            </div>
            <p className="small muted">Update size: {info.mb} MB{info.patch ? ' (only the changed files)' : ''}</p>
            {info.canWrite
              ? (
                <div className="row end">
                  <button type="button" className="btn" onClick={() => setView('hidden')}>Later</button>
                  <button type="button" className="btn primary" onClick={start}>Update now</button>
                </div>
              )
              : (
                <>
                  <p className="small">GearCalc's folder can't be written to, so it can't update itself here. Download the new version from <a href={info.page} target="_blank" rel="noreferrer">the releases page</a>.</p>
                  <div className="row end"><button type="button" className="btn" onClick={() => setView('hidden')}>Close</button></div>
                </>
              )}
          </>
        )}
        {view === 'downloading' && (
          <>
            <h2 id="upd-title">Updating</h2>
            <div className="progress big"><div style={{ width: `${pctDone}%` }} /></div>
            <div className="spread small muted">
              <span>{prog && prog.total ? `${mb(prog.done)} of ${mb(prog.total)} MB` : 'Starting…'}</span>
              <span>{pctDone}%</span>
            </div>
            <div className="row end"><button type="button" className="btn" onClick={() => api()?.cancel_update()}>Cancel</button></div>
          </>
        )}
        {view === 'ready' && (
          <>
            <h2 id="upd-title">Update ready</h2>
            <p>Verifying Install. This only takes a moment.</p>
            <div className="progress big"><div style={{ width: '100%' }} /></div>
          </>
        )}
        {view === 'failed' && (
          <>
            <h2 id="upd-title">Update didn't finish</h2>
            <p>Couldn't reach GitHub. Check your internet connection and try again.</p>
            <div className="row end">
              <button type="button" className="btn" onClick={() => setView('hidden')}>Later</button>
              <button type="button" className="btn primary" onClick={start}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
