import { useMemo, useRef, useState } from 'react';
import { equipmentCount, parseBankMemory, type Bank } from '~/bank';
import type { AppState } from '~/state';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };

const IMPORT = '__import';

/** Chooses the gear the best-setup search may use: every item, or one of the banks imported from Bank Memory. */
export default function BankPicker({ state, setState }: Props) {
  // null: closed; '' : a new bank; otherwise the id of the bank being re-imported
  const [importing, setImporting] = useState<string | null>(null);
  const active = state.banks.find((b) => b.id === state.activeBank) ?? null;
  const counts = useMemo(() => new Map(state.banks.map((b) => [b.id, equipmentCount(b)])), [state.banks]);

  const choose = (v: string) => {
    if (v === IMPORT) { setImporting(''); return; }
    setState((s) => ({ ...s, activeBank: v || null }));
  };
  const rename = () => {
    if (!active) return;
    const name = window.prompt('Bank name', active.name)?.trim();
    if (name) setState((s) => ({ ...s, banks: s.banks.map((b) => (b.id === active.id ? { ...b, name } : b)) }));
  };
  const remove = () => {
    if (!active || !window.confirm(`Remove the bank "${active.name}" from GearCalc?`)) return;
    setState((s) => ({ ...s, banks: s.banks.filter((b) => b.id !== active.id), activeBank: null }));
  };

  return (
    <>
      <select className="raid-select" aria-label="Gear to use" value={state.activeBank ?? ''} onChange={(e) => choose(e.target.value)}>
        <option value="">All gear in the game</option>
        {state.banks.length > 0 && (
          <optgroup label="My banks">
            {state.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </optgroup>
        )}
        <option value={IMPORT}>Import a bank…</option>
      </select>
      {active && (
        <div className="row tiny muted" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span title={`Imported ${new Date(active.imported).toLocaleString()}`}>{counts.get(active.id) ?? 0} gear items</span>
          <button type="button" className="link-btn" onClick={() => setImporting(active.id)}>Update</button>
          <button type="button" className="link-btn" onClick={rename}>Rename</button>
          <button type="button" className="link-btn" onClick={remove}>Remove</button>
        </div>
      )}
      {importing !== null && (
        <ImportDialog
          bank={state.banks.find((b) => b.id === importing) ?? null}
          defaultName={`Bank ${state.banks.length + 1}`}
          onClose={() => setImporting(null)}
          onSave={(bank) => {
            setState((s) => ({
              ...s,
              banks: s.banks.some((b) => b.id === bank.id) ? s.banks.map((b) => (b.id === bank.id ? bank : b)) : [...s.banks, bank],
              activeBank: bank.id,
            }));
            setImporting(null);
          }}
        />
      )}
    </>
  );
}

function ImportDialog({ bank, defaultName, onClose, onSave }: {
  bank: Bank | null, defaultName: string, onClose: () => void, onSave: (b: Bank) => void,
}) {
  const [name, setName] = useState(bank?.name ?? defaultName);
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseBankMemory(text) : null), [text]);
  const preview: Bank | null = parsed && {
    id: bank?.id ?? `bank-${Date.now().toString(36)}`, name: name.trim() || defaultName, items: parsed.items, imported: Date.now(),
  };
  const gear = useMemo(() => (preview ? equipmentCount(preview) : 0), [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const paste = async () => {
    // In the desktop app the launcher reads the clipboard: WebView2 refuses navigator.clipboard there.
    let clip: string | null = null;
    try {
      const api = (window as unknown as { pywebview?: { api?: { read_clipboard?: () => Promise<string | null> } } }).pywebview?.api;
      if (typeof api?.read_clipboard === 'function') clip = await api.read_clipboard();
      else clip = await navigator.clipboard.readText();
    } catch { /* fall through to the hint */ }
    if (clip === null) {
      setHint('GearCalc couldn\'t read the clipboard. Click in the box below and press Ctrl+V.');
    } else if (!clip.trim()) {
      setHint('The clipboard is empty. In Bank Memory, right-click your bank and choose Copy item data to clipboard first.');
    } else {
      setText(clip);
      setHint('');
    }
  };
  const openFile = async (f: File | undefined) => {
    if (f) setText(await f.text());
  };

  return (
    <div className="update-backdrop" role="dialog" aria-modal="true" aria-label="Import a bank">
      <div className="update-card" style={{ width: 480 }}>
        <h2>{bank ? `Update ${bank.name}` : 'Import a bank'}</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>In RuneLite, install the <b>Bank Memory</b> plugin from the Plugin Hub and open your bank once in game.</li>
          <li>Open the Bank Memory side panel. On <b>Current bank</b>, right-click the item list; on <b>Saved banks</b>, right-click a save.</li>
          <li>Choose <b>Copy item data to clipboard</b>, then paste it here.</li>
        </ol>
        <div className="tiny muted">Bank Memory only records the bank, so bank the gear you're wearing before you copy it.</div>
        <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main, Ironman…" />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={paste}>Paste from clipboard</button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>Open a file…</button>
          <input ref={file} type="file" accept=".tsv,.txt,.csv,text/plain" hidden onChange={(e) => openFile(e.target.files?.[0])} />
        </div>
        {hint && <div className="tiny" style={{ color: 'var(--gold)' }}>{hint}</div>}
        <textarea
          className="bank-text"
          aria-label="Bank Memory item data"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Item id\tItem name\tItem quantity\n4151\tAbyssal whip\t1\n…'}
          spellCheck={false}
        />
        <div className="small" aria-live="polite">
          {!text.trim() ? <span className="muted">Nothing pasted yet.</span>
            : parsed ? <span>{parsed.items.length.toLocaleString()} items found, {gear} of them gear the calculator knows.</span>
              : <span style={{ color: 'var(--loss)' }}>That doesn't look like Bank Memory item data.</span>}
        </div>
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!preview} onClick={() => preview && onSave(preview)}>{bank ? 'Update bank' : 'Import bank'}</button>
        </div>
      </div>
    </div>
  );
}
