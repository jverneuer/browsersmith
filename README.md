# browsercore

A TypeScript networking stack that impersonates real browsers at the wire level.
One install composes the entire stack — browser-identical **TLS** (JA3/JA4),
**HTTP/2** (SETTINGS fingerprint, frame ordering), **HTTP/1.1** (header order),
**cookies**, and **content negotiation** — behind a single `fetch()` call.

Use it to crawl or automate against sites that fingerprint and block non-browser
clients. The TLS ClientHello, ALPN, HTTP/2 SETTINGS, and header ordering match
a real Chrome or Firefox byte-for-byte, so bot-detection that keys on the
network fingerprint lets the request through.

```ts
import { fetch } from "browsercore";

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
anything that does not match a known browser. `browsercore` reproduces the
bytes, so you pass.

## Install

```sh
npm install browsercore
```

Requires Node >= 24. The package is a single composition — no peer deps to wire
up, no workspace links. The `@browsercore/*` packages it depends on are
published standalone and consumed as normal npm dependencies.

## Quickstart

```ts
import { createClient, createCookieJar } from "browsercore";

const jar = createCookieJar();
const client = createClient({ profile: "chrome-140", cookieJar: jar });

// Cookies persist across requests via the shared jar.
await client.fetch("https://httpbin.org/cookies/set?token=abc123");
const res = await client.fetch("https://httpbin.org/cookies");
console.log(await res.text()); // → {"cookies":{"token":"abc123"}}

await client.close();
```

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
   Detectors hash this into a JA3/JA4 fingerprint. `browsercore`'s TLS layer
   emits the ClientHello a specific browser version emits, including ordering
   and GREASE.
2. **HTTP/2 SETTINGS** — the first frame after the connection preface advertises
   `HEADER_TABLE_SIZE`, `INITIAL_WINDOW_SIZE`, `MAX_FRAME_SIZE`, etc. Each
   browser ships a distinct tuple. `browsercore` sends the profile's tuple.
3. **HTTP/1.1 header order** — `User-Agent`, `Accept`, `Accept-Language`,
   `Accept-Encoding`, etc. appear in a browser-specific order. Detectors that
   key on header order (common in WAF rules) match.

Pick a profile (`"chrome-140"`, `"firefox-128"`) and all three layers match that
browser. See [`examples/defeat-bot-detection.ts`](./examples/defeat-bot-detection.ts)
and the e2e suite in [`tests/`](./tests) for the assertion that the wire bytes
match a real browser capture.

## Testing

```sh
npm test
```

The e2e suite boots a **local fixture server** (no real network) that asserts
the exact signals a bot detector checks: TLS fingerprint match (against the
golden captures in [`testing/captures/`](./testing/captures)), HTTP/2 SETTINGS,
header order, User-Agent, challenge page handling, cookie round-trip, redirect
handling, decompression, and timeout/abort. The fixture rejects any client that
does not present a browser fingerprint; the tests prove `browsercore` passes.

## Architecture

This repo is the **customer-facing entrypoint**, not a monorepo. The hardened
protocol code lives in standalone, separately versioned packages:

```
@browsercore/transport   TCP + DNS byte stream
@browsercore/crypto      AEAD, HKDF, key schedule
@browsercore/tls         TLS 1.3 ClientHello + handshake (JA3/JA4 source)
@browsercore/quic        QUIC packets + frames
@browsercore/http1       HTTP/1.1 client
@browsercore/http2       HTTP/2 client (SETTINGS fingerprint source)
@browsercore/http3       HTTP/3 over QUIC
@browsercore/compression gzip/deflate/br decoding
@browsercore/cookies     RFC 6265 cookie jar
@browsercore/profiles    Browser fingerprint definitions (pure data)
@browsercore/fetch       The fetch() that composes the above
@browsercore/devtools    Debugging helpers
@browsercore/testing     RFC suites + golden capture comparison
```

`browsercore` (this package) depends on all of them via `package.json` and
re-exports the developer-facing surface. No filesystem links, no workspaces —
`npm install` pulls the real published packages.

## License

MIT
