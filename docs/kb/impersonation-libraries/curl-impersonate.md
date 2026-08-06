# curl-impersonate

**Repository:** https://github.com/lwthiker/curl-impersonate (original) | https://github.com/lexiforest/curl-impersonate (maintained fork)
**Language:** C (patched libcurl + BoringSSL/NSS)
**License:** MIT
**Stars:** ~3.5k (original) | ~2.7k (lexiforest fork)

## Overview

curl-impersonate is a **patched fork of libcurl** that produces TLS ClientHellos and HTTP/2 SETTINGS frames **byte-identical** to real browsers. It achieves this by:

1. **Compiling curl with BoringSSL** (Google's TLS library, same as Chrome) instead of OpenSSL
2. **Patches TLS extension ordering, cipher suites, supported curves, GREASE behavior** to match each browser
3. **Patches HTTP/2 SETTINGS, WINDOW_UPDATE, PRIORITY frames, pseudo-header ordering** to match Akamai-style fingerprints
4. **Per-browser wrapper scripts** (`curl_chrome116`, `curl_ff109`, etc.) that set the right ciphers, curves, headers

This is the **gold standard** that all higher-level bindings (curl_cffi, impers) wrap.

## Architecture

```
User code
  ↓
curl_easy_impersonate() — sets all TLS/HTTP options for a target browser
  ↓
Patched libcurl — modified TLS extension ordering, cipher list, SSL options
  ↓
BoringSSL (Chrome targets) / NSS (Firefox targets) — patched for byte-identical ClientHello
  ↓
OS TCP/IP stack
```

## Browser Coverage

### Original (lwthiker)
| Browser | Versions |
|---------|----------|
| Chrome | 99, 100, 101, 104, 107, 110, 116 |
| Edge | 99, 101 |
| Firefox | 91esr, 95, 98, 100, 102, 109, 117 |
| Safari | 15.3, 15.5 |

### Maintained Fork (lexiforest)
| Browser | Versions |
|---------|----------|
| Chrome | 99, 100, 101, 104, 107, 110, 116, 119, 120, 123, 124, 131, 133a, 136, 142, 145, 146 |
| Chrome Android | 99, 131 |
| Edge | 99, 101 |
| Firefox | 133, 135, 144, 147 |
| Safari | 15.3, 15.5, 17.0, 18.0, 18.4, 26.0, 26.0.1 |
| Safari iOS | 17.2, 18.0, 18.4, 26.0 |
| Tor | 14.5 |

## Fingerprint Signals Covered

### TLS (JA3/JA4)
- Cipher suites (full ordered list per profile)
- TLS extensions (full ordered list, with explicit `CURLOPT_TLS_EXTENSION_ORDER`)
- Supported groups / elliptic curves (including `X25519Kyber768Draft00`, `X25519MLKEM768`)
- Signature algorithms
- TLS version (1.0 through 1.3)
- GREASE (static per-profile, toggle via `CURLOPT_TLS_GREASE`)
- ALPN / ALPS
- Session tickets
- Certificate compression (zlib/brotli)
- Delegated credentials (Firefox)
- Record size limit (Firefox)
- Key shares limit
- Permute extensions (Chrome 110+)
- ECH (Encrypted Client Hello) — Chrome 119+
- Signed certificate timestamps / OCSP status request

### HTTP/2 (Akamai)
- SETTINGS frame values + order (`CURLOPT_HTTP2_SETTINGS`)
- Initial connection WINDOW_UPDATE (`CURLOPT_HTTP2_WINDOW_UPDATE`)
- Pseudo-header order (`CURLOPT_HTTP2_PSEUDO_HEADERS_ORDER`)
- Stream priority / exclusive
- No-priority flag
- Header order (`CURLOPT_HTTPHEADER_ORDER`)
- Split cookies
- Form boundary

### HTTP/3 / QUIC
- HTTP/3 SETTINGS (`CURLOPT_HTTP3_SETTINGS`)
- HTTP/3 pseudo-header order
- HTTP/3 TLS extension order
- HTTP/3 headers + header order
- HTTP/3 supported groups
- QUIC transport parameters
- HTTP/3 signature hash algorithms

### WebSocket
- WS header order
- WS TLS session ticket disable
- WS certificate compression
- WS headers

## API Surface

```c
// Easy-level API
CURLcode curl_easy_impersonate(struct CURL *handle, const char *target,
                               int enable_no_ua_cookie);

// Non-standard curl options added by the patch
CURLOPT_HTTPBASEHEADER
CURLOPT_SSL_SIG_HASH_ALGS
CURLOPT_SSL_ENABLE_ALPS
CURLOPT_SSL_CERT_COMPRESSION
CURLOPT_SSL_ENABLE_TICKET
CURLOPT_HTTP2_PSEUDO_HEADERS_ORDER
CURLOPT_HTTP2_NO_SERVER_PUSH
CURLOPT_SSL_PERMUTE_EXTENSIONS
CURLOPT_HTTP2_SETTINGS
CURLOPT_HTTP2_WINDOW_UPDATE
CURLOPT_HTTPHEADER_ORDER
CURLOPT_TLS_GREASE
CURLOPT_TLS_EXTENSION_ORDER
CURLOPT_TLS_DELEGATED_CREDENTIALS
CURLOPT_TLS_RECORD_SIZE_LIMIT
CURLOPT_TLS_KEY_SHARES_LIMIT
CURLOPT_ECH
CURLOPT_HTTP3_SETTINGS
CURLOPT_HTTP3_PSEUDO_HEADERS_ORDER
```

## Key Source Files

| File | Purpose |
|------|---------|
| `chrome/patches/curl-impersonate.patch` | Main Chrome/Edge/Safari patch — complete TLS+HTTP/2 spec |
| `firefox/patches/curl-impersonate.patch` | Firefox patch — NSS-specific TLS config |
| `tests/signatures/chrome.yaml` | Golden fingerprints for Chrome versions |
| `tests/signatures/firefox.yaml` | Golden fingerprints for Firefox versions |
| `tests/signatures/safari.yaml` | Golden fingerprints for Safari versions |
| `tests/signatures/edge.yaml` | Golden fingerprints for Edge versions |
| `tests/signature.py` | TLS ClientHello + HTTP/2 signature parsing logic |
| `tests/test_impersonate.py` | Test harness: capture → parse → compare against YAML |
| `browsers.json` | Registry of all supported browser targets |
| `chrome/curl_chrome*` | Wrapper scripts with concrete cipher lists, headers, flags |

## Unique Techniques

1. **Impersonate the packet, not the fingerprint** — they make the ClientHello *structurally identical* to Chrome's, so the JA3 hash is a side effect, not a target. This is why browsercore's philosophy (profile → wire bytes) aligns with theirs.

2. **Static GREASE values** — unlike real Chrome which randomizes GREASE codepoints per-connection, curl-impersonate uses static GREASE. browsercore shares this limitation.

3. **BoringSSL dependency** — the Chrome build uses BoringSSL (not OpenSSL), which is what Chrome actually uses. This is what makes byte-identical ClientHellos possible at the C level.

## What browsercore Can Learn

- The `curl-impersonate.patch` files are the **most detailed specification** of what makes each browser's network fingerprint. browsercore's profiles should be verified against these patches.
- The YAML signature files are **ground truth** data that browsercore's golden-fingerprint tests should compare against.
- The `signature.py` parser is a reference implementation for extracting and comparing fingerprints.

## References

- [Original repo](https://github.com/lwthiker/curl-impersonate)
- [Maintained fork](https://github.com/lexiforest/curl-impersonate)
- [Chrome patch](https://github.com/lwthiker/curl-impersonate/blob/main/chrome/patches/curl-impersonate.patch) — the single most important file for browsercore
- [Firefox patch](https://github.com/lwthiker/curl-impersonate/blob/main/firefox/patches/curl-impersonate.patch)
- [Chrome signatures](https://github.com/lwthiker/curl-impersonate/blob/main/tests/signatures/chrome.yaml)
- [Firefox signatures](https://github.com/lwthiker/curl-impersonate/blob/main/tests/signatures/firefox.yaml)
- [Safari signatures](https://github.com/lwthiker/curl-impersonate/blob/main/tests/signatures/safari.yaml)
- [Test harness](https://github.com/lwthiker/curl-impersonate/blob/main/tests/test_impersonate.py)
