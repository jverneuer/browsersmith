# cloudflare/boring

**Repository:** https://github.com/cloudflare/boring
**Language:** Rust (safe bindings to BoringSSL)
**License:** Apache-2.0 / MIT (dual-licensed)
**Stars:** ~1,200

## Overview

cloudflare/boring provides **safe Rust bindings to BoringSSL** — Google's fork of OpenSSL used by Chrome. It's the foundational TLS library that all Rust-based browser impersonation tools (wreq, rquest) build on. It exposes three crates: `boring` (raw BoringSSL bindings), `tokio-boring` (async I/O integration), and `hyper-boring` (HTTP layer integration). It provides fine-grained ClientHello control, supports FIPS and post-quantum (ML-KEM), and is the Rust equivalent of what `utls` is for Go.

## Architecture

```
Rust HTTP client (wreq, rquest)
  ↓
hyper-boring (HTTP layer over BoringSSL)
  ↓
tokio-boring (async I/O wrapper)
  ↓
boring (safe Rust bindings to BoringSSL C API)
  ↓
BoringSSL (Google's TLS library, used by Chrome)
  ↓
OS TCP/IP stack
```

## Key Crates

| Crate | Purpose |
|-------|---------|
| `boring` | Safe Rust bindings to the BoringSSL C API |
| `tokio-boring` | Async I/O integration (tokio <-> BoringSSL) |
| `hyper-boring` | BoringSSL-backed HTTP client (hyper integration) |

## Browser Coverage

cloudflare/boring is a **TLS engine, not a browser profile library**. It provides the primitives to build any browser's ClientHello — the actual browser coverage depends on the consumer (wreq, rquest). By itself, it can produce any ClientHello that BoringSSL supports, which includes all major browsers since BoringSSL is Chrome's TLS library.

## API Surface

### Basic TLS Connection

```rust
use boring::ssl::{SslConnector, SslMethod};

let mut connector = SslConnector::builder(SslMethod::tls())?;

// Cipher suites
connector.set_cipher_list("TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:...")?;

// Supported groups (curves)
connector.set_curves(&["X25519", "P-256", "P-384"])?;

// Signature algorithms
connector.set_sigalgs_list("ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:...")?;

// ALPN
connector.set_alpn_protos(b"\x02h2\x08http/1.1")?;

// GREASE
// BoringSSL handles GREASE internally — enabled by default

// Session tickets
connector.set_session_cache_mode(boring::ssl::SslSessionCacheMode::Client)?;

// Permute extensions (Chrome 110+)
// Controlled via BoringSSL's SSL_set_permute_extensions
connector.permute_extensions(true);

// TLS version
connector.set_min_proto_version(Some(boring::ssl::SslVersion::TLS1_2))?;
connector.set_max_proto_version(Some(boring::ssl::SslVersion::TLS1_3))?;

// Enable/disable extensions
// Fine-grained control via SSL_set_extension_* methods
```

### Custom Extensions

```rust
use boring::ssl::SslConnectorBuilder;

// Add custom extensions by ID and data
// BoringSSL provides SSL_CTX_add_client_custom_extension
// for arbitrary extension injection

// Or use the extension API to add specific extensions:
// - supported_versions
// - key_share
// - signature_algorithms
// - server_name
// - application_layer_protocol_negotiation
// - etc.
```

### tokio-boring (Async I/O)

```rust
use tokio_boring::SslStream;
use tokio::net::TcpStream;

let tcp = TcpStream::connect("example.com:443").await?;
let connector = /* configured SslConnector */;
let ssl_stream = SslStream::new(connector.into_context(), tcp)?;
let mut ssl_stream = ssl_stream.connect().await?;
// Use ssl_stream as an async read/write stream
```

### hyper-boring (HTTP Layer)

```rust
use hyper_boring::HttpsConnector;
use hyper::Client;

let https = HttpsConnector::new()?;
let client = Client::builder().build::<_, hyper::Body>(https);

let resp = client.get("https://example.com".parse()?).await?;
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4)
- Cipher suites (full ordered list via `set_cipher_list`)
- Supported groups / elliptic curves (via `set_curves`)
- Signature algorithms (via `set_sigalgs_list`)
- GREASE (handled internally by BoringSSL, enabled by default)
- ALPN (via `set_alpn_protos`)
- Session tickets (via `set_session_cache_mode`)
- TLS version range (via `set_min/max_proto_version`)
- Supported versions extension
- Key share groups
- EC point formats
- Extension ordering (via `permute_extensions`)
- Custom extension data (via `SSL_CTX_add_client_custom_extension`)
- Certificate compression
- Signed certificate timestamps
- OCSP status request
- Post-quantum key exchange (ML-KEM / X25519Kyber768Draft00)

### BoringSSL-Specific
- FIPS mode (for compliance)
- Post-quantum cryptography (ML-KEM, X25519Kyber768Draft00)
- QUIC support (via `SSL_set_quic_transport_parameters`)
- Encrypted Client Hello (ECH)
- Delegated credentials
- Record size limit
- Certificate verification customization

## Unique Features

### 1. BoringSSL, Not OpenSSL or rustls

The fundamental value of cloudflare/boring is that it wraps **BoringSSL** — the exact TLS library that Chrome uses. This means:
- ClientHellos produced by BoringSSL are **structurally identical** to Chrome's
- The same cipher suites, extension ordering, GREASE behavior, and key exchange logic
- No need to reverse-engineer Chrome's TLS behavior — just use Chrome's TLS library

This is what distinguishes it from:
- **OpenSSL** — different cipher suite ordering, different extension handling, different GREASE behavior
- **rustls** — Rust's native TLS library, produces structurally different ClientHellos (no GREASE, different cipher suite preferences, different extension set)

### 2. Post-Quantum Cryptography (ML-KEM)

BoringSSL was the first major TLS library to support **ML-KEM** (the NIST-standardized post-quantum key exchange algorithm), and cloudflare/boring exposes this. Chrome 131+ uses `X25519Kyber768Draft00` as a supported group, and cloudflare/boring supports this via:
```rust
connector.set_curves(&["X25519Kyber768Draft00", "X25519", "P-256"])?;
```

This is important for impersonating the latest Chrome versions, which now include post-quantum key exchange in their ClientHellos.

### 3. FIPS Mode

cloudflare/boring supports **FIPS 140-2/140-3** mode, which is required for some government and enterprise use cases. This is not directly relevant to browser impersonation, but it's a feature that BoringSSL supports and OpenSSL/rustls do not.

### 4. QUIC Support

BoringSSL has built-in QUIC support via `SSL_set_quic_transport_parameters`, which cloudflare/boring exposes. This is essential for HTTP/3 impersonation, since QUIC is the transport protocol for HTTP/3.

### 5. Encrypted Client Hello (ECH)

cloudflare/boring supports **ECH** (Encrypted Client Hello, formerly ESNI), a TLS 1.3 extension that encrypts the SNI and other sensitive fields in the ClientHello. Chrome 119+ supports ECH, and BoringSSL provides the API to enable it.

## What browsercore Can Learn

- **The BoringSSL insight is foundational** — the reason cloudflare/boring can produce byte-identical ClientHellos to Chrome is that it IS Chrome's TLS library. browsercore's pure-TypeScript TLS implementation is the equivalent approach: building TLS from scratch to match BoringSSL's exact behavior. cloudflare/boring validates this architectural choice.
- **Post-quantum key exchange (ML-KEM)** — Chrome 131+ includes `X25519Kyber768Draft00` in its supported groups. browsercore's profiles for Chrome 131+ must include this. cloudflare/boring's support for ML-KEM shows that post-quantum cryptography is a new fingerprint signal to track.
- **Extension ordering control** — the `permute_extensions` flag in cloudflare/boring (which mirrors BoringSSL's `SSL_set_permute_extensions`) is a reference for browsercore's extension ordering logic. Chrome 110+ permutes its TLS extensions, and browsercore should replicate this.
- **GREASE is handled internally** — BoringSSL handles GREASE automatically, while utls and browsercore must generate GREASE values manually. This is a significant complexity difference between the C/Go and Rust approaches.
- **QUIC as a fingerprint signal** — cloudflare/boring's QUIC support (via `SSL_set_quic_transport_parameters`) shows that QUIC transport parameters are a fingerprint signal. browsercore's QUIC implementation should account for this.

## Key Source Files

| File | Purpose |
|------|---------|
| `boring/src/lib.rs` | Main `boring` crate — safe Rust bindings to BoringSSL |
| `boring/src/ssl/mod.rs` | SSL context, connector, stream types |
| `boring/src/ssl/connector.rs` | `SslConnector` — configures ClientHello params |
| `boring/src/x509/mod.rs` | Certificate types |
| `boring/src/crypto/mod.rs` | Crypto primitives (hashing, signing) |
| `tokio-boring/src/lib.rs` | Async I/O wrapper for BoringSSL |
| `hyper-boring/src/lib.rs` | BoringSSL-backed HTTP client |
| `hyper-boring/src/connector.rs` | `HttpsConnector` for hyper |
| `boring-sys/src/lib.rs` | Low-level FFI bindings to BoringSSL C API |
| `boring-sys/build.rs` | Build script — compiles BoringSSL from source |
| `boring-sys/CMakeLists.txt` | BoringSSL build configuration |

## References

- [GitHub](https://github.com/cloudflare/boring)
- [boring crate](https://crates.io/crates/boring)
- [tokio-boring crate](https://crates.io/crates/tokio-boring)
- [hyper-boring crate](https://crates.io/crates/hyper-boring)
- [docs.rs/boring](https://docs.rs/boring/)
- [docs.rs/hyper-boring](https://docs.rs/hyper-boring/)
- [BoringSSL source](https://boringssl.googlesource.com/boringssl/)
- [wreq](https://github.com/0x676e67/wreq) — consumer of cloudflare/boring
- [rquest](https://github.com/penumbra-x/rquest) — another consumer
- [hyper-boring connector](https://github.com/cloudflare/boring/blob/main/hyper-boring/src/connector.rs)
- [SSL connector](https://github.com/cloudflare/boring/blob/main/boring/src/ssl/connector.rs)
