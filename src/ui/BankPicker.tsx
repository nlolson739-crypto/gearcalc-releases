import { useMemo, useRef, useState } from 'react';
import { equipmentCount, parseBankMemory, type Bank } from '~/bank';
import type { AppState } from '~/state';

type Props = { state: AppState, setState: (f: (s: AppState) => AppState) => void };

const IMPORT = '__import';
const MANAGE = '__manage';

const norm = (n: string) => n.trim().toLowerCase();
/** Bank names must be unique (ignoring case and spaces at the ends), so the dropdown never shows two the same. */
export const nameTaken = (banks: Bank[], name: string, exceptId?: string) => banks.some((b) => b.id !== exceptId && norm(b.name) === norm(name));
const freeName = (banks: Bank[]) => {
  let n = banks.length + 1;
  while (nameTaken(banks, `Bank ${n}`)) n++;
  return `Bank ${n}`;
};
/** What's wrong with a bank name, or '' when it can be used. */
const nameProblem = (banks: Bank[], name: string, exceptId?: string) => {
  if (!name.trim()) return 'Give the bank a name.';
  if (nameTaken(banks, name, exceptId)) return `You already have a bank called "${name.trim()}". Pick another name.`;
  return '';
};

/** Chooses the gear the best-setup search may use: every item, or one of the banks imported from Bank Memory. */
export default function BankPicker({ state, setState }: Props) {
  // null: closed; '' : a new bank; otherwise the id of the bank being re-imported
  const [importing, setImporting] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const active = state.banks.find((b) => b.id === state.activeBank) ?? null;
  const counts = useMemo(() => new Map(state.banks.map((b) => [b.id, equipmentCount(b)])), [state.banks]);

  const choose = (v: string) => {
    setConfirmRemove(false);
    if (v === IMPORT) { setImporting(''); return; }
    if (v === MANAGE) { setManaging(true); return; }
    setState((s) => ({ ...s, activeBank: v || null }));
  };
  const removeBank = (id: string) => setState((s) => ({
    ...s, banks: s.banks.filter((b) => b.id !== id), activeBank: s.activeBank === id ? null : s.activeBank,
  }));

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
        {state.banks.length > 0 && <option value={MANAGE}>Manage banks (rename, remove)…</option>}
      </select>
      {active && !confirmRemove && (
        <div className="bank-row">
          <span className="tiny muted" title={`Imported ${new Date(active.imported).toLocaleString()}`}>{counts.get(active.id) ?? 0} gear items</span>
          <span className="bank-row-actions">
            <button type="button" className="btn small" onClick={() => setImporting(active.id)}>Update</button>
            <button type="button" className="btn small" onClick={() => setManaging(true)}>Rename</button>
            <button type="button" className="btn small danger" onClick={() => setConfirmRemove(true)}>Remove</button>
          </span>
        </div>
      )}
      {active && confirmRemove && (
        <div className="bank-row confirm" role="alert">
          <span className="small">Remove <b>{active.name}</b> from GearCalc?</span>
          <span className="bank-row-actions">
            <button type="button" className="btn small danger" onClick={() => { removeBank(active.id); setConfirmRemove(false); }}>Remove</button>
            <button type="button" className="btn small" onClick={() => setConfirmRemove(false)}>Keep</button>
          </span>
        </div>
      )}
      {managing && (
        <ManageDialog
          banks={state.banks}
          counts={counts}
          onRemove={removeBank}
          onRename={(names) => setState((s) => ({ ...s, banks: s.banks.map((b) => ({ ...b, name: (names[b.id] ?? b.name).trim() })) }))}
          onClose={() => setManaging(false)}
        />
      )}
      {importing !== null && (
        <ImportDialog
          bank={state.banks.find((b) => b.id === importing) ?? null}
          banks={state.banks}
          defaultName={freeName(state.banks)}
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

function ManageDialog({ banks, counts, onRemove, onRename, onClose }: {
  banks: Bank[],
  counts: Map<string, number>,
  onRemove: (id: string) => void,
  onRename: (names: Record<string, string>) => void,
  onClose: () => void,
}) {
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(banks.map((b) => [b.id, b.name])));
  const [confirm, setConfirm] = useState<string | null>(null);
  // each name is checked against the others as they're being edited
  const drafts: Bank[] = banks.map((b) => ({ ...b, name: names[b.id] ?? b.name }));
  const problems: Record<string, string> = Object.fromEntries(drafts.map((b) => [b.id, nameProblem(drafts, b.name, b.id)]));
  const ok = Object.values(problems).every((p) => !p);
  const save = () => { if (ok) { onRename(names); onClose(); } };

  return (
    <div className="update-backdrop" role="dialog" aria-modal="true" aria-label="Manage banks">
      <div className="update-card" style={{ width: 480 }}>
        <h2>Manage banks</h2>
        {banks.length === 0 && <p className="small muted">No banks left. Import one from the Gear to use menu.</p>}
        <div className="bank-list">
          {banks.map((b) => (
            <div key={b.id} className="bank-list-row">
              <div className="bank-list-main">
                <input
                  type="text"
                  aria-label={`Name of ${b.name}`}
                  aria-invalid={!!problems[b.id]}
                  value={names[b.id] ?? ''}
                  onChange={(e) => setNames((n) => ({ ...n, [b.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                />
                {confirm === b.id ? (
                  <span className="bank-row-actions">
                    <button type="button" className="btn small danger" onClick={() => { onRemove(b.id); setConfirm(null); }}>Remove</button>
                    <button type="button" className="btn small" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <button type="button" className="btn small danger" aria-label={`Remove ${b.name}`} onClick={() => setConfirm(b.id)}>Remove</button>
                )}
              </div>
              <span className="tiny muted">
                {confirm === b.id ? `Remove ${b.name}? This can't be undone.` : `${counts.get(b.id) ?? 0} gear items · imported ${new Date(b.imported).toLocaleDateString()}`}
              </span>
              {problems[b.id] && <span className="tiny" style={{ color: 'var(--loss)' }}>{problems[b.id]}</span>}
            </div>
          ))}
        </div>
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ok} onClick={save}>Save names</button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({ bank, banks, defaultName, onClose, onSave }: {
  bank: Bank | null, banks: Bank[], defaultName: string, onClose: () => void, onSave: (b: Bank) => void,
}) {
  const [name, setName] = useState(bank?.name ?? defaultName);
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseBankMemory(text) : null), [text]);
  const preview: Bank | null = parsed && {
    id: bank?.id ?? `bank-${Date.now().toString(36)}`, name: name.trim(), items: parsed.items, imported: Date.now(),
  };
  const gear = useMemo(() => (preview ? equipmentCount(preview) : 0), [parsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const problem = nameProblem(banks, name, bank?.id);

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
          <input type="text" value={name} aria-invalid={!!problem} onChange={(e) => setName(e.target.value)} placeholder="Main, Ironman…" />
        </label>
        {problem && <div className="tiny" style={{ color: 'var(--loss)' }}>{problem}</div>}
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
          <button type="button" className="btn primary" disabled={!preview || !!problem} onClick={() => preview && !problem && onSave(preview)}>{bank ? 'Update bank' : 'Import bank'}</button>
        </div>
      </div>
    </div>
  );
}
