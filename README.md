# browsercore

[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsersmith/badge.json)](https://github.com/jverneuer/browsersmith/blob/main/COVERAGE.md)

A TypeScript networking stack that impersonates real browsers at the wire level. Composes independently published `@browsercore/*` packages into a single `fetch()` whose TLS ClientHello (JA3/JA4), HTTP/2 SETTINGS, and header ordering match Chrome or Firefox byte-for-byte, defeating bot-detection services.

## Architecture

The monorepo follows a strict layered architecture. Dependencies flow downward — a package may only import from packages below it in the graph.

```
@browsercore/contracts (shared interfaces, models, options)
        ▲
        │
 ┌──────┼─────────────┐
 │      │             │
 ▼      ▼             ▼
tls    http2       transport
 │       │             │
 └───────┴─────────────┘
         ▼
  @browsercore/browsersmith (entrypoint)
```

## Package Dependency Graph

### Leaf packages (no internal dependencies)
| Package | External deps | Purpose |
|---------|---------------|---------|
| **crypto** | @noble/curves | AEAD, HKDF, X25519, hashing |
| **transport** | _(none)_ | TCP + DNS byte stream |
| **compression** | _(none)_ | gzip/deflate/brotli/zstd |
| **cookies** | _(none)_ | RFC 6265 cookie jar |
| **profiles** | _(none)_ | Browser fingerprint definitions (pure data) |

### Layer 1 (protocol primitives)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **tls** | transport | TLS 1.3 (with 1.2 fallback), JA3/JA4 source |
| **http1** | transport | HTTP/1.1 client |
| **http2** | transport | HTTP/2 framing, HPACK, stream multiplexing |

### Layer 2 (composed protocols)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **quic** | crypto, tls | QUIC transport (RFC 9000) |
| **fetch** | compression, cookies, crypto, http1, http2, profiles, tls, transport | Composes layers into fetch() API |

### Layer 3 (HTTP/3)
| Package | Depends on | Purpose |
|---------|------------|---------|
| **http3** | quic, transport | HTTP/3 framing + QPACK over QUIC streams |

### Entrypoint
| Package | Depends on | Purpose |
|---------|------------|---------|
| **browsersmith** | All @browsercore/* packages | Customer-facing entrypoint, crawl() helper |

### Tooling
| Package | Depends on | Purpose |
|---------|------------|---------|
| **devtools** | cookies, crypto, fetch, http1, http2, profiles, tls, transport | Packet inspector, visualizers, CLI |

## The Contracts Package

**@browsercore/contracts** (`browsercore-api` repo) is the public SDK surface — every type that defines how BrowserCore components communicate.

### Litmus Test

> **"Could another package reasonably import this type?"**

| Answer | Where it belongs |
|--------|------------------|
| YES | `@browsercore/contracts` |
| NO (only one protocol touches it) | The protocol package |

### Examples

| Type | Belongs to | Why |
|------|------------|-----|
| `Cookie` | contracts | cookies, fetch, browsersmith all use it |
| `Headers` | contracts | Every HTTP protocol package uses it |
| `Request` / `Response` | contracts | fetch, http1, http2, http3 all handle them |
| `BrowserProfile` | contracts | Shared across all protocol packages |
| `Transport` | contracts | tls, http1, http2 all consume it |
| `FetchClient` | contracts | browsersmith consumes it |
| `ClientHello` | **tls** | Only TLS implementation touches it |
| `TlsRecord` | **tls** | Only TLS implementation touches it |
| `SettingsFrame` | **http2** | Only HTTP/2 implementation touches it |
| `QuicPacket` | **quic** | Only QUIC implementation touches it |

### Three Categories

#### 1. Contracts (interfaces that define the API)
Types that multiple packages implement or consume:
- **Providers**: `CryptoProvider`, `CompressionProvider`, `Transport`, `DatagramTransport`
- **Connections**: `TlsConnection`, `Http1Connection`, `Http2Connection`, `Http3Connection`, `QuicConnection`
- **Clients**: `FetchClient`, `CookieJar`
- **Cross-cutting**: `Logger`, `Clock`, `PacketCallback`

#### 2. Models (shared data structures)
Plain data with no behavior:
- `BrowserProfile`, `TlsProfile`, `Http1Profile`, `Http2Profile`
- `Request`, `Response`, `FetchResponse`, `Headers`
- `Cookie`, identifiers, state types

#### 3. Options (configuration)
Configuration passed to protocol packages:
- `TlsOptions`, `Http1Options`, `Http2Options`, `Http3Options`, `QuicOptions`, `FetchClientOptions`

## Provider Interfaces (Dependency Injection)

The stack uses three provider interfaces to decouple protocol logic from platform I/O:

| Interface | Package | Backend | What it abstracts |
|-----------|---------|---------|-------------------|
| `CryptoProvider` | `@browsercore/crypto` | `NodeCryptoProvider` → `node:crypto` | AEAD, HKDF, hashing, X25519, signature verification |
| `CompressionProvider` | `@browsercore/compression` | `NodeZlibCompressionProvider` → `node:zlib` | gzip/deflate/brotli/zstd encode + decode |
| `Transport` | `@browsercore/transport` | `TcpTransport` → `node:net` + `node:dns` | Reliable ordered byte stream with backpressure |

## Cross-cutting Abstractions

### Logger
All protocol packages use the `Logger` interface from [ts-log](https://www.npmjs.com/package/ts-log):

```typescript
import { Logger, dummyLogger } from "ts-log";

// In options:
readonly logger?: Logger;  // undefined = silent (dummyLogger)
```

- `dummyLogger` — no-op, the default
- `devLogger` — forwards to `console` (opt-in)

### Clock
Time-source abstraction for deterministic tests:

```typescript
interface Clock {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): () => void;
}

const systemClock: Clock;  // Production default
```

### Packet Inspection
Optional callback for live packet capture:

```typescript
type PacketCallback = (frame: ProtocolFrame) => void;

interface PacketInspectionOptions {
    readonly onPacket?: PacketCallback;  // undefined = no capture
}
```

When set, protocol packages emit frames for every packet sent/received. When undefined, zero overhead.

## Data Flow

```
BrowserProfile (profiles/ — strings + arrays)
  → profileToTlsConfig() (fetch/profile.ts)
    → ClientHelloConfig (tls/)
      → cipherSuiteToWire() (tls/handshake/client-hello.ts)
```

## ALPN-Driven Protocol Dispatch

After TLS negotiation, the ALPN result determines the HTTP version:

```
TLS ALPN result
  → "h2" → HTTP/2 with profile-seeded SETTINGS
  → else → HTTP/1.1 with profile-ordered headers
```

HTTP/3 is opt-in via the `crawl()` helper's `http3` factory — not yet part of the default ALPN dispatch.

## Design Principles

1. **Layered architecture** — Dependencies flow downward only
2. **Provider abstraction** — Protocol logic never imports Node built-ins directly
3. **Dependency injection** — Clock, Logger, and packet callbacks are injected for testability
4. **Zero-cost defaults** — Optional callbacks (Logger, onPacket) have negligible overhead when unset
5. **Contract-first** — Shared types live in `@browsercore/contracts`, protocol packages implement them

## Commands

All commands run from each package's directory:

```sh
npm run build        # tsc (emit to dist/)
npm run typecheck    # tsc --noEmit (type-check only)
npm run lint         # oxlint --type-aware src/
npm test             # vitest run
```

## Coverage

Each package enforces a 94% coverage threshold (statements, branches, functions, lines).

```sh
npx vitest run --coverage
```

## TypeScript Coding Standards

Every `@browsercore/*` package enforces shared `CODING_STANDARDS.md` rules:

- **Strict mode always** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are non-negotiable
- **No `any`** — external data is `unknown`, then validated
- **Discriminated unions for state** — no nullable-field combos
- **Branded ID types** — `StreamId`, `ConnectionId`, `SessionId` are opaque branded types
- **Interfaces for domain objects, type aliases for states/constraints**
- **Immutable data + `readonly`** everywhere
- **Zod validation at every boundary**
- **Exhaustive switches** with `assertNever(x)` in the default branch
