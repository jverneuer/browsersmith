/**
 * Profile registry — the single source of truth for known browser fingerprints.
 *
 * Profiles are registered once at module load (via the per-browser map files) and
 * can be extended at runtime through {@link registerProfile}. Lookups are O(1).
 */

import type { BrowserProfile, ProfileId } from "./types.js";
import { UnknownProfileError } from "./errors.js";
import { ChromeProfiles } from "./profiles/chrome.js";
import { FirefoxProfiles } from "./profiles/firefox.js";
import { SafariProfiles } from "./profiles/safari.js";
import { EdgeProfiles } from "./profiles/edge.js";

const registry = new Map<ProfileId, BrowserProfile>();

function index(profile: BrowserProfile): void {
    registry.set(profile.id, profile);
}

// Built-in profiles — indexed at module evaluation.
for (const profile of Object.values(ChromeProfiles)) {
    index(profile);
}
for (const profile of Object.values(FirefoxProfiles)) {
    index(profile);
}
for (const profile of Object.values(SafariProfiles)) {
    index(profile);
}
for (const profile of Object.values(EdgeProfiles)) {
    index(profile);
}

/** Look up a profile by its branded id. Throws {@link UnknownProfileError} if absent. */
export function getProfile(id: ProfileId): BrowserProfile {
    const profile = registry.get(id);
    if (profile === undefined) {
        throw new UnknownProfileError(id);
    }
    return profile;
}

/** List every registered profile id, in insertion order. */
export function listProfiles(): ReadonlyArray<ProfileId> {
    return Array.from(registry.keys());
}

/**
 * Register a custom profile (e.g. a private build or a future version).
 * Overwrites any existing profile with the same id.
 */
export function registerProfile(profile: BrowserProfile): void {
    index(profile);
}
