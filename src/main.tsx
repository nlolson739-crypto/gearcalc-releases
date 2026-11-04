import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './ui/ErrorBoundary';
import { loadWikiData } from './data/wikiData';
import './styles.css';

// The wiki data has to be chosen before the engine loads, because the engine reads it once when its modules run.
// So the app (which imports the engine) is loaded only after that.
loadWikiData()
  .catch(() => undefined)
  .then(() => import('./App'))
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
