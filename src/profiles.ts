/**
 * Curated profile ids — the recommended starting points for a customer.
 *
 * The full registry (`listProfiles()`) contains more; this file names the
 * handful that are documented, battle-tested against bot detectors, and used
 * by the examples. Pin a profile id so crawls stay reproducible.
 *
 * These ids cover the TLS + HTTP/1.1 + HTTP/2 fingerprint. HTTP/3 (QUIC) rides
 * the same profile — the QUIC transport + HTTP/3 SETTINGS are derived from the
 * same chrome-140 / firefox-128 profile, so no separate HTTP/3 profile ids are
 * needed. See the `@browsercore/http3` and `@browsercore/quic` re-exports in
 * this entrypoint for the HTTP/3 surface.
 */

import type { ProfileId } from "@browsercore/profiles";

/** Cast a string literal to the branded ProfileId (the registry guarantees it). */
function profile(s: "chrome-140" | "firefox-128"): ProfileId {
    return s as ProfileId;
}

/**
 * The headline Chrome profile. Matches Chrome's TLS ClientHello (JA3/JA4),
 * HTTP/2 SETTINGS frame, and HTTP/1.1 header order. Use this unless you have a
 * reason to mimic a different browser.
 */
export const CHROME_140: ProfileId = profile("chrome-140");

/**
 * The Firefox profile. Matches Firefox's TLS fingerprint and HTTP/2 frame
 * layout. Use when a target specifically fingerprint-matches Firefox.
 */
export const FIREFOX_128: ProfileId = profile("firefox-128");

/** All documented, supported starter profile ids. */
export const PROFILES = {
    "chrome-140": CHROME_140,
    "firefox-128": FIREFOX_128,
} as const;

/** Keys of {@link PROFILES} — the supported starter profile aliases. */
export type StarterProfile = keyof typeof PROFILES;
