# CycleTLS (Danny-Dasilva/CycleTLS)

**Repository:** https://github.com/Danny-Dasilva/CycleTLS
**Language:** Go core with Node.js bindings (spawns Go subprocess)
**License:** GPL-3.0
**Stars:** ~2,000

## Overview

CycleTLS is a **TLS/JA3 fingerprint spoofing library** that runs a Go core (built on `utls` and `tls-client`) and exposes a Node.js API via subprocess communication. It supports JA4R (raw JA4 format), HTTP/2 fingerprinting, and QUIC, and provides WebSocket, SSE, streaming, and custom header ordering. It's one of the few libraries that explicitly supports JA4R for fine-grained fingerprint control, giving callers more precision than JA3 string matching.

## Architecture

```
Node.js code
  ↓
CycleTLS Node.js API
  ↓
Subprocess communication (stdin/stdout JSON)
  ↓
Go core — built on utls + custom HTTP client
  ↓
Browser profile configs (utls-based ClientHello specs)
  ↓
OS TCP/IP stack
```

The Go core runs as a **long-lived subprocess** spawned by the Node.js bindings. Communication is via JSON over stdin/stdout, making it easy to integrate with any Node.js project but introducing subprocess overhead.

## Browser Coverage

| Browser | Support |
|---------|---------|
| Chrome | Multiple versions (via JA3 strings and profile configs) |
| Firefox | Multiple versions |
| Safari | Multiple versions |
| Edge | Supported |
| Custom | Any JA3/JA4 string |

Profiles are identified by **JA3 strings** or **JA4 strings**, rather than named browser profiles. This gives fine-grained control but requires callers to know the exact fingerprint they want.

## API Surface

### Node.js

```js
const cycleTLS = require("cycletls");

// Initialize with default profile
const session = await cycleTLS();

// Make a request
const response = await session.get("https://example.com", {
  ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
  userAgent: "Mozilla/5.0 ...",
  headers: { ... },
});

console.log(response.status, response.body);

// WebSocket support
const ws = await cycleTLS.websocket("wss://echo.websocket.org", {
  ja3: "771,...",
});

// SSE / streaming
const stream = await cycleTLS.sse("https://example.com/sse", { ja3: "..." });

// Close the Go subprocess
await session.close();
```

### JA4R Support

```js
// JA4R (raw JA4) gives more precise control than JA3
// Format: <protocol>_<ciphers>_<extensions>_<versions>_<user_agent>
await session.get(url, {
  ja4r: "t1313000_..._...",  // raw JA4 format
});
```

### JA3 String Matching

```js
// Common JA3 strings used in the community
const CHROME_JA3 = "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0";
const FIREFOX_JA3 = "771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0";

await session.get(url, { ja3: CHROME_JA3 });
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4/JA4R)
- Cipher suites (via JA3 string or profile config)
- TLS extensions (via JA3 string or profile config)
- Supported groups / curves
- Signature algorithms
- GREASE
- ALPN
- Session tickets
- Supported versions
- JA4R raw format for fine-grained control

### HTTP/2
- SETTINGS frame values
- WINDOW_UPDATE initial value
- Pseudo-header order
- Stream priority

### HTTP/1.1
- Custom header ordering
- User-Agent
- Accept-Language
- Cookie handling

### QUIC / HTTP/3
- QUIC transport parameters
- HTTP/3 SETTINGS
- JA4 fingerprinting for QUIC

## Unique Features

### 1. JA4R (Raw JA4) Format Support

CycleTLS is one of the few libraries that explicitly supports **JA4R** — the raw, unhashed form of JA4. While JA3 is a simple comma-separated string of numbers, JA4 is a structured format that mixes human-readable text with hashed segments. JA4R goes further by providing the raw, structured data before hashing. This gives callers **precise control** over individual fingerprint components without needing to reverse-engineer the hash.

### 2. Go Subprocess Architecture

The Go core runs as a subprocess, communicating via JSON over stdin/stdout. This is a pragmatic approach that:
- Lets the Node.js API reuse Go's superior TLS fingerprinting (utls)
- Avoids native addon compilation (no node-gyp, no prebuilds)
- Introduces subprocess overhead (latency, memory) but keeps the API simple

### 3. WebSocket with TLS Impersonation

CycleTLS carries the browser's TLS fingerprint into the WebSocket handshake, ensuring the WebSocket connection matches the HTTP session's fingerprint. Many libraries drop fingerprinting on WebSocket upgrade.

### 4. SSE / Streaming Support

CycleTLS provides first-class support for Server-Sent Events (SSE) with TLS impersonation, maintaining the fingerprint across the long-lived SSE connection.

### 5. JA3 String Profiles

Instead of named browser profiles, CycleTLS uses JA3 strings as the primary identifier. This is a lower-level approach that gives callers direct control over the exact fingerprint, at the cost of requiring them to know the JA3 string for their target browser.

## What browsercore Can Learn

- **JA4R support** — JA4R is the most precise way to specify a TLS fingerprint. browsercore should consider supporting JA4R as an import/export format for profiles, allowing callers to verify their profiles against external JA4R references.
- **WebSocket fingerprint continuity** — the practice of carrying the TLS fingerprint into the WebSocket handshake is important. browsercore's HTTP/3 and WebSocket support should maintain fingerprint consistency across protocol upgrades.
- **Go subprocess pattern** — the subprocess architecture (Go core + Node.js bindings) is an alternative to browsercore's pure-TypeScript approach. It trades performance for access to Go's mature TLS fingerprinting ecosystem.
- **JA3/JA4 as profile identifiers** — using fingerprint strings as profile identifiers is a more precise approach than named profiles, but it shifts the burden of correctness to the caller. browsercore's named profiles with versioned constants (`CHROME_140`) are more ergonomic but less precise.
- **QUIC fingerprinting** — CycleTLS's QUIC fingerprinting support shows that fingerprint signals extend beyond TLS into the QUIC transport layer. browsercore's QUIC implementation should account for this.

## Key Source Files

| File | Purpose |
|------|---------|
| `cycletls.go` | Go core — main entry point, HTTP client, TLS config |
| `main.go` | Go subprocess entry point — reads JSON from stdin, writes JSON to stdout |
| `src/index.ts` | Node.js bindings — spawns Go subprocess, communicates via JSON |
| `src/websocket.ts` | WebSocket support with TLS impersonation |
| `src/sse.ts` | SSE / streaming support |
| `src/cycle.ts` | Main CycleTLS session type |
| `src/types.ts` | TypeScript types for request/response |
| `package.json` | Node.js package config — includes prebuilt Go binaries |
| `dist/` | Compiled Node.js bindings |

## References

- [GitHub](https://github.com/Danny-Dasilva/CycleTLS)
- [npm](https://www.npmjs.com/package/cycletls)
- [Go core](https://github.com/Danny-Dasilva/CycleTLS/blob/main/cycletls.go)
- [Node.js bindings](https://github.com/Danny-Dasilva/CycleTLS/blob/main/src/index.ts)
- [WebSocket support](https://github.com/Danny-Dasilva/CycleTLS/blob/main/src/websocket.ts)
- [utls](https://github.com/refraction-networking/utls) — underlying TLS engine
- [tls-client](https://github.com/bogdanfinn/tls-client) — underlying HTTP client
