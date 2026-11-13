// Stands in for the engine's cdn/json/monsters.json (see vite.config.ts): the downloaded wiki copy when it was chosen,
// otherwise the copy built into the app.
import builtIn from '../../vendor/osrs-dps-calc/cdn/json/monsters.json';

/** the copy built into this version (the What's new list compares downloaded data with it) */
export { builtIn };

export default (globalThis.__gearcalcWikiData?.monsters ?? builtIn) as typeof builtIn;
