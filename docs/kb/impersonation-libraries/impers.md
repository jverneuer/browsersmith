# impers

**Repository:** https://github.com/lexiforest/impers
**Language:** TypeScript (Node.js FFI via Koffi)
**License:** MIT
**Stars:** ~101
**Version:** 0.1.0 (alpha)

## Overview

impers is the **Node.js/TypeScript equivalent of curl_cffi**. It wraps `curl-impersonate` via Koffi FFI, providing a TypeScript API. It's the direct Node.js competitor to browsercore.

## Architecture

```
TypeScript code
  ↓
Koffi FFI bindings (src/ffi/libcurl.ts)
  ↓
libcurl-impersonate (C library, auto-downloaded to ~/.cache/impers/)
  ↓
BoringSSL (Chrome) / NSS (Firefox)
  ↓
OS TCP/IP stack
```

## Browser Coverage

| Browser | Versions |
|---------|----------|
| Chrome | 99, 100, 101, 104, 107, 110, 116, 119, 120, 123, 124, 131, 133a, 136, 142, 145, 146 |
| Chrome Android | 99, 131 |
| Edge | 99, 101 |
| Firefox | 133, 135, 144, 147 |
| Safari | 15.3, 15.5, 17.0, 18.0, 18.4, 26.0, 26.0.1 |
| Safari iOS | 17.2, 18.0, 18.4, 26.0 |
| Tor | 14.5 |

## Unique Features

### HTTP/3 Fingerprint Control
impers claims to be the first Node.js package with HTTP/3 impersonation. Full control over:
- HTTP/3 SETTINGS
- HTTP/3 pseudo-header order
- HTTP/3 TLS extension order
- HTTP/3 headers + header order
- HTTP/3 supported groups
- QUIC transport parameters
- HTTP/3 signature hash algorithms

### Managed Fingerprint API
`FingerprintManager` pulls updated fingerprints from `api.impersonate.pro/v1`, caches them as JSON, and applies them. New browser versions can be supported without a library update.

### Auto-Downloads Native Binary
On first launch, downloads `curl-impersonate v2.0.0` from GitHub releases. Platform-aware (macOS/Linux/Windows, x64/arm64, gnu/musl).

### Custom Fingerprint Strings
Accepts raw JA3 strings and Akamai HTTP/2 fingerprint strings. `ExtraFingerprint` dataclass for fine-grained control.

### WebSocket with Impersonation
Carries the browser's TLS fingerprint into the WebSocket handshake.

## What browsercore Can Learn

- The HTTP/3 fingerprint control surface is the most comprehensive in any library
- The managed fingerprint API model (remote updates) is worth considering for browsercore's profiles
- The auto-download pattern for native binaries is a pragmatic solution for FFI-based tools

## Key Differences from browsercore

| Dimension | impers | browsercore |
|-----------|--------|-------------|
| Approach | FFI wrapper around C libcurl | Pure TypeScript from scratch |
| Native deps | libcurl-impersonate (auto-downloaded) | None |
| Browser targets | 37+ | 10 |
| Type safety | Moderate (FFI boundaries use `unknown`) | High (strict TS, branded types) |
| Testability | Hard (requires native lib) | Full (fake providers) |
| QUIC/HTTP-3 | Via libcurl (described as "limited") | Own from-scratch implementation |
| ALPN dispatch | Via libcurl | Own implementation |

## References

- [GitHub](https://github.com/lexiforest/impers)
- [npm](https://www.npmjs.com/package/impers)
- [Homepage](https://lexiforest.github.io/impers/)
- [FFI bindings](https://github.com/lexiforest/impers/blob/main/src/ffi/libcurl.ts)
- [Fingerprint manager](https://github.com/lexiforest/impers/blob/main/src/fingerprints.ts)
- [WebSocket](https://github.com/lexiforest/impers/blob/main/src/websocket/)
