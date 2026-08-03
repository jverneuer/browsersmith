# browsercore packages

A modular, extensible TypeScript networking stack that implements protocol layers
in user space with browser-identical TLS + HTTP fingerprints. The packages are
published independently under the `@browsercore/*` scope and composed by the
**`browsersmith`** entry package into a single `fetch()`.

## Leaf primitives

| package | role |
| --- | --- |
| [`@browsercore/transport`](https://github.com/jverneuer/browsercore-transport) | Reliable ordered byte-stream over TCP + DNS — the socket layer everything sits on. |
| [`@browsercore/crypto`](https://github.com/jverneuer/browsercore-crypto) | Cryptographic primitives (AEAD, HKDF, X25519, hashing) abstracted over Node's crypto. |
| [`@browsercore/compression`](https://github.com/jverneuer/browsercore-compression) | gzip / deflate / brotli / zstd wrapper over Node's zlib. |

## Protocol layers

| package | role |
| --- | --- |
| [`@browsercore/tls`](https://github.com/jverneuer/browsercore-tls) | TLS 1.3 (with 1.2 fallback) client in pure TypeScript; browser-identical fingerprints. |
| [`@browsercore/quic`](https://github.com/jverneuer/browsercore-quic) | QUIC transport (RFC 9000): packet framing, streams, congestion — HTTP/3's base. |
| [`@browsercore/http1`](https://github.com/jverneuer/browsercore-http1) | HTTP/1.1 client over any byte stream. |
| [`@browsercore/http2`](https://github.com/jverneuer/browsercore-http2) | HTTP/2 client: framing, HPACK, stream multiplexing. |
| [`@browsercore/http3`](https://github.com/jverneuer/browsercore-http3) | HTTP/3 framing + QPACK over QUIC. |

## HTTP surface

| package | role |
| --- | --- |
| [`@browsercore/fetch`](https://github.com/jverneuer/browsercore-fetch) | The developer-facing `fetch()` that composes the full stack (TLS + HTTP/1–3 + cookies + profiles). |

## Support

| package | role |
| --- | --- |
| [`@browsercore/cookies`](https://github.com/jverneuer/browsercore-cookies) | RFC 6265 cookie jar with SameSite enforcement. |
| [`@browsercore/profiles`](https://github.com/jverneuer/browsercore-profiles) | Browser fingerprint definitions (JA3/JA4, TLS/HTTP2 settings) for impersonation. |
| [`@browsercore/testing`](https://github.com/jverneuer/browsercore-testing) | Protocol-verification harness + golden browser captures. |
| [`@browsercore/devtools`](https://github.com/jverneuer/browsercore-devtools) | Packet inspector / TLS-HTTP visualizer tooling. |

## Entry point

| package | role |
| --- | --- |
| **`browsersmith`** ([repo](https://github.com/jverneuer/browsercore)) | *Batteries-included* one-install package that wires the stack above into a single browser-identical `fetch()`. It holds no protocol logic of its own — just `src/index.ts` (a configured `fetch`), `src/profiles.ts` (preset fingerprints), and `src/crawl.ts` (a higher-level crawl helper) — and depends on every `@browsercore/*` package above. |

## Dependency direction

```
browsercore  ──►  fetch ──►  tls, http1, http2, http3, cookies, profiles, compression
                       │
                       └──►  http3 ──► quic
                                  └──► tls ──► crypto, transport
                                                       └──► crypto
```

Install a single layer for a targeted use case, or install **`browsercore`** to get the whole stack behind one `fetch()`.
