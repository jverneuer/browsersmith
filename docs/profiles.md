# Profiles

What a profile is, which ship in the box, how to use one, and how to register your own. For copy-pasteable recipes (POST JSON, crawl, HTTP/3 opt-in, custom profile end-to-end) see [examples.md](./examples.md). For where each profile field plugs into the transport stack, see [architecture.md](./architecture.md).

## What is a profile?

A profile is a structured bundle that pins one browser's full wire fingerprint in a single object. Structurally, a `BrowserProfile` is three sub-objects stitched together: `{ tls: TlsProfile, http1: Http1Profile, http2: Http2Profile }`. The `TlsProfile` carries the ClientHello — cipher suite list and order, extension order (the primary JA3/JA4 signal), the GREASE flag (RFC 8701), key-share groups, signature algorithms, and ALPN. The `Http2Profile` carries the `SETTINGS` frame values, `WINDOW_UPDATE`, and pseudo-header order — the Akamai HTTP/2 fingerprint. The `Http1Profile` carries the HTTP/1.1 header order. Pass a profile to `fetch()`, `createClient()`, or `crawl()` and every layer below receives the right config bundle automatically; you never wire TLS and HTTP/2 by hand.

## Profiles that ship in the box

browsersmith's own `PROFILES` const pins two profiles — the recommended defaults for reproducible crawls:

| Profile ID | Browser | TLS | HTTP/2 | Use when |
|---|---|---|---|---|
| `chrome-140` | Chrome 140 stable | JA3/JA4 (Chrome) | Akamai HTTP/2 (Chrome) | Default — use unless you have a reason not to |
| `firefox-128` | Firefox 128 ESR | JA3/JA4 (Firefox) | Akamai HTTP/2 (Firefox) | When a target specifically match-fingerprints Firefox |

Profile IDs are kebab-case strings — `"chrome-140"`, not `"chrome140"` or `"CHROME_140"`. The `PROFILES` object is keyed by these strings, so access is bracketed: `PROFILES["chrome-140"]`. Dotted access like `PROFILES.CHROME_140` is a syntax error — the key is a kebab-case string, not a valid identifier.

browsersmith re-exports `getProfile()` and `listProfiles()` from `@browsercore/profiles`, so the full ten-profile registry is reachable without installing `@browsercore/profiles` separately. The eight additional profiles — `chrome-120`, `chrome-128`, `firefox-120`, `firefox-135`, `safari-17`, `safari-18`, `edge-120`, `edge-128` — live in that registry but are NOT in browsersmith's `PROFILES` const. Reach them via `getProfile()`, not via `PROFILES[...]`.

## Using a profile

Three equivalent ways to pass a profile to `fetch()` (and to `createClient()`, which takes the same `profile` option):

```typescript
// 1. The pinned const — recommended for reproducible crawls.
import { fetch, PROFILES } from "browsersmith";
await fetch(url, { profile: PROFILES["chrome-140"] });
```

```typescript
// 2. Any registered profile via getProfile() — including the eight not pinned in PROFILES.
import { fetch, getProfile, type ProfileId } from "browsersmith";
await fetch(url, { profile: getProfile("chrome-128" as ProfileId) });
```

```typescript
// 3. A literal BrowserProfile object you construct yourself.
import { fetch, type BrowserProfile } from "browsersmith";
const custom: BrowserProfile = {
  tls:   { /* ciphers, extensionOrder, grease, keyShareGroups, signatureAlgorithms, alpn */ },
  http1: { /* headerOrder */ },
  http2: { /* settings, pseudoHeaderOrder, windowUpdate */ },
};
await fetch(url, { profile: custom });
```

The three are interchangeable at the `fetch()` boundary — they all resolve to the same `BrowserProfile` shape handed to the transport stack. Pick the form that fits your code: the pinned const for stability, `getProfile()` for breadth across the registry, a literal object for full control (or for a profile you just registered).

## Listing and resolving profiles

```typescript
import { listProfiles, getProfile } from "browsersmith";

listProfiles();               // → ["chrome-140", "firefox-128", "chrome-120", ...] (includes runtime-registered ids)
getProfile("firefox-135");    // → { tls: {...}, http1: {...}, http2: {...} }
```

`listProfiles()` returns the full set of registered IDs — built-in plus anything you've added with `registerProfile()` at runtime; it is not a static list. `getProfile()` resolves a single ID to its `BrowserProfile` object.

## Registering your own profile

For a browser not in the registry — a mobile build, a future Chrome, a specific Edge version — call `registerProfile()`:

```typescript
import { registerProfile, fetch, getProfile, type BrowserProfile, type ProfileId } from "browsersmith";

const chromeAndroid: BrowserProfile = {
  tls:   { ciphers: [...], extensionOrder: [...], grease: true, keyShareGroups: [...], signatureAlgorithms: [...], alpn: ["h2", "http/1.1"] },
  http1: { headerOrder: ["host", "user-agent", "accept", "accept-encoding", "accept-language", ...] },
  http2: { settings: { HEADER_TABLE_SIZE: 65536, ENABLE_PUSH: 0, INITIAL_WINDOW_SIZE: 6291456, MAX_HEADER_LIST_SIZE: 262144 }, pseudoHeaderOrder: [":method", ":authority", ":scheme", ":path"], windowUpdate: 15663105 },
};

registerProfile("chrome-140-android" as ProfileId, chromeAndroid);
await fetch(url, { profile: getProfile("chrome-140-android" as ProfileId) });
```

The `TlsProfile` / `Http1Profile` / `Http2Profile` types are exported from browsersmith, so you get full type-checking on a custom profile. Load-bearing fields: for `TlsProfile`, the `extensionOrder` array and the `grease` boolean (see [architecture.md](./architecture.md#where-the-fingerprint-lives)); for `Http2Profile`, the `SETTINGS` values plus `pseudoHeaderOrder`; for `Http1Profile`, the header order.

Capture the real browser's ClientHello first — Wireshark, `tls.peet.ws`, or `@browsercore/testing`'s golden captures. Inventing values produces a fingerprint that matches nothing.

## What's NOT yet profiled

A few honest gaps. (a) HTTP/3 — QUIC transport parameters, HTTP/3 `SETTINGS`, and QPACK are *derived* from the same `BrowserProfile` bundle; there is no separate `Http3Profile` registry yet, so a custom `chrome-140-android` profile will use derived/default HTTP/3 settings rather than real Android Chrome HTTP/3 settings. (b) Mobile browsers — no iOS Safari, Android Chrome, or mobile Firefox profiles ship in the registry; bring your own via `registerProfile()`. (c) Less common desktop versions — only `chrome-140` and `firefox-128` are pinned in `PROFILES`; the other eight in `@browsercore/profiles` cover older Chrome/Firefox plus Safari and Edge, but the catalog is not exhaustive. (d) JA3 permutation / extension randomization (the `ja3_permutation` feature in `curl_cffi`) is not supported — extension order is fixed per profile.

## Stability note

Profile IDs (`"chrome-140"`, `"firefox-128"`) are pinned and will not be silently renamed — pin them in your code so crawls stay reproducible across browsersmith versions. If a profile ID is ever deprecated, it will remain a documented alias for at least one major version.

## Sources

- Worklog Task `1-repo-browsersmith` — `src/profiles.ts` defines `CHROME_140` and `FIREFOX_128` as `ProfileId` branded strings (`"chrome-140"`, `"firefox-128"`), the `PROFILES` const keyed by those kebab-case strings, and the `StarterProfile` type.
- Worklog Task `1-repo-browsersmith` Stage Summary — public API surface includes the profile registry (`getProfile`, `listProfiles`, `registerProfile`) plus the `PROFILES` constant and the `BrowserProfile` / `ProfileId` / `ProfileName` / `TlsProfile` / `Http1Profile` / `Http2Profile` types, all re-exported from browsersmith.
- Worklog Task `1-repo-browsersmith` — doc-vs-code drift: `llm.txt` shows `PROFILES.CHROME_140` dotted syntax, which is a syntax error because the key is a kebab-case string requiring bracketed access.
- Package: `@browsercore/profiles` — owns the runtime profile registry and the `ProfileId` branded type.
