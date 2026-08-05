# Package map

browsersmith is the umbrella; the protocol logic lives in 14 `@browsercore/*` packages. This page is a one-paragraph-per-package tour — what each owns, what it depends on, and when you'd install it directly instead of via `browsersmith`. For the layer cake these stack into, see [architecture](./architecture.md); for the profile registry, see [profiles](./profiles.md).

## Leaf packages

Eight protocol-level building blocks. None depend on `fetch` or `browsersmith`; the HTTP layers above compose them. Listed bottom-up — `transport` first, `http3` last.

### `@browsercore/transport` [![npm](https://img.shields.io/npm/v/@browsercore/transport)](https://www.npmjs.com/package/@browsercore/transport)

**Responsibility:** Owns the byte-stream `Transport` interface (`read` / `write` / `close` / `on`) — the seam every protocol layer above is wired against.

**Depends on:** none — leaf package.

**Public API highlights:** `Transport` interface (the contract), `connectTcp()` factory for TCP, `FakeTransport` in-memory test double.

**Install standalone when:** you want a custom transport — a TUN device, a WebRTC datachannel, an in-process mock — to feed into `@browsercore/tls` or `@browsercore/quic`.

**Repo:** [github.com/jverneuer/browsercore-transport](https://github.com/jverneuer/browsercore-transport)

### `@browsercore/tls` [![npm](https://img.shields.io/npm/v/@browsercore/tls)](https://www.npmjs.com/package/@browsercore/tls)

**Responsibility:** Pure-TypeScript TLS 1.3 client — handshake, record layer, RFC 8446 §7.1 key schedule, X.509 validation. Key shares: X25519, secp256r1, secp384r1. No `node:crypto`, no native bindings. **Drift:** the README's "Not implemented" list says "additional key-share groups beyond X25519" — stale; all three are supported. TLS 1.2, NewSessionTicket, PSK / 0-RTT, mTLS, cert compression, HelloRetryRequest genuinely aren't.

**Depends on:** `crypto`, `transport`.

**Public API highlights:** `connectTls()`, `buildClientHello()` / `parseServerHello()`, `TlsConnection` interface, `MODERN_TLS13_PROFILE` + `COMPATIBILITY_PROFILE` (local placeholders until `@browsercore/profiles` ships), 8 typed error classes.

**Install standalone when:** you want to forge or inspect arbitrary TLS ClientHellos for security research, without the HTTP layers.

**Repo:** [github.com/jverneuer/browsercore-tls](https://github.com/jverneuer/browsercore-tls)

### `@browsercore/crypto` [![npm](https://img.shields.io/npm/v/@browsercore/crypto)](https://www.npmjs.com/package/@browsercore/crypto)

**Responsibility:** Thin wrapper over WebCrypto (`globalThis.crypto.subtle`) — gives the rest of the stack a uniform surface across Node / Bun / Deno without ever touching `node:crypto`.

**Depends on:** none — leaf package.

**Public API highlights:** `aesGcmEncrypt` / `aesGcmDecrypt`, `x25519SharedSecret` / `ecdhSharedSecret`, `hkdf`, `hmac`, `verifySignature`, `randomBytes`.

**Install standalone when:** you want a uniform WebCrypto surface across runtimes, or you're building crypto primitives that should run in Workers / Edge alongside Node.

**Repo:** [github.com/jverneuer/browsercore-crypto](https://github.com/jverneuer/browsercore-crypto)

### `@browsercore/compression` [![npm](https://img.shields.io/npm/v/@browsercore/compression)](https://www.npmjs.com/package/@browsercore/compression)

**Responsibility:** Wraps `node:zlib`'s sync gzip / deflate / brotli / raw-inflate APIs behind a `CompressionProvider` interface — keeping the backend swappable for http1 / http2 / http3 (none of which import `node:zlib` directly).

**Depends on:** none — leaf package.

**Public API highlights:** `compression` singleton, `NodeZlibCompressionProvider` class, `CompressionProvider` interface, `ContentEncoding` literal union, `CompressionError` family with `kind` discriminator.

**Install standalone when:** you want browser-tolerant body decoding in your own HTTP client — case-insensitive headers, `x-gzip`→`gzip` aliasing, deflate fallback that retries raw inflate on zlib-wrapped failure.

**Repo:** [github.com/jverneuer/browsercore-compression](https://github.com/jverneuer/browsercore-compression)

### `@browsercore/http1` [![npm](https://img.shields.io/npm/v/@browsercore/http1)](https://www.npmjs.com/package/@browsercore/http1)

**Responsibility:** HTTP/1.1 request-line + header serialization with explicit, load-bearing header ordering — the part of the fingerprint that HTTP/1.1-only targets actually check.

**Depends on:** `transport`, `compression`.

**Public API highlights:** `writeRequest()`, `parseResponse()`, `Http1Profile` type.

**Install standalone when:** you're driving HTTP/1.1 directly over a custom transport and need browser-ordered headers without the full fetch stack.

**Repo:** [github.com/jverneuer/browsercore-http1](https://github.com/jverneuer/browsercore-http1)

### `@browsercore/http2` [![npm](https://img.shields.io/npm/v/@browsercore/http2)](https://www.npmjs.com/package/@browsercore/http2)

**Responsibility:** HTTP/2 framing — `SETTINGS` frame values, `WINDOW_UPDATE`, HPACK encoder / decoder, pseudo-header order (`:method :authority :scheme :path`). Owns the Akamai HTTP/2 fingerprint signal.

**Depends on:** `transport`, `tls`, `compression`.

**Public API highlights:** `Http2Connection`, `Http2Stream`, `Http2Settings`, `Http2Profile` type.

**Install standalone when:** you want to drive HTTP/2 directly with custom `SETTINGS` or pseudo-header ordering.

**Repo:** [github.com/jverneuer/browsercore-http2](https://github.com/jverneuer/browsercore-http2)

### `@browsercore/quic` [![npm](https://img.shields.io/npm/v/@browsercore/quic)](https://www.npmjs.com/package/@browsercore/quic)

**Responsibility:** RFC 9000 QUIC transport — packet / frame parsing, packet protection (AEAD over `@browsercore/crypto`), stream lifecycle, transport parameters. Owns the QUIC Initial-packet fingerprint that HTTP/3 bot detection keys on.

**Depends on:** `transport` (the UDP / datagram variant), `crypto`.

**Public API highlights:** `connectQuic()`, `QuicConnection`, `QuicStream`, `QuicTransportParameters`, `QuicError` family (`ConnectionClosedError`, `HandshakeTimeoutError`, `FlowControlError`, …).

**Install standalone when:** you want a raw QUIC connection — HTTP/3 fuzzing, non-HTTP/3 QUIC protocols, or Initial-packet fingerprint research.

**Repo:** [github.com/jverneuer/browsercore-quic](https://github.com/jverneuer/browsercore-quic)

### `@browsercore/http3` [![npm](https://img.shields.io/npm/v/@browsercore/http3)](https://www.npmjs.com/package/@browsercore/http3)

**Responsibility:** HTTP/3 framing + QPACK (the HTTP/2 HPACK analog) over `@browsercore/quic`. Experimental — the fetch-level integration is opt-in via `crawl({ http3 })` and is not yet wired into `fetch()` itself.

**Depends on:** `quic`, `compression`.

**Public API highlights:** `connectHttp3()`, `Http3Connection`, `Http3Request`, `Http3Response`, `Http3Error` family (`QpackDecodeError`, `SettingsAckTimeoutError`, `GoawayReceivedError`, …).

**Install standalone when:** you want HTTP/3 today, before the fetch-level integration stabilizes.

**Repo:** [github.com/jverneuer/browsercore-http3](https://github.com/jverneuer/browsercore-http3)

## Composition packages

Three packages that compose the leaf layers into a higher-level API — the surface a typical user actually calls.

### `@browsercore/fetch` [![npm](https://img.shields.io/npm/v/@browsercore/fetch)](https://www.npmjs.com/package/@browsercore/fetch)

**Responsibility:** Composes `@browsercore/tls` + `@browsercore/http1` | `@browsercore/http2` + `@browsercore/cookies` into a single `fetch()` call. Owns redirect handling, timeouts, content-negotiation, and the typed error surface.

**Depends on:** `tls`, `http1`, `http2`, `cookies`, `profiles`, `compression`, `transport`, `crypto`.

**Public API highlights:** `fetch()`, `createClient()` (sync — returns `FetchClient`, not `Promise`), `FetchClient` interface, `FetchError` / `FetchTimeoutError` / `RedirectError` / `ProtocolError`.

**Install standalone when:** you want the fetch API + fingerprinting but don't need the curated `PROFILES` map or the `crawl()` helper — `@browsercore/fetch` accepts a `ProfileId` string directly.

**Repo:** [github.com/jverneuer/browsercore-fetch](https://github.com/jverneuer/browsercore-fetch)

### `@browsercore/profiles` [![npm](https://img.shields.io/npm/v/@browsercore/profiles)](https://www.npmjs.com/package/@browsercore/profiles)

**Responsibility:** Profile registry — single source of truth for browser fingerprint bundles. Each `BrowserProfile` is a `{ tls, http1, http2 }` triple. Ships `chrome-140` + `firefox-128` built-in; `registerProfile(id, profile)` lets you add your own. See [profiles](./profiles.md).

**Depends on:** `tls`, `http1`, `http2` (for the profile *types* only).

**Public API highlights:** `getProfile(id)`, `listProfiles()`, `registerProfile(id, profile)`, `ProfileId` branded type, `BrowserProfile` interface.

**Install standalone when:** you're using `@browsercore/fetch` directly (not browsersmith) and want the full registry instead of just the two starter ids.

**Repo:** [github.com/jverneuer/browsercore-profiles](https://github.com/jverneuer/browsercore-profiles)

### `@browsercore/cookies` [![npm](https://img.shields.io/npm/v/@browsercore/cookies)](https://www.npmjs.com/package/@browsercore/cookies)

**Responsibility:** `CookieJar` — parses `Set-Cookie`, applies `SameSite` + `Secure` + `HttpOnly` + `Partitioned` (CHIPS) rules, persists via `saveJar()` / `loadJar()`. Composed into `fetch()` so it lives here rather than with the leaves.

**Depends on:** none — leaf, but composed into `fetch()`.

**Public API highlights:** `createCookieJar()`, `saveJar(jar, dest)`, `loadJar(src)`, `CookieJar` interface, `Cookie` type.

**Install standalone when:** you want a spec-aware cookie jar (SameSite, CHIPS) in your own HTTP client without buying into the rest of the stack.

**Repo:** [github.com/jverneuer/browsercore-cookies](https://github.com/jverneuer/browsercore-cookies)

## Companion packages

Three packages that don't ship protocol logic but support the ecosystem — dev tooling, golden captures, and a local inspector.

### `@browsercore/dev` [![npm](https://img.shields.io/npm/v/@browsercore/dev)](https://www.npmjs.com/package/@browsercore/dev)

**Responsibility:** Shared dev tooling — `tsconfig.base.json` (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`), `oxlint` base config, `vitest` config factory.

**Depends on:** none — devDep everywhere.

**Public API highlights:** `tsconfig.base.json`, `oxlint` base config, `definePackageConfig({ name })` vitest factory.

**Install standalone when:** you're contributing a new `@browsercore/*` package — extend `@browsercore/dev/tsconfig.base.json` and call `definePackageConfig({ name })` in your `vitest.config.ts`.

**Repo:** [github.com/jverneuer/browsercore-dev](https://github.com/jverneuer/browsercore-dev)

### `@browsercore/testing` [![npm](https://img.shields.io/npm/v/@browsercore/testing)](https://www.npmjs.com/package/@browsercore/testing)

**Responsibility:** Golden packet captures of real Chrome 140 + Firefox 128 TLS ClientHellos and HTTP/2 `SETTINGS` frames. Used by `@browsercore/tls`'s `client-hello-chrome140.test.ts` regression test for byte-for-byte fingerprint correspondence.

**Depends on:** none — captures are static data.

**Public API highlights:** golden ClientHello bytes for `chrome-140` + `firefox-128`, golden HTTP/2 `SETTINGS` frames, version-tagged capture metadata.

**Install standalone when:** you're writing fingerprint regression tests against `@browsercore/tls` or `@browsercore/http2` and want the canonical reference captures.

**Repo:** [github.com/jverneuer/browsercore-testing](https://github.com/jverneuer/browsercore-testing)

### `@browsercore/devtools` [![npm](https://img.shields.io/npm/v/@browsercore/devtools)](https://www.npmjs.com/package/@browsercore/devtools)

**Responsibility:** Local request inspector — a small dev server that renders the outgoing ClientHello, HTTP/2 frames, and response headers for a browsersmith fetch in an HTML view. Companion tool, not a runtime dep.

**Depends on:** none — companion tool.

**Public API highlights:** local inspector server, request-diff view, ClientHello + HTTP/2 frame decoder.

**Install standalone when:** you're debugging "why is this target still blocking me?" and want to see exactly what's on the wire.

**Repo:** [github.com/jverneuer/browsercore-devtools](https://github.com/jverneuer/browsercore-devtools)

## When to use browsersmith vs a leaf package

For 95% of users, `npm install browsersmith` is the right call — you get the curated `PROFILES` map, the `crawl()` helper, and the full re-export surface in one install. The umbrella holds no protocol logic of its own; it's a thin barrel over `@browsercore/{fetch, profiles, cookies, http3, quic}` plus two local files (`src/profiles.ts`, `src/crawl.ts`). Everything else is transitive.

Reach for a leaf package directly when (a) you're doing security research and only need one protocol layer — `@browsercore/tls` for ClientHello forging, `@browsercore/quic` for Initial-packet fuzzing; (b) you're building a non-fetch HTTP client and want to reuse our TLS / HTTP/2 / cookie-jar primitives; or (c) you want HTTP/3 today, before the fetch-level integration stabilizes — `@browsercore/http3` is currently the only way to drive QUIC through the stack, via `crawl({ http3 })` rather than `fetch()`.

## Sources

- Worklog Task `1-repo-browsersmith` — umbrella barrel re-export surface, `PACKAGES.md` leaf / protocol / HTTP / support / entry-point taxonomy.
- Worklog Task `1-repo-compression` — `@browsercore/compression` full inspection (interface, deflate fallback, zero runtime deps).
- Worklog Task `1-repo-tls` — `@browsercore/tls` full inspection (~50 exports, `crypto` + `transport` deps, X25519-only-vs-actually-supports-secp256r1/secp384r1 drift).
- Worklog Task `2-structure` — final Leaf 8 / Composition 3 / Companion 3 grouping.
- Per-package READMEs — each entry links to its own repo for the complete public API surface; this page lists only the 3–5 most-used exports per package.
