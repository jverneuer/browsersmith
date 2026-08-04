# Browser profiles explained

A **profile** is a data object that captures everything a specific browser
version reveals about itself on the wire. Pick a profile when you call
`fetch()` or `createClient()` and the stack reproduces that browser's TLS
ClientHello, HTTP/2 SETTINGS frame, and HTTP/1.1 header order byte-for-byte.

## What a profile contains

A `BrowserProfile` bundles three independent fingerprints:

| Field | Type | What it drives |
| --- | --- | --- |
| `tls` | `TlsProfile` | The TLS ClientHello: cipher suite order, extension order, supported versions, key-share groups, signature algorithms, GREASE flag, optional `recordSizeLimit`. |
| `http2` | `Http2Profile` | The first HTTP/2 SETTINGS frame: `HEADER_TABLE_SIZE`, `ENABLE_PUSH`, `MAX_CONCURRENT_STREAMS`, `INITIAL_WINDOW_SIZE`, `MAX_FRAME_SIZE`, `MAX_HEADER_LIST_SIZE`, plus the stream `weight` and optional `priority`. |
| `http1` | `Http1Profile` | The HTTP/1.1 default headers, the client-enforced header order, the `connection` value, and the default `accept-encoding`. |

Two top-level fields, `id` (a branded `ProfileId` like `"chrome-140"`) and
`version` (like `"140.0.7339.18"`), identify the profile. The triple
`tls + http2 + http1` is the complete picture a bot detector sees: miss any
one of them and the fingerprint no longer matches the real browser.

The `cipherSuites` array on `TlsProfile` is ordered — that order *is* the
fingerprint. Chrome's list starts with a GREASE placeholder
(`TLS_GREASE_RESERVED_0`, the `0x?a?a` value from RFC 8701), then the real
ciphers in a per-release order. Firefox does not use GREASE and orders its
ciphers differently. These details are easy to get wrong by hand, so they are
encoded as data rather than written fresh per request.

## Why profiles are data, not logic

`@browsercore/profiles` is a pure-data package: it has no Node built-in
imports and imports no other `@browsercore/*` package. It only defines *what*
a fingerprint looks like. The *how* — translating that into ClientHello bytes,
a SETTINGS frame, or a header line — lives in `@browsercore/tls`,
`@browsercore/http2`, and `@browsercore/http1`. Adding a new Chrome version
means adding a new entry in the profile registry; the protocol implementations
never change. The same profile works whether the backend is a real TCP socket
or a synthetic byte stream in a test.

## The built-in catalog

These profiles ship in the registry at module load:

| id | name | version | TLS GREASE | HTTP/2 initial window |
| --- | --- | --- | --- | --- |
| `chrome-120` | chrome | 120.0.6099.71 | yes | 6291456 |
| `chrome-128` | chrome | 128.0.6613.137 | yes | 6291456 |
| `chrome-140` | chrome | 140.0.7339.18 | yes | 6291456 |
| `firefox-120` | firefox | 120.0 | no | 12582912 |
| `firefox-128` | firefox | 128.0 | no | 12582912 |
| `firefox-135` | firefox | 135.0 | no | 12582912 |
| `safari-17` | safari | 17.6 | yes | 1048576 |
| `safari-18` | safari | 18.x | yes | 1048576 |
| `edge-120` | edge | 120.x | yes | 6291456 |
| `edge-128` | edge | 128.x | yes | 6291456 |

Edge is Chromium-based, so its TLS fingerprint is close to Chrome's — same
GREASE behavior, same cipher families — but differs in the `sec-ch-ua` brand
list (which includes "Microsoft Edge") and a slightly different extension
order.

The entrypoint `browsercore` also exports a curated `PROFILES` constant that
documents the two starter profiles the examples use:

```ts
import { PROFILES } from "browsercore";

// The headline Chrome profile — matches Chrome 140 on the wire.
const chrome: ProfileId = PROFILES["chrome-140"];

// The Firefox profile — use when a target specifically matches Firefox.
const firefox: ProfileId = PROFILES["firefox-128"];
```

Pin a profile id so crawls stay reproducible; the id is the only thing the
rest of the stack reads.

## Working with profiles

Three functions cover the common cases. They are re-exported from the top-level
`browsercore` package, so you can call them without importing
`@browsercore/profiles` directly.

```ts
import {
    getProfile,
    listProfiles,
    registerProfile,
    PROFILES,
} from "browsercore";

// List every registered id, in insertion order.
const all = listProfiles();
//   → ["chrome-120", "chrome-128", "chrome-140", "firefox-120", ...]

// Look one up by id. Throws UnknownProfileError if the id is not registered.
const chrome = getProfile(PROFILES["chrome-140"]);
console.log(chrome.tls.cipherSuites); // ordered cipher list
console.log(chrome.http2.settings);   // HTTP/2 SETTINGS values

// Register a private or future profile at runtime. Overwrites any existing
// profile with the same id. Validation happens at translation time, so an
// invalid value surfaces as a FetchError on the next request — never as a
// silent wire failure.
registerProfile({
    id: "chrome-141",
    name: "chrome",
    version: "141.0.7340.0",
    tls: { /* ... */ },
    http2: { /* ... */ },
    http1: { /* ... */ },
});
```

`ProfileId` is a branded string, not an arbitrary one: the brand prevents
passing an untrusted string where only a registered id belongs.

## Choosing a profile

Use the most recent Chrome (`chrome-140`) unless you have a reason not to —
it is the headline profile the examples and the e2e suite verify. Switch to
`firefox-128` when a target specifically fingerprint-matches Firefox (rare,
but it happens with per-browser rule sets). Use `safari-17` or `edge-120` when
you need parity with those clients. For a private fingerprint or a browser
version that is not in the catalog, register a custom profile; keep in mind
that custom profiles do not get golden-capture verification unless you add
your own captures.

## Where to go next

- [TLS fingerprinting & JA3/JA4](tls-fingerprinting.md) — what the TLS layer
  actually does with the `TlsProfile`.
- [HTTP fingerprinting](http-fingerprinting.md) — how `Http2Profile` and
  `Http1Profile` become a SETTINGS frame and a header order.
- [Custom profiles](custom-profiles.md) — building and validating your own.
- [Profile reference](profile-reference.md) — a compact table of every
  built-in profile.
