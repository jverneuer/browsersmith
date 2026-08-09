![header](docs/browsersmith.png)

---

[![npm version](https://img.shields.io/npm/v/browsersmith)](https://www.npmjs.com/package/browsersmith)
[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsersmith/badge.json)](https://github.com/jverneuer/browsersmith/blob/main/COVERAGE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsersmith/ci.yml?label=CI)](https://github.com/jverneuer/browsersmith/actions/workflows/ci.yml)

A TypeScript networking stack that impersonates real browsers at the wire level.
Composes independently published `@browsercore/*` packages into a single `fetch()`
whose TLS ClientHello (JA3/JA4), HTTP/2 SETTINGS, and header ordering match
Chrome or Firefox byte-for-byte, defeating bot-detection services.

browsersmith is the **composition root** — the only package allowed `node:*`
imports. It builds a single `Platform` object that threads runtime capabilities
down through options, making every protocol package runtime-agnostic and
independently swappable.

## What it does

```typescript
import { fetch, createClient } from "browsersmith";

// One-shot fetch with a real browser fingerprint:
const response = await fetch("https://example.com", { profile: "chrome-140" });

// Reusable client for connection pooling:
const client = createClient({ profile: "chrome-140" });
try {
    const r1 = await client.fetch("https://example.com");
    const r2 = await client.fetch("https://example.com/api", { method: "POST" });
} finally {
    await client.close();
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

## Platform

The `Platform` object groups runtime capabilities **per-service**, then
per-runtime. Adding a new runtime (Bun, Deno, Workers) means implementing
each service's interfaces — no protocol package changes.

```ts
interface Platform {
    readonly network: Network;         // tcp + dns + udp
    readonly crypto: Crypto;           // provider (single randomness source)
    readonly compression: Compression; // gzip/deflate/brotli sync shape
    readonly events: EventProvider;    // EventTarget-backed emitter
    readonly telemetry: Telemetry;     // logger + tracer + metrics
    readonly time: Time;               // clock + scheduler (composable deadlines)
}
```

### Platform services (in `src/platform/`)

| Service | Node adapter | Contract |
|---------|-------------|----------|
| **network** | `network/node/{net,dns,udp}.ts` | `Network { tcp, dns, udp }` |
| **crypto** | `crypto/node/node-crypto-provider.ts` | `Crypto { provider }` |
| **compression** | `compression/node/compression.ts` | `Compression` |
| **events** | `events/node/event-provider.ts` | `EventProvider` |
| **telemetry** | `telemetry/noop/no-op-telemetry.ts` | `NoOpTelemetry` (default) |
| **time** | `time/node/time.ts` | `Time { clock, scheduler }` |

## Packages

### Leaf packages (no `node:*` imports)
| Package | Purpose |
|---------|---------|
| **@browsercore/contracts** | Shared interfaces, Platform service contracts, models, IANA codes |
| **@browsercore/crypto** | Pure types, errors, utils (Node backend in browsersmith) |
| **@browsercore/transport** | TCP + DNS byte stream (event backend injected) |
| **@browsercore/compression** | Pure types, errors, utils (Node backend in browsersmith) |
| **@browsercore/cookies** | RFC 6265 cookie jar |

### Layer 1 (protocol primitives)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/tls** | transport, contracts | TLS 1.3 (with 1.2 fallback), JA3/JA4 |
| **@browsercore/http1** | transport, contracts | HTTP/1.1 client |
| **@browsercore/http2** | transport, contracts | HTTP/2 framing, HPACK, stream multiplexing |
| **@browsercore/profiles** | contracts | Browser fingerprint definitions |

### Layer 2 (composed protocols)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/quic** | crypto, tls, contracts | QUIC transport (RFC 9000) |
| **@browsercore/fetch** | http1, http2, profiles, contracts | Composes layers into `fetch()` API |

### Layer 3
| Package | Depends on | Purpose |
|---------|------------|---------|
| **@browsercore/http3** | quic, transport, contracts | HTTP/3 framing + QPACK |

### Entrypoint & tooling
| Package | Purpose |
|---------|---------|
| **browsersmith** | Composition root + customer-facing entrypoint, `crawl()` helper |
| **@browsercore/devtools** | Packet inspector, visualizers, CLI |
| **@browsercore/testing** | Golden captures, protocol verification |

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
