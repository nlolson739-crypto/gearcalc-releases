// Stands in for the engine's cdn/json/spells.json (see vite.config.ts): the downloaded wiki copy when it was chosen,
// otherwise the copy built into the app.
import builtIn from '../../vendor/osrs-dps-calc/cdn/json/spells.json';

/** the copy built into this version (the What's new list compares downloaded data with it) */
export { builtIn };

export default (globalThis.__gearcalcWikiData?.spells ?? builtIn) as typeof builtIn;
