# Architecture

How the 14 `@browsercore/*` packages stack into one browser-accurate `fetch()` — the layer cake, what swaps at which layer, and where the fingerprint actually lives on the wire.

## The layer cake

```
┌─────────────────────────────────────────────────────────────────────┐
│ browsersmith                       umbrella + PROFILES + crawl()    │
│   ↑ re-exports fetch, createClient, cookies, http3, quic            │
├─────────────────────────────────────────────────────────────────────┤
│ @browsercore/fetch                 fetch-shaped API + cookies       │
├─────────────────────────────────────────────────────────────────────┤
│ @browsercore/http3  (experimental) HTTP/3 frames + QPACK            │
├─────────────────────────────────────────────────────────────────────┤
│ @browsercore/http1   @browsercore/http2   @browsercore/quic         │
│ HTTP/1.1 + headers   HTTP/2 + SETTINGS   QUIC packets + streams     │
├─────────────────────────────────────────────────────────────────────┤
│ @browsercore/tls     @browsercore/compression   @browsercore/cookies│
│ TLS 1.3 handshake    gzip / deflate / brotli      CookieJar         │
├─────────────────────────────────────────────────────────────────────┤
│ @browsercore/transport  @browsercore/crypto   @browsercore/profiles │
│ TCP / in-memory          WebCrypto wrapper     pure profile data    │
└─────────────────────────────────────────────────────────────────────┘
```

Read from the bottom up. The five leaf packages (`transport`, `crypto`, `compression`, `cookies`, `profiles`) have **zero `@browsercore/*` dependencies** — they touch only `node:net` + `node:dns`, `node:crypto`, `node:zlib`, `node:fs/promises`, and pure data. Every layer above composes from below. `browsersmith` itself is the thinnest layer: a re-export facade plus the curated `PROFILES` constant and the `crawl()` helper. It owns no protocol logic.

Everything below `browsersmith` is independently installable. Want a raw TCP `Transport` for a non-HTTP use case? `npm install @browsercore/transport`. Want to forge TLS `ClientHello`s for research? `import { connectTls, buildClientHello } from "@browsercore/tls"` and never touch `fetch`. See [packages.md](./packages.md) for the per-package tour.

## Why modular?

Three reasons, in order of how much they matter.

**Testability.** Each layer is a set of pure functions over explicit inputs — `buildClientHello(config)` takes a `ClientHelloConfig` and returns bytes; `parseServerHello(buf)` takes bytes and returns a structured object. No hidden globals, no ambient `process` access, no I/O smuggled inside the protocol logic. That makes golden-packet regression tests possible: `tests/client-hello-chrome140.test.ts` hard-codes the 16-cipher list and 16-extension order of a real Chrome 140 `ClientHello` and asserts the builder emits them byte-for-byte. The monorepo enforces a 94% coverage gate on every PR.

**Swappability.** The `Transport` interface is the seam. In production it's TCP via `@browsercore/transport`. In tests it's an in-memory `FakeTransport` queue (the same one the in-process `TlsServerSim` drives). Tomorrow it could be a TUN device or a WebRTC datachannel — no layer above `transport` needs to know. The same shape applies to `CompressionProvider` (default wraps `node:zlib`; swap in `WebCompressionStream` or a wasm brotli build) and the crypto provider (default wraps `node:crypto`; a WebCrypto or HSM backend is plausible). No forks required.

**Standalone use.** Security researchers can `import { connectTls, buildClientHello } from "@browsercore/tls"` to craft arbitrary `ClientHello`s, or `import { connectQuic } from "@browsercore/quic"` to drive a raw QUIC connection for HTTP/3 fuzzing. No layer is gated behind the layer above. The leaf packages are public APIs, not internal modules.

## What swaps at which layer

| Layer | Interface | Default impl | Swap-in example |
|---|---|---|---|
| Transport | `Transport` (read / write / close) | `@browsercore/transport` (TCP via `node:net`) | In-memory `FakeTransport` for tests; future: WebRTC datachannel, TUN device |
| Crypto | AEAD / X25519 / ECDH / HKDF / signatures | `@browsercore/crypto` (`node:crypto`) | WebCrypto backend, Rust-native via `napi-rs`, HSM via PKCS#11 |
| Compression | `CompressionProvider` (8 methods) | `@browsercore/compression` (`node:zlib` sync APIs) | `WebCompressionStream`, wasm brotli, test double |
| Datagram | `DatagramTransport` (send / receive datagrams) | caller-supplied UDP socket | in-memory loopback for tests; future: bundled UDP transport |
| Profile | `StarterProfile` data | `@browsercore/profiles` (Chrome 140, Firefox 128) | your own via `registerProfile()` |

The `Transport` seam is the most powerful — it's how the test suite drives the entire stack without a real network. See [examples.md](./examples.md) for the custom-`Transport` recipe.

## Where the fingerprint lives

Four signals, four packages, four config fields. browsersmith's whole value prop is that all four are configurable *and* that the shipped profiles get them all right simultaneously.

- **TLS `ClientHello`** → `@browsercore/tls`. The `ClientHelloConfig.extensionOrder` field is an explicit `number[]` the builder emits **exactly** as given. The source comment calls it out: *"the primary fingerprinting signal, so the order is load-bearing."* The `grease` flag toggles RFC 8701 GREASE injection (cipher list, `supported_versions`, `key_share`, plus 1–2 random GREASE extension types). The cipher suite list is also order-sensitive. JA3 and JA4 are computed from these three fields together.

- **HTTP/1.1 header order** → `@browsercore/http1`. When the server negotiates `http/1.1`, the request line and headers are serialized in the order the profile specifies. Any detector that inspects raw HTTP/1.1 bytes (Cloudflare, DataDome) reads this order.

- **HTTP/2 `SETTINGS` + pseudo-header order** → `@browsercore/http2`. Owns the `SETTINGS` frame values, `WINDOW_UPDATE`, and the `:method :authority :scheme :path` pseudo-header order. Together these produce the Akamai HTTP/2 fingerprint string (`1:65536;...`). HPACK-encoded user headers follow.

- **HTTP/3 + QUIC** (experimental) → `@browsercore/quic` owns the QUIC transport parameters and Initial-packet fingerprint; `@browsercore/http3` owns the HTTP/3 `SETTINGS` frame and QPACK dynamic table.

A profile bundles all four. Pass `profile: PROFILES["chrome-140"]` and browsersmith threads the right `ClientHelloConfig`, HTTP/1.1 header order, and HTTP/2 `SETTINGS` into each layer. See [profiles.md](./profiles.md).

## The HTTP/3 path

HTTP/3 is a **separate code path**, not a flag on the default `fetch()`. The default `fetch()` and `createClient()` use TCP + TLS + HTTP/1.1|HTTP/2 (ALPN-negotiated). HTTP/3 over QUIC is opt-in, and crucially, `@browsercore/fetch` does **not** depend on `@browsercore/http3` or `@browsercore/quic` — those reach the user via the `browsersmith` umbrella's re-export surface, bypassing `fetch()`.

Two entry points:

```typescript
// Option A — via crawl() with an http3 datagram-transport factory.
import { crawl } from "browsersmith";

const results = await crawl({
  urls: ["https://cloudflare.com/cdn-cgi/trace"],
  // Factory returns a DatagramTransport bound to (host, port).
  // browsersmith doesn't ship a UDP transport yet — you bring your own.
  http3: (host, port) => makeUdpTransport({ host, port }),
});
```

```typescript
// Option B — direct leaf-package composition.
import { connectQuic } from "@browsercore/quic";
import { connectHttp3 } from "@browsercore/http3";

const transport = makeUdpTransport({ host: "cloudflare.com", port: 443 });
const quic = await connectQuic({
  transport,
  peer: { address: "cloudflare.com", port: 443, family: "IPv4" },
  serverName: "cloudflare.com",
  initialDcid: randomCid(),
  initialScid: randomCid(),
});
const http3 = await connectHttp3({ quic });
const res = await http3.request({
  method: "GET", scheme: "https", authority: "cloudflare.com", path: "/",
});
```

Current limitations, called out in `src/crawl.ts`:

- One fresh QUIC connection per URL — no connection pooling.
- No cookie-jar coordination across the HTTP/3 path yet.
- The `http3` option takes a datagram-transport **factory**, not a live `QuicConnection`. Each URL gets a clean QUIC handshake; the crawler closes the connection after each request.

Mark this as experimental and unstable — the API will change. See [examples.md](./examples.md) for the full HTTP/3 recipe.

## Data flow of a single `fetch()` call

What happens when you call `await fetch(url, { profile: PROFILES["chrome-140"] })`:

1. **Resolve the profile** via `getProfile("chrome-140")` — returns `{ tls, http1, http2 }` config bundles.
2. **Open a TCP `Transport`** to the resolved host:port via `@browsercore/transport`.
3. **Hand the transport to `connectTls()`** from `@browsercore/tls` along with the TLS profile. Handshake completes (X25519 + secp256r1 + secp384r1 key shares; AES-GCM or ChaCha20-Poly1305 record layer up).
4. **ALPN negotiates** `h2` (or `http/1.1` as fallback).
5. **Dispatch to the protocol layer.** If `h2`: `@browsercore/http2` opens a stream, sends `SETTINGS`, sends `HEADERS` with pseudo-headers in profile order + HPACK-encoded user headers. If `http/1.1`: `@browsercore/http1` writes the request line + headers in profile order.
6. **Response arrives.** `@browsercore/compression` decodes the body if `Content-Encoding` is set (gzip / deflate / brotli, with a browser-tolerant deflate fallback that retries raw inflate on framing failure).
7. **Cookies** (if a `CookieJar` was provided) are parsed and stored; redirects are followed up to the configured limit.
8. **`FetchResponse` is returned** with `status`, `headers`, `body` (async iterable), and `url` (post-redirect).

Drill into each package at [packages.md](./packages.md).

## When to drop down a layer

Three cases where you'd skip `fetch()` and import a leaf package directly:

- **Security research / fingerprint forging.** `import { connectTls, buildClientHello } from "@browsercore/tls"` — craft arbitrary `ClientHello`s, drive the full TLS 1.3 handshake, inspect server certificates.
- **Custom QUIC experiments.** `import { connectQuic } from "@browsercore/quic"` — drive a raw QUIC connection for fuzzing or transport research.
- **HTTP/3 today.** `import { connectHttp3 } from "@browsercore/http3"` — the fetch-level HTTP/3 integration is still experimental; for production HTTP/3, use the leaf package directly.

## Sources

- Worklog Task `1-repo-browsersmith` — per-package layering, public API surface (~50 exports), `src/crawl.ts` HTTP/3 path docstring (per-URL fresh connection, no pooling, `http3` factory returns a `DatagramTransport`).
- Worklog Task `1-repo-tls` — full TLS 1.3 handshake + record layer + key schedule + cert validation deep-dive. `ClientHelloConfig.extensionOrder` is called *"the primary fingerprinting signal, so the order is load-bearing."* chrome-140 regression test asserts 16-suite list + 16-extension order. GREASE injection in `client-hello.ts`. X25519 + secp256r1 + secp384r1 key shares; four TLS-1.3 AEAD suites.
- Worklog Task `1-repo-compression` — `CompressionProvider` interface + browser-tolerant deflate fallback (zlib-wrapped first, raw inflate on framing failure). 8 methods, all synchronous, `Uint8Array` in/out.
- Worklog Task `1-R2` Snippet 1 — curl-impersonate *"Why? / How?"* framing, used as the model for the *"Where the fingerprint lives"* section.
- Verified against source: `/tmp/per-repo/fetch/package.json` deps (compression, cookies, http1, http2, profiles, tls, transport — *not* http3, quic, or crypto); `@browsercore/http3` `Http3Options.quic` (already-handshaked `QuicConnection`); `@browsercore/quic` `QuicOptions.transport` (caller-supplied `DatagramTransport`); `src/crawl.ts` `http3` factory signature + `fetchHttp3` call sequence.
