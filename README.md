# browsersmith

[![npm version](https://img.shields.io/npm/v/browsersmith)](https://www.npmjs.com/package/browsersmith)
[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsersmith/badge.json)](https://github.com/jverneuer/browsersmith/blob/main/COVERAGE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsersmith/ci.yml?label=CI)](https://github.com/jverneuer/browsersmith/actions/workflows/ci.yml)

A TypeScript networking stack that impersonates real browsers at the wire level.
Composes independently published `@browsercore/*` packages into a single `fetch()`
whose TLS ClientHello (JA3/JA4), HTTP/2 SETTINGS, and header ordering match
Chrome or Firefox byte-for-byte, defeating bot-detection services.

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

The monorepo follows a strict layered architecture. Dependencies flow downward —
a package may only import from packages below it in the graph.

```
@browsercore/contracts (shared interfaces, models, IANA codes, options)
        ▲
        │
 ┌──────┼─────────────┬──────────┐
 │      │             │          │
 ▼      ▼             ▼          ▼
tls    http2       transport   profiles
 │       │             │          │
 └───────┴──────┬──────┘          │
                │                 │
                ▼                 │
         @browsercore/quic ◄──────┘
                │
                ▼
        @browsercore/http3
                │
                ▼
      @browsercore/fetch
                │
                ▼
    @browsercore/browsersmith (entrypoint)
```

## Packages

### Leaf packages (no internal dependencies)
| Package | Purpose |
|---------|---------|
| **@browsercore/contracts** | Shared interfaces, models, IANA wire codes, options |
| **@browsercore/crypto** | AEAD, HKDF, X25519, hashing |
| **@browsercore/transport** | TCP + DNS byte stream |
| **@browsercore/compression** | gzip/deflate/brotli/zstd |
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
| **browsersmith** | Customer-facing entrypoint, `crawl()` helper |
| **@browsercore/devtools** | Packet inspector, visualizers, CLI |
| **@browsercore/testing** | Golden captures, protocol verification |

## Provider Interfaces

The stack uses three provider interfaces to decouple protocol logic from platform I/O:

| Interface | Package | Backend | What it abstracts |
|-----------|---------|---------|-------------------|
| `CryptoProvider` | `@browsercore/crypto` | `NodeCryptoProvider` → `node:crypto` | AEAD, HKDF, hashing, X25519, signatures |
| `CompressionProvider` | `@browsercore/compression` | `NodeZlibProvider` → `node:zlib` | gzip/deflate/brotli/zstd |
| `Transport` | `@browsercore/transport` | `TcpTransport` → `node:net` + `node:dns` | Reliable ordered byte stream |

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
