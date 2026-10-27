import { useEffect, useState } from 'react';
import { useAppState } from './state';
import DpsScreen from './screens/DpsScreen';
import DefenceScreen from './screens/DefenceScreen';
import FreezeScreen from './screens/FreezeScreen';
import BestScreen from './screens/BestScreen';
import UpdatePrompt from './ui/UpdatePrompt';
import vendorLock from '../vendor.lock?raw';

const SCREENS = [
  { id: 'dps', label: 'DPS' },
  { id: 'best', label: 'Best setup' },
  { id: 'defence', label: 'Defence reduction' },
  { id: 'freeze', label: 'Freeze check' },
] as const;
type ScreenId = typeof SCREENS[number]['id'];

const screenFromHash = (): ScreenId => {
  const h = window.location.hash.slice(1);
  return (SCREENS.find((s) => s.id === h)?.id ?? 'dps');
};

export default function App() {
  const [state, setState] = useAppState();
  const [screen, setScreen] = useState<ScreenId>(screenFromHash);
  useEffect(() => {
    const on = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></svg>
          <span>GearCalc</span>
        </div>
        <nav aria-label="Main">
          {SCREENS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={s.id === screen ? 'on' : ''} aria-current={s.id === screen ? 'page' : undefined}>{s.label}</a>
          ))}
        </nav>
        <div className="data-status" title={`Wiki DPS engine and data at commit ${vendorLock.trim()}`}>
          <span className="dot" />
          <span>OSRS Wiki engine {vendorLock.trim().slice(0, 7)}</span>
        </div>
      </header>
      {screen === 'dps' && <DpsScreen state={state} setState={setState} />}
      {screen === 'best' && <BestScreen state={state} setState={setState} />}
      {screen === 'defence' && <DefenceScreen state={state} setState={setState} />}
      {screen === 'freeze' && <FreezeScreen />}
      <UpdatePrompt />
    </div>
  );
}
