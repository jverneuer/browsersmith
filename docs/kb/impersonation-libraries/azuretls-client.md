# azuretls-client (Noooste/azuretls-client)

**Repository:** https://github.com/Noooste/azuretls-client
**Language:** Go (with CFFI bindings for other languages)
**License:** MIT
**Stars:** ~1,000

## Overview

azuretls-client is an **easy-to-use Go HTTP client** that mimics Chrome by default, with a focus on ergonomics and browser-fidelity defaults. It supports HTTP/3, WebSocket, proxy chaining, and SSL pinning, and features a first-class `OrderedHeaders` type for browser-like header ordering. It's designed to be a drop-in replacement for Go's `net/http` with browser fingerprinting built in.

## Architecture

```
User code (Go or other languages via CFFI)
  ↓
azuretls.Session — HTTP client with browser defaults
  ↓
Custom transport — HTTP/1.1, HTTP/2, HTTP/3 dispatch
  ↓
TLS config — browser-matching ClientHello (Chrome by default)
  ↓
OS TCP/IP stack
```

## Browser Coverage

| Browser | Support |
|---------|---------|
| Chrome | Default profile (mimics latest Chrome) |
| Firefox | Supported |
| Safari | Supported |
| Edge | Supported |
| Custom | Via fingerprint overrides |

Unlike tls-client's 100+ named profiles, azuretls-client uses **Chrome as the default** and allows overrides via fingerprint signals. This is a simpler model that prioritizes ease of use over comprehensive profile coverage.

## API Surface

### Go

```go
import "github.com/Noooste/azuretls-client"

// Create a session (Chrome by default)
session := azuretls.NewSession()

// Make a request
resp, err := session.Get("https://example.com")
if err != nil { log.Fatal(err) }
fmt.Println(resp.StatusCode, string(resp.Body))

// POST with JSON
resp, err := session.Post("https://example.com/api",
    azuretls.BodyJSON(map[string]string{"key": "value"}))

// OrderedHeaders for browser-like header ordering
session.OrderedHeaders = azuretls.OrderedHeaders{
    {":method", "GET"},
    {":authority", "example.com"},
    {":scheme", "https"},
    {":path", "/"},
    {"User-Agent", "Mozilla/5.0 ..."},
    {"Accept", "text/html,application/xhtml+xml"},
    {"Accept-Language", "en-US,en;q=0.9"},
    {"Accept-Encoding", "gzip, deflate, br"},
}

// Proxy chaining
session.SetProxy("http://proxy1:8080->http://proxy2:8080")

// SSL pinning
session.AddPinnedDomain("example.com", []byte("certificate_hash"))

// HTTP/3
session.Http3 = true

// Custom TLS config
session.InsecureSkipVerify = true

// Close session
session.Close()
```

### Session Configuration

```go
session := azuretls.NewSession()

// Browser profile
session.Browser = azuretls.Chrome  // or Firefox, Safari, Edge

// Timeout
session.Timeout = 30 * time.Second

// Redirects
session.RedirectCallback = func(req *azuretls.Request, via []*azuretls.Request) error {
    return nil // follow redirects
}

// Cookie jar
session.CookieJar = ...

// Header ordering
session.OrderedHeaders = azuretls.OrderedHeaders{...}

// Proxy (supports chaining)
session.SetProxy("socks5://user:pass@proxy:1080")

// SSL pinning
session.AddPinnedDomain("example.com", pinnedHash)
```

### CFFI Bindings

```c
// CFFI bindings for Python, Node.js, etc.
// Session is opaque handle, methods exposed as C functions
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4)
- Cipher suites (Chrome-like by default)
- TLS extensions
- Supported groups / elliptic curves
- Signature algorithms
- GREASE
- ALPN
- Session tickets
- Supported versions

### HTTP/2
- SETTINGS frame values
- WINDOW_UPDATE initial value
- Pseudo-header order
- Stream priority

### HTTP/1.1
- Header ordering (first-class `OrderedHeaders` type)
- User-Agent per profile
- Accept-Language per profile

### HTTP/3 / QUIC
- HTTP/3 transport
- QUIC transport parameters
- HTTP/3 SETTINGS

## Unique Features

### 1. OrderedHeaders as a First-Class Feature

The `OrderedHeaders` type is a core concept in azuretls-client, not an afterthought. It's a typed slice of header key-value pairs that preserves the exact order specified by the caller. This is critical for browser impersonation because:
- Real browsers send headers in a specific order (not alphabetized)
- Some WAFs use header order as a fingerprint signal
- Pseudo-header order (`:method`, `:authority`, `:scheme`, `:path`) is part of the HTTP/2 fingerprint

The fact that it's a named type (`OrderedHeaders` rather than `map[string]string`) signals that header ordering is a first-class concern.

### 2. Chrome by Default

azuretls-client mimics Chrome by default, with no profile configuration needed. This "batteries included" approach makes it easy to get started — you get a working browser fingerprint without needing to choose a profile. This contrasts with tls-client's approach of requiring an explicit profile selection.

### 3. Proxy Chaining

The `SetProxy` method supports proxy chaining via the `->` syntax: `"http://proxy1:8080->http://proxy2:8080"`. This is a unique feature that allows traffic to flow through multiple proxies, useful for scraping operations that require IP rotation.

### 4. SSL Pinning

`AddPinnedDomain` allows callers to pin specific domains to expected certificate hashes. This is typically a security feature, but in the impersonation context it ensures the client is connecting to the expected server (avoiding MITM proxies that might interfere with fingerprinting).

### 5. Ergonomic Go API

The API is designed to be a drop-in replacement for `net/http`:
- `session.Get(url)` instead of `http.Get(url)`
- `session.Post(url, body)` instead of `http.Post(url, ...)`
- Cookie jar support
- Redirect callbacks
- Timeout as a simple duration

## What browsercore Can Learn

- **OrderedHeaders as a first-class type** — azuretls-client's `OrderedHeaders` type is a good model for how to represent header ordering in a typed way. browsercore's `@browsercore/profiles` could benefit from a similar explicit type for header ordering.
- **Chrome by default** — the "batteries included" approach (mimic Chrome by default, no config needed) is more ergonomic than requiring explicit profile selection. browsercore could offer a default profile that's "latest Chrome" for callers who don't need specific version control.
- **Proxy chaining** — the `->` proxy chaining syntax is a simple but useful feature for IP rotation. browsercore's proxy support could adopt a similar chaining mechanism.
- **Simplicity vs. coverage** — azuretls-client trades profile coverage for ease of use. browsercore's comprehensive profile system (10+ browser versions) is more thorough, but azuretls-client's "just works" approach is a good reminder that ease of use matters.

## Key Source Files

| File | Purpose |
|------|---------|
| `session.go` | Main `Session` type — HTTP client with browser defaults |
| `request.go` | Request type and methods |
| `response.go` | Response type |
| `ordered_headers.go` | `OrderedHeaders` type definition and methods |
| `tls_config.go` | TLS configuration (Chrome by default) |
| `http2.go` | HTTP/2 transport and SETTINGS |
| `http3.go` | HTTP/3 transport |
| `websocket.go` | WebSocket support |
| `proxy.go` | Proxy support (including chaining) |
| `ssl_pinning.go` | SSL pinning implementation |
| `cookie.go` | Cookie jar integration |
| `bindings/` | CFFI bindings for other languages |

## References

- [GitHub](https://github.com/Noooste/azuretls-client)
- [Go documentation](https://pkg.go.dev/github.com/Noooste/azuretls-client)
- [Session type](https://github.com/Noooste/azuretls-client/blob/main/session.go)
- [OrderedHeaders](https://github.com/Noooste/azuretls-client/blob/main/ordered_headers.go)
- [TLS config](https://github.com/Noooste/azuretls-client/blob/main/tls_config.go)
- [HTTP/3 support](https://github.com/Noooste/azuretls-client/blob/main/http3.go)
- [SSL pinning](https://github.com/Noooste/azuretls-client/blob/main/ssl_pinning.go)
