import { Component, type ErrorInfo, type ReactNode } from 'react';

type LogApi = { log_error?: (msg: string) => Promise<unknown> };
/** Sends an error to the desktop launcher's log (%APPDATA%\GearCalc\gearcalc.log); a no-op in a browser. */
export const logError = (msg: string) => {
  try {
    const a = (window as unknown as { pywebview?: { api?: LogApi } }).pywebview?.api;
    if (typeof a?.log_error === 'function') a.log_error(msg).catch(() => {});
  } catch { /* ignore */ }
};

window.addEventListener('error', (e) => logError(`${e.message} at ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => logError(`unhandled rejection: ${String(e.reason)}`));

/** Shows what went wrong instead of a blank window, with a way out if saved setups are the cause. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`${error.stack ?? error.message}\n${info.componentStack ?? ''}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const reset = () => {
      try { localStorage.removeItem('gearcalc-state-v1'); } catch { /* ignore */ }
      window.location.reload();
    };
    return (
      <div className="update-backdrop">
        <div className="update-card">
          <h2>Something went wrong</h2>
          <p className="small">GearCalc couldn't draw this screen. If it keeps happening after a restart, your saved setups may be from an older version: resetting them usually fixes it.</p>
          <pre className="tiny muted" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', margin: 0 }}>{this.state.error.message}</pre>
          <div className="row end">
            <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="btn primary" onClick={reset}>Reset saved setups</button>
          </div>
        </div>
      </div>
    );
  }
}
