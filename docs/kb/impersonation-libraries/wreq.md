# wreq (0x676e67/wreq)

**Repository:** https://github.com/0x676e67/wreq
**Language:** Rust (hard fork of reqwest)
**License:** Apache-2.0
**Stars:** ~1,500

## Overview

wreq is a **hard fork of reqwest** that replaces rustls with a BoringSSL backend (`cloudflare/boring`), making it the most capable Rust HTTP client for browser fingerprint impersonation. It provides **100+ browser device emulation profiles** via the `wreq-util` crate, with fine-grained control over every TLS and HTTP/2 fingerprint signal. It preserves HTTP/1 header case sensitivity (critical for WAF bypass) and supports WebSocket, Tower middleware, and multiple async runtimes.

## Architecture

```
User code
  ↓
wreq::Client (fork of reqwest)
  ↓
wreq-util — browser emulation profiles (100+ device profiles)
  ↓
hyper-boring (fork of hyper) — HTTP layer over BoringSSL
  ↓
cloudflare/boring — safe Rust bindings to BoringSSL (Google's TLS library)
  ↓
BoringSSL — produces byte-identical ClientHellos to Chrome
  ↓
OS TCP/IP stack
```

## Browser Coverage

Emulation profiles are accessed via typed enums:

| Browser | Example Emulations |
|---------|-------------------|
| Chrome | `Emulation::Chrome124`, `Emulation::Chrome131`, `Emulation::Chrome136`, ... |
| Firefox | `Emulation::Firefox120`, `Emulation::Firefox133`, `Emulation::Firefox140`, ... |
| Safari | `Emulation::Safari15_5`, `Emulation::Safari18_0`, `Emulation::Safari26`, ... |
| Edge | `Emulation::Edge122`, ... |
| OkHttp (Android) | `Emulation::OkHttp4_10`, ... |

Total: **100+ device profiles** covering Chrome, Firefox, Safari, Edge, and Android OkHttp clients across many versions.

## API Surface

```rust
use wreq::Client;
use wreq_util::Emulation;

// Create a client with a specific browser emulation
let client = Client::builder()
    .emulation(Emulation::Chrome131)
    .build()?;

// Standard reqwest-style API
let resp = client.get("https://example.com").send().await?;
let body = resp.text().await?;

// Per-request overrides
let resp = client
    .get("https://example.com")
    .header("Accept-Language", "en-US")
    .send()
    .await?;
```

### Emulation Profiles

```rust
use wreq_util::{Emulation, EmulationOption};

// Use a predefined profile
let emulation = Emulation::Chrome131;

// Or build a custom profile
let emulation = EmulationOption::default()
    .chrome_131()
    .tls_config(|config| {
        config.cipher_suites(...);
        config.enable_grease(true);
    })
    .http2_config(|config| {
        config.initial_stream_window_size(...);
    })
    .build();
```

### Fine-Grained TLS Control

```rust
use wreq_util::EmulationOption;

let emulation = EmulationOption::default()
    // Cipher suites
    .cipher_suites(&["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", ...])
    // Supported groups / curves
    .curves(&["X25519", "P-256", "P-384"])
    // Signature algorithms
    .sigalgs(&["ecdsa_secp256r1_sha256", "rsa_pss_rsae_sha256", ...])
    // ALPN protocols
    .alpn_protocols(&["h2", "http/1.1"])
    // GREASE
    .grease(true)
    // Extension order
    .permute_extensions(true)
    // Key share groups
    .key_share_groups(&["X25519"])
    .build();
```

### HTTP/2 Control

```rust
use wreq_util::EmulationOption;

let emulation = EmulationOption::default()
    .http2_config(|config| {
        // SETTINGS frame values
        config.settings_max_concurrent_streams(Some(100));
        config.settings_initial_window_size(Some(6291456));
        config.settings_max_header_list_size(Some(262144));
        // WINDOW_UPDATE
        config.initial_stream_window_size(Some(15663105));
        // Priority
        config.priority(true);
        // Pseudo-header order
        config.pseudo_headers_order(&[":method", ":authority", ":scheme", ":path"]);
    })
    .build();
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4)
- Cipher suites (full ordered list, configurable per profile)
- Supported groups / elliptic curves (X25519, P-256, P-384, etc.)
- Signature algorithms (full ordered list)
- GREASE (toggle, with correct GREASE codepoint generation)
- ALPN (configurable protocols list)
- Permute extensions (Chrome 110+ behavior)
- Key share groups
- Supported versions (TLS 1.2 / 1.3)
- Session tickets
- EC point formats
- Extension ordering

### HTTP/2
- SETTINGS frame values (MAX_CONCURRENT_STREAMS, INITIAL_WINDOW_SIZE, MAX_HEADER_LIST_SIZE, etc.)
- Initial connection WINDOW_UPDATE
- Stream priority (exclusive flag, weight, stream dependency)
- Pseudo-header order (`:method`, `:authority`, `:scheme`, `:path`)
- Header case preservation (HTTP/1 headers retain original case)

### HTTP/1.1
- Header case sensitivity (preserves original case — critical for WAF bypass)
- Custom header ordering
- User-Agent per profile
- Accept-Language per profile

## Unique Features

### 1. BoringSSL Backend (Not rustls)

wreq's most important architectural decision is **replacing rustls with BoringSSL**. rustls (Rust's default TLS library) produces ClientHellos that are structurally different from real browsers — its cipher suite ordering, extension set, and GREASE behavior don't match Chrome or Firefox. BoringSSL is Google's fork of OpenSSL used by Chrome, so it produces byte-identical ClientHellos with the right configuration. This makes wreq the only Rust HTTP client that can truly impersonate browsers at the TLS level.

### 2. Header Case Sensitivity Preservation

Most HTTP/1.1 libraries normalize headers to `Title-Case` (e.g., `accept-language` → `Accept-Language`). Real browsers send headers in the exact case the page or JavaScript specifies. Some WAFs (Cloudflare, Akamai) use header case as a fingerprint signal. wreq preserves the original case of all headers, making it effective for WAF bypass.

### 3. `wreq-util` Emulation Crate

The `wreq-util` crate is a separate, reusable package that provides the 100+ browser emulation profiles. It can be used independently of wreq — any Rust HTTP client that supports a BoringSSL backend can consume these profiles.

### 4. Tower Middleware Integration

wreq is built on `tower` middleware, so it integrates with the Rust ecosystem's standard HTTP middleware stack. This allows callers to add retry, rate limiting, logging, and other concerns as standard Tower layers.

### 5. Multiple Async Runtime Support

wreq supports both `tokio` and `async-std` runtimes, unlike reqwest which is tokio-only.

## What browsercore Can Learn

- **The BoringSSL insight** — the fundamental reason wreq can impersonate browsers while reqwest cannot is the TLS backend. browsercore's pure-TypeScript TLS implementation is the equivalent approach: building TLS from scratch to match BoringSSL's exact behavior. wreq validates this architectural choice.
- **Header case sensitivity as a fingerprint signal** — wreq's emphasis on header case preservation is a reminder that fingerprint signals go beyond TLS. browsercore already handles this, but wreq shows it's a critical WAF bypass signal.
- **Emulation crate separation** — the `wreq-util` crate's separation of profiles from the HTTP client is a clean architecture that browsercore's `@browsercore/profiles` package mirrors.
- **GREASE with permute extensions** — wreq's GREASE implementation (including the `permute_extensions` flag for Chrome 110+) is a good reference for browsercore's GREASE handling.
- **Tower middleware pattern** — wreq's middleware integration shows how to make an impersonation HTTP client composable with the broader ecosystem.

## Key Source Files

| File | Purpose |
|------|---------|
| `wreq/src/client.rs` | Main `Client` type — reqwest fork with BoringSSL backend |
| `wreq/src/emulation.rs` | Emulation profile integration |
| `wreq-util/src/lib.rs` | `wreq-util` crate — emulation profile definitions |
| `wreq-util/src/chrome.rs` | Chrome emulation profiles |
| `wreq-util/src/firefox.rs` | Firefox emulation profiles |
| `wreq-util/src/safari.rs` | Safari emulation profiles |
| `wreq-util/src/edge.rs` | Edge emulation profiles |
| `wreq-util/src/okhttp.rs` | Android OkHttp profiles |
| `wreq-util/src/emulation.rs` | `Emulation` enum and `EmulationOption` builder |
| `wreq-util/src/tls.rs` | TLS-level emulation config |
| `wreq-util/src/http2.rs` | HTTP/2-level emulation config |
| `hyper-boring/src/lib.rs` | BoringSSL-backed HTTP layer (hyper fork) |
| `cloudflare/boring/src/lib.rs` | Safe Rust bindings to BoringSSL |

## References

- [GitHub](https://github.com/0x676e67/wreq)
- [wreq-util crate](https://crates.io/crates/wreq-util)
- [crates.io](https://crates.io/crates/wreq)
- [cloudflare/boring](https://github.com/cloudflare/boring) — BoringSSL bindings
- [hyper-boring](https://github.com/0x676e67/hyper-boring) — BoringSSL hyper fork
- [Emulation enum](https://github.com/0x676e67/wreq/blob/master/wreq-util/src/emulation.rs)
- [Chrome profiles](https://github.com/0x676e67/wreq/blob/master/wreq-util/src/chrome.rs)
