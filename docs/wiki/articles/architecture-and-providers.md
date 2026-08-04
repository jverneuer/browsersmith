# Architecture & Provider Abstraction

The entire browsercore stack is built on **provider interfaces** that decouple
protocol logic from platform I/O. Protocol packages never import `node:*`
directly — they depend only on interfaces exported by leaf primitives. This is
what makes TLS fingerprinting possible: the TLS engine consumes an abstract
`CryptoProvider` and `Transport`, so its ClientHello construction is purely a
function of profile data, not of any backend implementation.

## Package dependency graph

```
browsercore (entrypoint — re-exports + crawl helper + PROFILES)
  └─ @browsercore/fetch — fetch() + createClient() + connection pool + ALPN dispatch
       ├─ @browsercore/http2 — HTTP/2 framing, HPACK, stream multiplexing
       ├─ @browsercore/http1 — HTTP/1.1 client
       ├─ @browsercore/tls — TLS 1.3 (+ 1.2 fallback), JA3/JA4 source
       │    ├─ @browsercore/crypto — AEAD, HKDF, X25519, hashing
       │    └─ @browsercore/transport — TCP + DNS byte stream
       ├─ @browsercore/profiles — Browser fingerprint definitions (pure data)
       ├─ @browsercore/cookies — RFC 6265 cookie jar
       └─ @browsercore/compression — gzip/deflate/brotli/zstd
```

Dependency direction is strictly downward — a package may only import from
packages below it. `@browsercore/http3` and `@browsercore/quic` exist but are
**not yet wired into the entrypoint**.

## The three provider interfaces

### `CryptoProvider` (`crypto/src/provider.ts`)

The TLS implementation calls these methods, never `node:crypto` directly:

```ts
export interface CryptoProvider {
    randomBytes(length: number): Uint8Array;
    sha256(data: Uint8Array): Uint8Array;
    sha384(data: Uint8Array): Uint8Array;
    hkdf(hash: HashId, salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Uint8Array;
    hmac(hash: HashId, key: Uint8Array, data: Uint8Array): Uint8Array;
    aes128GcmEncrypt(key, nonce, plaintext, aad): Uint8Array;
    aes128GcmDecrypt(key, nonce, ciphertext, aad): Uint8Array;
    aes256GcmEncrypt(key, nonce, plaintext, aad): Uint8Array;
    aes256GcmDecrypt(key, nonce, ciphertext, aad): Uint8Array;
    chacha20Poly1305Encrypt(key, nonce, plaintext, aad): Uint8Array;
    chacha20Poly1305Decrypt(key, nonce, ciphertext, aad): Uint8Array;
    x25519GenerateKeyPair(): X25519KeyPair;
    x25519SharedSecret(secretKey, peerPublicKey): Uint8Array;
    verifySignature(scheme, publicKey, signature, data): boolean;
}
```

`NodeCryptoProvider` (implements `CryptoProvider`) is the `node:crypto`-backed
implementation; the default singleton is `crypto`. `SymmetricCipherId` is the
literal union `"AES-128-GCM" | "AES-256-GCM" | "ChaCha20-Poly1305"`; `HashId` is
`"SHA-256" | "SHA-384"`; `KeyExchangeId` is `"X25519"`.

### `CompressionProvider` (`compression/src/types.ts`)

HTTP layers call these methods, never `node:zlib` directly:

```ts
export interface CompressionProvider {
    gzip(data: Uint8Array): Uint8Array;
    gunzip(data: Uint8Array): Uint8Array;
    deflate(data: Uint8Array): Uint8Array;
    inflate(data: Uint8Array): Uint8Array;
    inflateRaw(data: Uint8Array): Uint8Array;
    brotliCompress(data: Uint8Array): Uint8Array;
    brotliDecompress(data: Uint8Array): Uint8Array;
    decompress(data: Uint8Array, encoding: string): Uint8Array;  // browser-tolerant deflate
}
```

`NodeZlibCompressionProvider` is the `node:zlib`-backed implementation; the
default singleton is `compression`. `ContentEncoding` is the literal union
`"gzip" | "deflate" | "br" | "identity"`. All operations are synchronous and
I/O-free, which keeps them unit-testable.

### `Transport` (`transport/src/types.ts`)

A reliable, ordered byte stream over TCP with no knowledge of TLS or HTTP:

```ts
export interface Transport extends EventEmitter {
    readonly id: TransportId;
    readonly state: TransportState;
    write(data: Uint8Array): Promise<void>;
    read(): Promise<Uint8Array>;
    close(reason?: CloseReason): Promise<void>;
}
```

`TcpTransport` is the `node:net` + `node:dns`-backed implementation; the default
entrypoint is `connect({ host, port, ... })`. The `TransportOptions` interface
covers `connectTimeoutMs`, `idleTimeoutMs`, `readTimeoutMs`, `ipv6`, `dnsLookup`
(custom DNS — e.g. for DoH), `noDelay` (default true), and `localAddress`.

All interfaces use `Uint8Array` exclusively — never Node `Buffer`.
Backend-specific error codes (OpenSSL, zlib) are wrapped at the provider
boundary into typed errors and never leak upward.

## Singletons for ergonomics, interfaces for replaceability

Each leaf package exports a default singleton that upper layers import directly:

```ts
import { crypto } from "@browsercore/crypto";            // CryptoProvider
import { compression } from "@browsercore/compression";  // CompressionProvider
```

Tests construct fake providers to test protocol layers against synthetic byte
streams without any real I/O. The production HTTP implementations never call
`node:*` directly.

## ALPN-driven protocol dispatch

After TLS negotiation, the ALPN result determines the HTTP version.
`fetch/src/dispatch.ts` is the single decision point:
- ALPN `"h2"` → HTTP/2 with profile-seeded SETTINGS.
- Everything else → HTTP/1.1 with profile-ordered headers.

`adaptTlsToTransport()` (`fetch/src/tls-adapter.ts`) bridges the TLS connection
to the `Transport` interface so HTTP layers remain TLS-agnostic. The ALPN
protocols offered are `["h2", "http/1.1"]` (`fetch/src/profile.ts`).

## Coordinator + pure-function submodules

Stateful connection objects (`TlsConnectionImpl`, `Http2Connection`) are thin
coordinators — they own mutable state and delegate all computation to focused
submodules (`handshake-driver.ts`, `key-exchange.ts`, `record-layer.ts`). This
keeps byte-level logic unit-testable in isolation without spinning up a
connection.

## The single translation seam

Only `fetch/src/profile.ts` bridges the gap between the data layer
(string-based profiles) and the protocol layers (literal-union configs).
`profileToTlsConfig()`, `profileHttp2Settings()`, and `applyHttp1Profile()` are
the only places that validate and narrow profile data — every invalid value
surfaces as a `FetchError` here, never deeper.
