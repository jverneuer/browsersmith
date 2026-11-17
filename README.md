![header](docs/browsersmith.png)

---

[![npm version](https://img.shields.io/npm/v/browsersmith)](https://www.npmjs.com/package/browsersmith)
[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsersmith/badge.json)](https://jverneuer.github.io/browsersmith/COVERAGE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsersmith/ci.yml?label=ci)](https://github.com/jverneuer/browsersmith/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/browsersmith.svg)](LICENSE)

A TypeScript networking stack that impersonates real browsers at the wire level.
Composes independently published `@browsercore/*` packages into a single `fetch()`
whose TLS ClientHello (JA3/JA4), HTTP/2 SETTINGS, and header ordering match
Chrome or Firefox byte-for-byte, defeating bot-detection services.

browsersmith is the **composition root** — the only package allowed `node:*`
imports. It assembles a single `Platform` object (lazily, on first use) that
threads runtime capabilities down through options, making every protocol
package runtime-agnostic and independently swappable. Edge consumers import
[`browsersmith/core`](#platform--the-composition-root) instead and compose
their own Platform.

## Use with Crawlee

Drop browsersmith into any Crawlee crawler and every request carries a
browser-identical TLS/HTTP2 fingerprint plus per-request proxy rotation, with
zero native dependencies — a drop-in next to `FetchHttpClient`:

```ts
import { CheerioCrawler } from "crawlee";
import { BrowsersmithHttpClient } from "@browsercore/crawlee";

const crawler = new CheerioCrawler({
    httpClient: new BrowsersmithHttpClient(),
});
```

Works with `CheerioCrawler`, `HttpCrawler`, `BasicCrawler`, and anything else
built on `@crawlee/http-client`. Crawlee keeps the queue, retries, sessions,
and autoscaling; browsersmith owns the wire. Full guide:
[docs/crawlee.md](docs/crawlee.md) — package:
[@browsercore/crawlee on npm](https://www.npmjs.com/package/@browsercore/crawlee).

## What it does

```typescript
import { fetch, createClient, platform } from "browsersmith";

// One-shot fetch with a real browser fingerprint:
const response = await fetch("https://example.com", { profile: "chrome-140" }, platform);

// Reusable client for connection pooling:
const client = createClient({ profile: "chrome-140", events: platform.events });
try {
    const r1 = await client.fetch("https://example.com");
    const r2 = await client.fetch("https://example.com/api", { method: "POST" });
} finally {
    await client.close();
}
```

## Browser Impersonation

Browsersmith impersonates real browsers at the network level — every layer a
bot detector inspects is reproduced from a browser profile:

- **TLS fingerprinting**: Chrome, Firefox, Safari, Edge profiles with correct
  cipher-suite ordering, extension ordering, GREASE (RFC 8701), post-quantum key
  shares (X25519MLKEM768), and signature algorithms. The ClientHello JA3/JA4
  matches the target browser byte-for-byte.
- **HTTP/2 fingerprinting**: Browser-specific SETTINGS values, window sizes,
  and priority semantics. The Akamai HTTP/2 fingerprint (SETTINGS order +
  WINDOW_UPDATE + PRIORITY frames) matches the target browser.
- **HTTP/1.1 fingerprinting**: Correct header casing, ordering, and defaults
  (sec-ch-ua, sec-fetch-*, accept-encoding) for each browser family.
- **JA3/JA4 validation**: Built-in profile validation against golden captures
  via `buildExpectedClientHello` and `validateProfileAgainstCapture`.
- **Cookie + header fidelity** (0.0.17 stack): `FetchResponse.getSetCookie()`
  returns every `Set-Cookie` header verbatim on both HTTP/1.1 and HTTP/2
  (multiple `Set-Cookie` lines are never collapsed), duplicate response headers
  are preserved via `getHeaderValues()`, and HEAD/204/304 responses no longer
  close pooled keep-alive connections.

### Usage

```typescript
import { fetch, createClient, platform, PROFILES } from "browsersmith";

// One-shot fetch with a real Chrome 140 fingerprint:
const response = await fetch("https://example.com", {
    profile: PROFILES["chrome-140"],
}, platform);

// Reusable client for connection pooling + cookie jar:
const client = createClient({ profile: PROFILES["chrome-140"], platform });
```

### Available profiles

Pinned in the `PROFILES` const:

| Profile | Browser | Post-quantum key share |
|---------|---------|----------------------|
| `chrome-140` | Chrome 140+ | X25519MLKEM768 |
| `firefox-128` | Firefox 128+ | — |

In the registry via `getProfile()` (see [docs/profiles.md](docs/profiles.md)):

| Profile | Browser | Notes |
|---------|---------|-------|
| `safari-17` | Safari 17.x | wire-correct h2 SETTINGS since profiles 0.2.5 |
| `safari-18` | Safari 18.x | wire-correct h2 SETTINGS since profiles 0.2.5 |
| `chrome-120`, `chrome-128`, `firefox-120`, `firefox-135`, `edge-120`, `edge-128` | older Chrome/Firefox/Edge | |

### Verification

Each profile carries the full fingerprint data that protocol layers translate
into wire bytes. The test suites in `tests/impersonation-config.test.ts` and
`tests/fingerprint-computation.test.ts` verify the profile → protocol config →
ClientHello projection pipeline.

## Proxy

Route requests through an HTTP CONNECT or SOCKS5 proxy with the `proxy` option — a client-level default on `createClient()`, overridable per request. Proxied connections are pooled per origin+proxy pair, and the browser fingerprint travels through the tunnel unchanged.

```typescript
import { createClient, parseProxyUrl, platform, PROFILES } from "browsersmith";

// Client-level default — every request from this client tunnels through it:
const client = createClient({
    profile: PROFILES["chrome-140"],
    proxy: parseProxyUrl("socks5h://user:pass@proxy.example.com:1080"),
    platform,
});
```

```typescript
// Per-request override — rotate to a different exit for a single call:
const response = await client.fetch("https://example.com", {
    proxy: parseProxyUrl("http://rotating-proxy.example.com:8080"),
});
```

`socks5` resolves the target hostname **locally** and sends the IP; `socks5h` sends the hostname verbatim and lets the **proxy** resolve it — prefer `socks5h` when local DNS would leak or misresolve the target. Configs that don't come from a URL can be passed as object literals: `{ scheme: "http", host: "127.0.0.1", port: 8080 }`.

Tunnel failures surface as `FetchProxyError` with the underlying proxy error kind preserved on `proxyKind` — auth failures, tunnel refusals, and handshake corruption are distinguishable without importing `@browsercore/proxy`:

```typescript
import { FetchProxyError } from "browsersmith";

try {
    await client.fetch("https://example.com");
} catch (err) {
    if (err instanceof FetchProxyError) {
        console.error("proxy failed:", err.proxyKind, err.message); // e.g. "ProxyAuthError"
    }
}
```

## Architecture

```
@browsercore/contracts (shared interfaces + Platform service contracts)
        ▲
        │
  ┌──────┼─────────────────────────────┐
  │      │                             │
  ▼      ▼                             ▼
transport   tls   http1   http2   http3   quic   fetch   crypto   compression
  │         │      │       │       │       │       │        │         │
  └─────────┴──────┴───────┴───────┴───────┴───────┴────────┴─────────┘
                                    ▼
                           browsersmith (composition root — builds Platform)
```

## Platform — the composition root

The `Platform` object groups runtime capabilities **per-service**, then
per-runtime. Adding a new runtime (Bun, Deno, Workers) means implementing
each service's interfaces — no protocol package changes. Every bundle is
OPTIONAL (contracts 0.2.6+): a platform carries exactly the capabilities its
runtime has; consumers resolve the bundle they use and name it when missing.

```ts
interface Platform {
    readonly network?: Network;         // tcp + dns + udp factory (each optional)
    readonly crypto?: Crypto;           // provider (single randomness source)
    readonly compression?: Compression; // gzip/deflate/brotli sync shape
    readonly events?: EventProvider;    // EventTarget-backed emitter
    readonly telemetry?: Telemetry;     // logger + tracer + metrics
    readonly time?: Time;               // Time ≡ Clock — the canonical time contract
}
```

### The default platform is LAZY

`import { platform } from "browsersmith"` works exactly as before — but the
Platform is no longer assembled at module load. The export is a forwarding
view with a getter per bundle over a memoized instance built on **first
access** (the replaceability audit's module-load side-effect finding):
importing the package performs zero adapter work, cold starts on
Workers/edge don't pay for Node adapters they never touch, and bundlers can
tree-shake the assembly (and the adapters behind it) when nothing reads it.
The `nodeEventProvider` singleton is lazy the same way — no `EventEmitter`
until the first call.

### `browsersmith/core` — the runtime-free entry

```ts
import { fetch, createClient, PROFILES } from "browsersmith/core";
```

The `./core` subpath exports ONLY the platform-neutral surface — the `fetch()`
composition, browser profiles, the cookie jar, and the `@browsercore/contracts`
types (`Platform`, `Net`, `UdpSocketFactory`, `Clock`, …) an edge consumer
composes against. Zero Node built-in imports (the release gate greps the built
entry and requires zero hits), no platform adapters, no `crawl()`. Node
consumers should use the main entry — `./core` exists for runtimes composing
their own Platform.

**Cloudflare Workers recipe** — `browsersmith/platform-workers` composition is
simply `@browsercore/fetch` + `@browsercore/platform-workers` (install both;
browsersmith cross-links, not re-exports, so the Node adapters never enter an
edge bundle graph):

```ts
import { platformWorkers } from "@browsercore/platform-workers";
import { createClient } from "@browsercore/fetch";

const client = createClient({ profile: "chrome-140", platform: platformWorkers() });
```

### Injected TLS handshake engine (HTTP/3 path)

`@browsercore/quic` consumes the contracts `TlsHandshakeEngine` interface —
never `@browsercore/tls` directly (the no-hard-wires invariant). browsersmith
supplies the implementation and passes it explicitly at every `connectQuic`
call site, so quic's deprecated dynamic-import default never runs for
browsersmith consumers:

```ts
import { connectQuic, createTlsHandshakeEngine } from "browsersmith";

const quic = await connectQuic({
    /* transport, peer, ids, timeouts … */
    handshakeEngine: createTlsHandshakeEngine(), // @browsercore/tls, wrapped
});
```

### UDP is a factory, not a socket

`nodeUdp` implements `UdpSocketFactory`: `connect(address)` binds a FRESH
ephemeral `node:dgram` socket (udp4/udp6 by address family) per call and
returns a `DatagramTransport` view; `close()` releases that one socket. There
is no module-scope socket and no import-time bind — two concurrent QUIC
"connections" never share a receive queue, and a UDP-less runtime can omit
the bundle entirely.

### Platform services (in `src/platform/`)

| Service | Node adapter | Contract |
|---------|-------------|----------|
| **network** | `network/node/{net,dns,udp}.ts` | `Network { tcp, dns, udp: UdpSocketFactory }` |
| **crypto** | `crypto/node/node-crypto-provider.ts` | `Crypto { provider }` |
| **compression** | `compression/node/compression.ts` | `Compression` |
| **events** | `events/node/event-provider.ts` (lazy singleton) | `EventProvider` |
| **telemetry** | `telemetry/noop/no-op-telemetry.ts` | `NoOpTelemetry` (default) |
| **time** | `time/node/time.ts` | `Time ≡ Clock` (`now`/`monotonic`/`sleep`/`setTimeout`/`clearTimeout`) |

## Packages

### Leaf packages (no `node:*` imports)
| Package | Purpose |
|---------|---------|
| **@browsercore/contracts** [![npm version](https://img.shields.io/npm/v/@browsercore/contracts)](https://www.npmjs.com/package/@browsercore/contracts) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-contracts/badge.json)](https://jverneuer.github.io/browsercore-contracts/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-contracts/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-contracts/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/contracts.svg)](https://github.com/jverneuer/browsercore-contracts/blob/main/LICENSE) | Shared interfaces, Platform service contracts, models, IANA codes |
| **@browsercore/crypto** [![npm version](https://img.shields.io/npm/v/@browsercore/crypto)](https://www.npmjs.com/package/@browsercore/crypto) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-crypto/badge.json)](https://jverneuer.github.io/browsercore-crypto/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-crypto/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-crypto/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/crypto.svg)](https://github.com/jverneuer/browsercore-crypto/blob/main/LICENSE) | Pure types, errors, utils (Node backend in browsersmith) |
| **@browsercore/transport** [![npm version](https://img.shields.io/npm/v/@browsercore/transport)](https://www.npmjs.com/package/@browsercore/transport) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-transport/badge.json)](https://jverneuer.github.io/browsercore-transport/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-transport/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-transport/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/transport.svg)](https://github.com/jverneuer/browsercore-transport/blob/main/LICENSE) | TCP + DNS byte stream (event backend injected) |
| **@browsercore/compression** [![npm version](https://img.shields.io/npm/v/@browsercore/compression)](https://www.npmjs.com/package/@browsercore/compression) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-compression/badge.json)](https://jverneuer.github.io/browsercore-compression/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-compression/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-compression/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/compression.svg)](https://github.com/jverneuer/browsercore-compression/blob/main/LICENSE) | Pure types, errors, utils (Node backend in browsersmith) |
| **@browsercore/cookies** [![npm version](https://img.shields.io/npm/v/@browsercore/cookies)](https://www.npmjs.com/package/@browsercore/cookies) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-cookies/badge.json)](https://jverneuer.github.io/browsercore-cookies/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-cookies/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-cookies/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/cookies.svg)](https://github.com/jverneuer/browsercore-cookies/blob/main/LICENSE) | RFC 6265 cookie jar |

### Layer 1 (protocol primitives)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/tls** [![npm version](https://img.shields.io/npm/v/@browsercore/tls)](https://www.npmjs.com/package/@browsercore/tls) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-tls/badge.json)](https://jverneuer.github.io/browsercore-tls/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-tls/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-tls/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/tls.svg)](https://github.com/jverneuer/browsercore-tls/blob/main/LICENSE) | transport, contracts | TLS 1.3 (with 1.2 fallback), JA3/JA4 |
| **@browsercore/http1** [![npm version](https://img.shields.io/npm/v/@browsercore/http1)](https://www.npmjs.com/package/@browsercore/http1) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-http1/badge.json)](https://jverneuer.github.io/browsercore-http1/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-http1/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-http1/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/http1.svg)](https://github.com/jverneuer/browsercore-http1/blob/main/LICENSE) | transport, contracts | HTTP/1.1 client |
| **@browsercore/http2** [![npm version](https://img.shields.io/npm/v/@browsercore/http2)](https://www.npmjs.com/package/@browsercore/http2) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-http2/badge.json)](https://jverneuer.github.io/browsercore-http2/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-http2/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-http2/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/http2.svg)](https://github.com/jverneuer/browsercore-http2/blob/main/LICENSE) | transport, contracts | HTTP/2 framing, HPACK, stream multiplexing |
| **@browsercore/proxy** [![npm version](https://img.shields.io/npm/v/@browsercore/proxy)](https://www.npmjs.com/package/@browsercore/proxy) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-proxy/badge.json)](https://jverneuer.github.io/browsercore-proxy/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-proxy/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-proxy/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/proxy.svg)](https://github.com/jverneuer/browsercore-proxy/blob/main/LICENSE) | contracts | HTTP CONNECT + SOCKS5/5h proxy tunnels |
| **@browsercore/profiles** [![npm version](https://img.shields.io/npm/v/@browsercore/profiles)](https://www.npmjs.com/package/@browsercore/profiles) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-profiles/badge.json)](https://jverneuer.github.io/browsercore-profiles/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-profiles/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-profiles/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/profiles.svg)](https://github.com/jverneuer/browsercore-profiles/blob/main/LICENSE) | contracts | Browser fingerprint definitions |
| **@browsercore/platform-workers** [![npm version](https://img.shields.io/npm/v/@browsercore/platform-workers)](https://www.npmjs.com/package/@browsercore/platform-workers) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-platform-workers/badge.json)](https://jverneuer.github.io/browsercore-platform-workers/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-platform-workers/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-platform-workers/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/platform-workers.svg)](https://github.com/jverneuer/browsercore-platform-workers/blob/main/LICENSE) | contracts | Cloudflare Workers platform adapter — browser-identical TLS on Workers (pure-noble crypto, cloudflare:sockets shim) |

### Layer 2 (composed protocols)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/quic** [![npm version](https://img.shields.io/npm/v/@browsercore/quic)](https://www.npmjs.com/package/@browsercore/quic) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-quic/badge.json)](https://jverneuer.github.io/browsercore-quic/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-quic/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-quic/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/quic.svg)](https://github.com/jverneuer/browsercore-quic/blob/main/LICENSE) | crypto, tls, contracts | QUIC transport (RFC 9000) |
| **@browsercore/fetch** [![npm version](https://img.shields.io/npm/v/@browsercore/fetch)](https://www.npmjs.com/package/@browsercore/fetch) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-fetch/badge.json)](https://jverneuer.github.io/browsercore-fetch/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-fetch/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-fetch/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/fetch.svg)](https://github.com/jverneuer/browsercore-fetch/blob/main/LICENSE) | http1, http2, profiles, contracts | Composes layers into `fetch()` API |
| **@browsercore/crawlee** [![npm version](https://img.shields.io/npm/v/@browsercore/crawlee)](https://www.npmjs.com/package/@browsercore/crawlee) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-crawlee/badge.json)](https://jverneuer.github.io/browsercore-crawlee/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-crawlee/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-crawlee/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/crawlee.svg)](https://github.com/jverneuer/browsercore-crawlee/blob/main/LICENSE) | crawlee, fetch | Crawlee HttpClient adapter — wire-level browser impersonation inside Crawlee |

### Layer 3
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/http3** [![npm version](https://img.shields.io/npm/v/@browsercore/http3)](https://www.npmjs.com/package/@browsercore/http3) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-http3/badge.json)](https://jverneuer.github.io/browsercore-http3/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-http3/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-http3/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/http3.svg)](https://github.com/jverneuer/browsercore-http3/blob/main/LICENSE) | quic, transport, contracts | HTTP/3 framing + QPACK |

### Entrypoint & tooling
| Package | Purpose |
|---------|---------|
| **browsersmith** [![npm version](https://img.shields.io/npm/v/browsersmith)](https://www.npmjs.com/package/browsersmith) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsersmith/badge.json)](https://jverneuer.github.io/browsersmith/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsersmith/ci.yml?label=ci)](https://github.com/jverneuer/browsersmith/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/browsersmith.svg)](https://github.com/jverneuer/browsersmith/blob/main/LICENSE) | Composition root + customer-facing entrypoint, `crawl()` helper |
| **@browsercore/devtools** [![npm version](https://img.shields.io/npm/v/@browsercore/devtools)](https://www.npmjs.com/package/@browsercore/devtools) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-devtools/badge.json)](https://jverneuer.github.io/browsercore-devtools/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-devtools/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-devtools/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/devtools.svg)](https://github.com/jverneuer/browsercore-devtools/blob/main/LICENSE) | Packet inspector, visualizers, CLI |
| **@browsercore/testing** [![npm version](https://img.shields.io/npm/v/@browsercore/testing)](https://www.npmjs.com/package/@browsercore/testing) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-testing/badge.json)](https://jverneuer.github.io/browsercore-testing/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-testing/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-testing/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@browsercore/testing.svg)](https://github.com/jverneuer/browsercore-testing/blob/main/LICENSE) | Golden captures, protocol verification |
| **@browsercore/dev** [![npm version](https://img.shields.io/npm/v/@browsercore/dev)](https://www.npmjs.com/package/@browsercore/dev) [![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-dev/badge.json)](https://jverneuer.github.io/browsercore-dev/COVERAGE.md) [![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-dev/build.yml?label=ci)](https://github.com/jverneuer/browsercore-dev/actions/workflows/build.yml) [![license](https://img.shields.io/npm/l/@browsercore/dev.svg)](https://github.com/jverneuer/browsercore-dev/blob/main/LICENSE) | Shared build, lint, test, coverage tooling |

## Data Flow

```
BrowserProfile (contracts/ — strings + arrays)
  → profileToTlsConfig() (fetch/profile.ts)
    → ClientHelloConfig (tls/)
      → cipherSuiteToWire() (tls/handshake/client-hello.ts)
        → uses CIPHER_SUITE_CODES (contracts/)
```

## ALPN-Driven Protocol Dispatch

```
TLS ALPN result
  → "h2" → HTTP/2 with profile-seeded SETTINGS
  → else → HTTP/1.1 with profile-ordered headers
```

HTTP/3 is opt-in via the `crawl()` helper's `http3` factory — not yet part of the default ALPN dispatch.

## Commands

Run from each package's directory:

```sh
npm run build        # tsc (emit to dist/)
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint --type-aware src/
npm test             # vitest run
npx vitest run --coverage   # coverage report (≥93% threshold)
```

## Coverage

Each package enforces a 93% coverage threshold (statements, branches, functions, lines).

## Coding Standards

Every `@browsercore/*` package enforces shared `CODING_STANDARDS.md` rules:

- **Strict mode always** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are non-negotiable
- **No `any`** — external data is `unknown`, then validated
- **Discriminated unions for state** — no nullable-field combos
- **Branded ID types** — `StreamId`, `ConnectionId`, `SessionId` are opaque branded types
- **Interfaces for domain objects, type aliases for states/constraints**
- **Immutable data + `readonly`** everywhere
- **Exhaustive switches** with `assertNever(x)` in the default branch

## Contributing

Contributions are very welcome — and not just code. A great bug report, a fingerprint reproduction, a golden capture or a docs fix moves the project forward just as much as a PR.

- **New here?** Read the [contribution guide](CONTRIBUTING.md) — written to get you started in minutes.
- **Questions?** Ask in [Discussions](https://github.com/jverneuer/browsersmith/discussions) — no wrong questions.
- **First issue?** Browse [`good first issue`](https://github.com/jverneuer/browsersmith/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
- **Security?** Report privately via [SECURITY.md](SECURITY.md) — never in a public issue.
