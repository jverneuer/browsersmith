# @network/profiles — Implementation Plan

Pure data package describing browser fingerprints. Implement in this order; each
step is independently testable.

## Step 1 — Type definitions (DONE)

Define `TlsProfile`, `Http2Profile`, `Http1Profile`, `BrowserProfile`, branded
`ProfileName`, and the `ProfileId` brand in `src/types.ts`. Plus `errors.ts` and
`utils.ts` (assertNever, createId).

## Step 2 — Chrome profiles (DONE)

Add `src/profiles/chrome.ts` with realistic Chrome 120 / 128 / 140 entries: GREASE
cipher ordering, TLS 1.3 settings, HTTP/2 SETTINGS frame values, default headers
with the matching `sec-ch-ua` brand list per version.

## Step 3 — Firefox profiles (DONE)

Add `src/profiles/firefox.ts` with Firefox 120 / 128 / 135 entries. Distinct
cipher order, no GREASE, larger HTTP/2 initial window, matching user-agent strings.

## Step 4 — Safari profiles (DONE)

Add `src/profiles/safari.ts` with Safari 17 / 18 entries. WebKit-specific cipher
order, conservative HTTP/2 settings, matching user-agent strings.

## Step 5 — Edge profiles (DONE)

Add `src/profiles/edge.ts` with Edge 120 / 128 entries. Chromium-close TLS but
distinct `sec-ch-ua` brand list (includes "Microsoft Edge") and user-agent suffix.

## Step 6 — Registry + getProfile (DONE)

Implement `src/registry.ts` with a `Map<ProfileId, BrowserProfile>` backing
`getProfile`, `listProfiles`, and `registerProfile`. Index built-in profiles at
module load.

## Step 7 — Validation against real captures

Compare each profile's TLS values (cipher order, extension order, GREASE) against
real Wireshark / JA4 captures for that browser version. Adjust until the JA3 / JA4
hashes match published values.

## Step 8 — Profile diff utility

Add a utility that diffs two `BrowserProfile` objects and reports which layers
differ (cipher order, settings, headers). Useful for regression-testing new
versions against the previous one.

## Definition of done

- [x] Type definitions for TLS / HTTP/2 / HTTP/1.1 profiles.
- [x] Chrome 120, 128, 140 entries with realistic values.
- [x] Firefox 120, 128, 135 entries.
- [x] Safari 17, 18 entries.
- [x] Edge 120, 128 entries.
- [x] Registry with `getProfile` / `listProfiles` / `registerProfile`.
- [ ] TLS values validated against real browser captures.
- [ ] Profile diff utility implemented.
- [ ] Every test in `tests/` passes; `tsc --build` is clean.
