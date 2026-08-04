# browsersmith

[![npm version](https://img.shields.io/npm/v/browsersmith.svg)](https://www.npmjs.com/package/browsersmith)
[![npm license](https://img.shields.io/npm/l/browsersmith.svg)](https://github.com/jverneuer/browsersmith/blob/main/LICENSE)
[![node >=26](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](https://nodejs.org)

A TypeScript networking stack that impersonates real browsers at the wire level.
One install composes the entire stack — browser-identical **TLS** (JA3/JA4),
**HTTP/2** (SETTINGS fingerprint, frame ordering), **HTTP/1.1** (header order),
**cookies**, and **content negotiation** — behind a single `fetch()` call.

Use it to crawl or automate against sites that fingerprint and block non-browser
clients. The TLS ClientHello, ALPN, HTTP/2 SETTINGS, and header ordering match
a real Chrome or Firefox byte-for-byte, so bot-detection that keys on the
network fingerprint lets the request through.

```ts
import { fetch } from "browsersmith";

// Indistinguishable from Chrome 140 at the TLS + HTTP layer.
const res = await fetch("https://example.com", { profile: "chrome-140" });
console.log(res.status, await res.text());
```

## Why

Most HTTP clients (node fetch, axios, got, python requests) announce themselves
at the protocol layer. Their TLS ClientHello lists cipher suites in a different
order than Chrome; their HTTP/2 SETTINGS frame advertises different window
sizes; their header order is wrong. Bot detectors (Cloudflare, Datadome,
Akamai, PerimeterX, fingerprint.com) hash exactly those bytes and block
anything that does not match a known browser. `browsersmith` reproduces the
bytes, so you pass.

## Install

```sh
npm install browsersmith
```

Requires Node >= 26. The package is a single composition — no peer deps to wire
up, no workspace links. The `@browsercore/*` packages it depends on are
published standalone and consumed as normal npm dependencies.

## Quickstart

```ts
import { createClient, createCookieJar } from "browsersmith";

const jar = createCookieJar();
const client = createClient({ profile: "chrome-140", cookieJar: jar });

// Cookies persist across requests via the shared jar.
await client.fetch("https://httpbin.org/cookies/set?token=abc123");
const res = await client.fetch("https://httpbin.org/cookies");
console.log(await res.text()); // → {"cookies":{"token":"abc123"}}

await client.close();
```

## What this package exposes

`browsersmith` is the customer-facing entrypoint. It holds no protocol logic of
its own — it composes the lower `@browsercore/*` packages into a `fetch()` and
adds a curated profile table plus a `crawl()` helper:

| Export | Source | Purpose |
| --- | --- | --- |
| `fetch`, `createClient` | `@browsercore/fetch` | The browser-identical `fetch()` and a reusable client. |
| `PROFILES` | `./profiles.ts` | Curated starter profile ids (`chrome-140`, `firefox-128`). |
| `crawl()` | `./crawl.ts` | Batch URL fetcher with a shared client, cookie jar, and concurrency control. |
| `createCookieJar`, `saveJar`, `loadJar` | `@browsercore/cookies` | RFC 6265 cookie jar for session continuity. |
| `getProfile`, `listProfiles`, `registerProfile` | `@browsercore/profiles` | Browser profile registry. |
| `FetchError`, `FetchTimeoutError`, `ProtocolError`, `RedirectError` | `@browsercore/fetch` | Typed error hierarchy with `kind` discriminators. |

See [`src/index.ts`](./src/index.ts) for the full public surface.

## Examples

Runnable, documented examples live in [`examples/`](./examples). Run any with
`npx tsx examples/<name>.ts`:

| Example | What it shows |
| --- | --- |
| [`basic-fetch.ts`](./examples/basic-fetch.ts) | One request with a Chrome profile; read text + JSON. |
| [`crawl-sitemap.ts`](./examples/crawl-sitemap.ts) | Walk a URL list with a shared client + cookie jar (the `crawl()` helper). |
| [`defeat-bot-detection.ts`](./examples/defeat-bot-detection.ts) | Hit a bot-detection fixture; pass because the fingerprint matches. |
| [`http1-vs-http2.ts`](./examples/http1-vs-http2.ts) | Selecting HTTP/1.1 vs HTTP/2 via ALPN and the profile. |

## How crawler detection is defeated

A request carries three layers of fingerprint a detector inspects:

1. **TLS ClientHello** — cipher suite list, extensions, supported versions,
   key-share groups, signature algorithms, GREASE values, and their *order*.
   Detectors hash this into a JA3/JA4 fingerprint. `browsersmith`'s TLS layer
   emits the ClientHello a specific browser version emits, including ordering
   and GREASE.
2. **HTTP/2 SETTINGS** — the first frame after the connection preface advertises
   `HEADER_TABLE_SIZE`, `INITIAL_WINDOW_SIZE`, `MAX_FRAME_SIZE`, etc. Each
   browser ships a distinct tuple. `browsersmith` sends the profile's tuple.
3. **HTTP/1.1 header order** — `User-Agent`, `Accept`, `Accept-Language`,
   `Accept-Encoding`, etc. appear in a browser-specific order. Detectors that
   key on header order (common in WAF rules) match.

Pick a profile (`"chrome-140"`, `"firefox-128"`) and all three layers match that
browser. See [`examples/defeat-bot-detection.ts`](./examples/defeat-bot-detection.ts)
and the e2e suite in [`tests/`](./tests) for the assertion that the wire bytes
match a real browser capture.

## Development

This repo is the customer-facing entrypoint — the hardened protocol code lives
in standalone, separately versioned `@browsercore/*` packages. See
[`PACKAGES.md`](./PACKAGES.md) for the full dependency graph.

```sh
npm install          # install dependencies
npm run build        # tsc -p tsconfig.build.json (emit to dist/)
npm run typecheck    # tsc --noEmit (type-check only, no emit)
npm run lint         # oxlint --type-aware src/
npm test             # vitest run
npm run test:watch   # vitest (interactive watch mode)
npm run example <f>  # tsx examples/<f>.ts
```

### Shared config

Build, lint, test, and CI config for the `@browsercore/*` family is centralized
in the [`@browsercore/dev`](https://github.com/jverneuer/browsercore-dev)
package — the single source of truth for `tsconfig` base flags, the `vitest`
config factory (`definePackageConfig({ name: "browsersmith" })`), the `oxlint`
base, the `coverage-md` bin, and the `CODING_STANDARDS.md` + `.github/*`
governance templates.

This repo is **partially migrated** to `@browsercore/dev`: the CI workflow and
the `.github/ruleset.json` / `bootstrap-ruleset.sh` governance templates are
already synced, and the local `scripts/coverage-md.mjs` has been removed in
favor of the shared bin. The `tsconfig.json`, `vitest.config.ts`, and oxlint
configs are still hand-maintained, and `@browsercore/dev` is not yet listed as
a dependency — see [`MIGRATION_TODO.md`](./MIGRATION_TODO.md) for the remaining
steps.

## Testing

```sh
npm test
```

The e2e suite boots a **local fixture server** (no real network) that asserts
the exact signals a bot detector checks: TLS fingerprint match (against the
golden captures in [`testing/captures/`](./testing/captures)), HTTP/2 SETTINGS,
header order, User-Agent, challenge page handling, cookie round-trip, redirect
handling, decompression, and timeout/abort. The fixture rejects any client that
does not present a browser fingerprint; the tests prove `browsersmith` passes.

## Architecture

```
browsersmith (this package — entrypoint, crawl helper, curated profiles)
  └─ @browsercore/fetch — composes TLS + HTTP layers into a fetch() API
       ├─ @browsercore/http2 — HTTP/2 framing, HPACK, stream multiplexing
       ├─ @browsercore/http1 — HTTP/1.1 client
       ├─ @browsercore/tls — TLS 1.3 (with 1.2 fallback), JA3/JA4 source
       │    ├─ @browsercore/crypto — AEAD, HKDF, X25519, hashing
       │    └─ @browsercore/transport — TCP + DNS byte stream
       ├─ @browsercore/profiles — Browser fingerprint definitions (pure data)
       ├─ @browsercore/cookies — RFC 6265 cookie jar
       └─ @browsercore/compression — gzip/deflate/brotli/zstd
```

`@browsercore/http3` and `@browsercore/quic` exist but are not yet wired into
the entrypoint. Dependency direction is strictly downward — a package may only
import from packages below it in the graph.

## License

MIT
