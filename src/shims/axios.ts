// The engine's utils import axios only for hiscore lookups and share links, which GearCalc doesn't use.
const unsupported = () => Promise.reject(new Error('Network helpers from the wiki calculator are not used in GearCalc'));
export default { get: unsupported, post: unsupported };
