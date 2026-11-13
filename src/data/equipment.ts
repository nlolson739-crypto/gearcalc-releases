// Stands in for the engine's cdn/json/equipment.json (see vite.config.ts): the downloaded wiki copy when it was chosen,
// otherwise the copy built into the app.
import builtIn from '../../vendor/osrs-dps-calc/cdn/json/equipment.json';

/** the copy built into this version (the What's new list compares downloaded data with it) */
export { builtIn };

export default (globalThis.__gearcalcWikiData?.equipment ?? builtIn) as typeof builtIn;
