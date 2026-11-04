// Stands in for the engine's cdn/json/spells.json (see vite.config.ts): the downloaded wiki copy when it was chosen,
// otherwise the copy built into the app.
import builtIn from '../../vendor/osrs-dps-calc/cdn/json/spells.json';

export default (globalThis.__gearcalcWikiData?.spells ?? builtIn) as typeof builtIn;
