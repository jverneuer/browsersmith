/**
 * Barrel re-exporting the per-browser profile maps. Kept separate from the main
 * barrel so internal code can import the maps without pulling in the registry.
 */

export { ChromeProfiles } from "./profiles/chrome.js";
export { FirefoxProfiles } from "./profiles/firefox.js";
export { SafariProfiles } from "./profiles/safari.js";
export { EdgeProfiles } from "./profiles/edge.js";
