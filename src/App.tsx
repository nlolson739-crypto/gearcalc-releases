import { useEffect, useRef, useState } from 'react';
import { baseMonster, useAppState } from './state';
import DpsScreen from './screens/DpsScreen';
import DefenceScreen from './screens/DefenceScreen';
import FreezeScreen from './screens/FreezeScreen';
import BestScreen from './screens/BestScreen';
import UpdatePrompt from './ui/UpdatePrompt';
import WikiDataBadge from './ui/WikiDataBadge';
import WhatsNew from './ui/WhatsNew';

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
  // The best-setup search keeps running on other tabs; its tab shows how far it is, then a mark when it's done.
  const [searchProgress, setSearchProgress] = useState<number | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const wasSearching = useRef(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => {
    if (searchProgress !== null) wasSearching.current = true;
    else if (wasSearching.current) {
      wasSearching.current = false;
      if (screenRef.current !== 'best') setSearchDone(true);
    }
  }, [searchProgress]);
  useEffect(() => { if (screen === 'best') setSearchDone(false); }, [screen]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></svg>
          <span>GearCalc</span>
        </div>
        <nav aria-label="Main">
          {SCREENS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={s.id === screen ? 'on' : ''} aria-current={s.id === screen ? 'page' : undefined}>
              {s.label}
              {s.id === 'best' && searchProgress !== null && (
                <span className="tab-badge" title="Searching for the best setups">{Math.round(searchProgress * 100)}%</span>
              )}
              {s.id === 'best' && searchProgress === null && searchDone && (
                <span className="tab-badge done" title="The search has finished">Done</span>
              )}
            </a>
          ))}
        </nav>
        <WikiDataBadge />
        <WhatsNew target={baseMonster(state.target).name} />
      </header>
      {screen === 'dps' && <DpsScreen state={state} setState={setState} />}
      {/* always mounted, so a running search isn't lost when another tab is opened */}
      <BestScreen state={state} setState={setState} hidden={screen !== 'best'} onProgress={setSearchProgress} />
      {screen === 'defence' && <DefenceScreen state={state} setState={setState} />}
      {screen === 'freeze' && <FreezeScreen />}
      <UpdatePrompt />
    </div>
  );
}
