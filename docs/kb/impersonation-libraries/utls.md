# utls (refraction-networking/utls)

**Repository:** https://github.com/refraction-networking/utls
**Language:** Go
**License:** BSD-3-Clause
**Stars:** ~6,500

## Overview

utls is the **foundational TLS ClientHello forging engine** that most Go-based impersonation tools build on. It's a fork of Go's `crypto/tls` that provides low-level access to the ClientHello message, allowing you to parrot real browsers or craft custom fingerprints.

## Architecture

```
User code
  ↓
utls.UConn (extends tls.Conn)
  ↓
ClientHelloSpec — structured config for the ClientHello
  ↓
crypto/tls (modified) — builds the wire bytes from the spec
  ↓
OS TCP/IP stack
```

## Key Concepts

### ClientHelloSpec
A Go struct that fully describes a ClientHello:
```go
type ClientHelloSpec struct {
    CipherSuites       []uint16
    CompressionMethods []uint8
    Extensions         []TLSExtension  // ordered list
    TLSVersMax         uint16
    TLSVersMin         uint16
    GreaseStyle        []GREASESample
    SessionTicket      []byte
}
```

### Predefined Hellos
- `HelloChrome_Auto` — auto-negotiates Chrome version
- `HelloFirefox_Auto` — auto-negotiates Firefox version
- `HelloSafari_Auto` — Safari
- `HelloIOS_Auto` — iOS
- `HelloRandomized` — random but valid
- `HelloCustom` — full manual control

### Roller
A `Roller` automatically cycles through a list of fingerprints, getting a new one per connection via `Roller.GetClientHelloSpec()`.

## Browser Coverage

Parrots Chrome (58-120+), Firefox (55-120+), Safari, iOS, Android. Because it's a low-level engine, the actual browser coverage depends on what the consumer configures.

## Fingerprint Signals Controlled

- Cipher suites (full ordered list)
- TLS extensions (full ordered list, each extension individually configurable)
- Supported groups / elliptic curves
- Signature algorithms
- GREASE behavior (including GREASE in extensions, cipher suites, supported_versions)
- ALPN
- Session tickets (fake)
- Key share groups
- Supported versions
- EC point formats
- PKCS#1 padding
- Custom extension data

## What browsercore Can Learn

- The `ClientHelloSpec` pattern — a fully structured, serializable description of a ClientHello — is a good model for browsercore's profile data
- The `Roller` pattern — automatic fingerprint rotation — is useful for avoiding fingerprint-based rate limiting
- The GREASE handling (including GREASE in supported_versions and session_id) is more complete than browsercore's current implementation

## Key Source Files

| File | Purpose |
|------|---------|
| `u_conn.go` | UConn — extended tls.Conn with ClientHello control |
| `u_parrots.go` | Predefined browser Hello configs |
| `grease.go` | GREASE value generation and handling |
| `u_fingerprinter.go` | ClientHello fingerprinting (for capture/replay) |
| `extensions.go` | TLS extension definitions and encoders |

## References

- [GitHub](https://github.com/refraction-networking/utls)
- [Documentation](https://pkg.go.dev/github.com/refraction-networking/utls)
- [ClientHelloSpec](https://github.com/refraction-networking/utls/blob/master/u_conn.go)
- [Predefined Hellos](https://github.com/refraction-networking/utls/blob/master/u_parrots.go)
