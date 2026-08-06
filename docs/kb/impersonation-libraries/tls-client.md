# tls-client (bogdanfinn/tls-client)

**Repository:** https://github.com/bogdanfinn/tls-client
**Language:** Go (with FFI bindings for Python, Node.js, C#)
**License:** MIT
**Stars:** ~7,000

## Overview

tls-client is the **most popular Go HTTP client for browser fingerprint impersonation**. It composes `utls` (the ClientHello forging engine) with a custom `fhttp` (forked `net/http`) to produce a full HTTP stack whose wire bytes match real browsers. It ships **100+ browser profiles** with version-specific ClientHello and HTTP/2 configurations, and exposes language bindings so Python, Node.js, and C# callers can use the same profile database.

## Architecture

```
User code (Go / Python / Node.js / C#)
  ↓
tls-client API — Session, Request, Response
  ↓
fhttp (forked net/http) — custom transport, header ordering, cookie jar
  ↓
utls.UConn — ClientHello forging with per-profile specs
  ↓
Browser Profile Registry — versioned ClientHello + HTTP/2 configs
  ↓
OS TCP/IP stack (with protocol racing for HTTP/1.1 / HTTP/2 / HTTP/3)
```

## Browser Coverage

Profiles are accessed via a typed constants API:

| Browser | Example Profiles |
|---------|-----------------|
| Chrome | `profiles.Chrome_144`, `profiles.Chrome_131`, `profiles.Chrome_124`, ... |
| Firefox | `profiles.Firefox_120`, `profiles.Firefox_117`, ... |
| Safari | `profiles.Safari_15_6_1`, `profiles.Safari_18_0`, ... |
| Edge | `profiles.Edge_122`, ... |
| Opera | `profiles.Opera_106`, ... |
| OkHttp (Android) | `profiles.OkHttp_4_10`, `profiles.OkHttp_3_12`, ... |

Total: **100+ profiles** spanning Chrome 58+, Firefox 55+, Safari 12+, Edge 80+, and Android OkHttp clients.

## API Surface

### Go

```go
// Create a client with a specific browser profile
client, err := tls_client.NewHttpClient(tls_client.NewNoopLogger(),
    tls_client.WithClientProfile(profiles.Chrome_144),
)

// Or use the default (random profile per session)
client, err := tls_client.NewHttpClient(tls_client.NewNoopLogger())

// Standard net/http-style API
req, _ := http.NewRequest("GET", "https://example.com", nil)
resp, err := client.Do(req)

// Per-request overrides
client.SetCookies("https://example.com", []*http.Cookie{{...}})
client.SetProxy("http://proxy:8080")
client.SetHeaderOrder([]string{":method", ":authority", ":scheme", ":path"})
```

### Profile Options

```go
// Full profile configuration
options := []tls_client.HttpClientOption{
    tls_client.WithTimeoutSeconds(30),
    tls_client.WithClientProfile(profiles.Chrome_144),
    tls_client.WithNotFollowRedirects(),
    tls_client.WithInsecureSkipVerify(),
    tls_client.WithRandomTLSExtensionOrder(true),   // per-connection randomization
    tls_client.WithCookieJar(noopJar),               // custom cookie jar
    tls_client.WithProxyUrl("socks5://..."),
    tls_client.WithForceHttp1(),                     // pin to HTTP/1.1
    tls_client.WithHeader(map[string]string{...}),
    tls_client.WithHeaderOrder([]string{...}),
}
```

### Python (via FFI)

```python
import tls_client

session = tls_client.Session(
    client_identifier="chrome_144",
    random_tls_extension_order=True,
)

response = session.get("https://example.com")
response = session.post("https://example.com", json={"key": "value"})
```

### Node.js (via FFI)

```js
const { default: tlsClient } = require("tls-client");

const client = new tlsClient.Session({
  clientIdentifier: "chrome_144",
  random_tls_extension_order: true,
});

const response = await client.get("https://example.com");
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4)
- Cipher suites (full ordered list per profile)
- TLS extensions (full ordered list, per-extension config)
- Supported groups / elliptic curves
- Signature algorithms
- GREASE (with per-connection randomization option)
- ALPN
- Session tickets
- Supported versions
- EC point formats
- Key share groups
- TLS extension ordering (`random_tls_extension_order` flag)

### HTTP/2
- SETTINGS frame values + order
- WINDOW_UPDATE initial value
- Stream priority
- Pseudo-header order
- Header ordering (customizable via `SetHeaderOrder`)

### HTTP/1.1
- Custom header ordering
- Connection header handling
- User-Agent per profile
- Accept-Language per profile

### HTTP/3 / QUIC
- Supported via protocol racing (attempts HTTP/3, falls back to HTTP/2 / HTTP/1.1)
- QUIC transport parameters per profile

## Unique Features

### 1. Profile Registry as a First-Class Concept

The `profiles` package is a **typed, versioned registry** of browser fingerprints. Each profile is a struct with complete ClientHello + HTTP/2 config — not just a JA3 hash. This makes it easy to add new browser versions by adding a new struct constant.

### 2. Protocol Racing

The client automatically negotiates the best protocol. It races HTTP/3 → HTTP/2 → HTTP/1.1 and uses whatever the server supports, while maintaining the correct fingerprint for each protocol.

### 3. Per-Connection Extension Randomization

`random_tls_extension_order=True` randomizes the TLS extension order on each connection while keeping the profile's cipher suites and other signals stable. This avoids fingerprint-based rate limiting that targets clients with identical extension orders.

### 4. Multi-Language Bindings

Python, Node.js, and C# bindings all use the same Go core via FFI. This means the profile database is maintained once and consumed everywhere. The Python port (`python-tls-client`) is widely used in the scraping community.

### 5. Header Ordering as a Configurable Signal

Unlike most Go HTTP clients that alphabetize headers, tls-client preserves the exact header ordering that each browser uses. The `SetHeaderOrder` API allows callers to customize this per-request.

## What browsercore Can Learn

- **The profile registry pattern** — a typed, versioned registry of complete browser configs is more maintainable than browsercore's current profile-per-file approach. The `profiles.Chrome_144` naming convention (browser_version) is a clean way to version fingerprints.
- **Protocol racing** — browsercore's ALPN dispatch is single-protocol per connection. tls-client's protocol racing (attempt HTTP/3, fall back to HTTP/2) is a pragmatic approach that maximizes compatibility while maintaining fingerprints for each protocol.
- **Per-connection extension randomization** — the `random_tls_extension_order` flag is a simple but effective anti-fingerprinting measure. browsercore could add a similar option to its profile system.
- **Header ordering as a configurable signal** — tls-client's `SetHeaderOrder` API shows that header ordering is a first-class fingerprint signal, not an afterthought. browsercore already treats it this way, but tls-client's per-request override is a useful pattern.
- **Multi-language via FFI** — the pattern of maintaining a Go core with language bindings is an alternative to browsercore's pure-TypeScript approach. It trades portability for profile database reuse.

## Key Source Files

| File | Purpose |
|------|---------|
| `http_client.go` | Main `HttpClient` type — composes transport, cookie jar, redirect policy |
| `session.go` | `Session` — higher-level API with persistent state |
| `profiles/` | Registry of all browser profiles (`chrome.go`, `firefox.go`, etc.) |
| `profiles/profiles.go` | Profile type definition and lookup |
| `custom_chrome.go` | Chrome-specific ClientHello + HTTP/2 config details |
| `custom_firefox.go` | Firefox-specific config details |
| `custom_safari.go` | Safari-specific config details |
| `cookie.go` | Cookie jar implementation |
| `header.go` | Header ordering logic |
| `connection.go` | Protocol negotiation and connection management |
| `go.mod` | Shows dependency on `utls` and `fhttp` |
| `examples/` | Usage examples for Go, Python, Node.js |

## References

- [GitHub](https://github.com/bogdanfinn/tls-client)
- [Go documentation](https://pkg.go.dev/github.com/bogdanfinn/tls-client)
- [Profiles package](https://github.com/bogdanfinn/tls-client/tree/master/profiles)
- [Chrome profiles](https://github.com/bogdanfinn/tls-client/blob/master/profiles/chrome.go)
- [Firefox profiles](https://github.com/bogdanfinn/tls-client/blob/master/profiles/firefox.go)
- [Safari profiles](https://github.com/bogdanfinn/tls-client/blob/master/profiles/safari.go)
- [HTTP client](https://github.com/bogdanfinn/tls-client/blob/master/http_client.go)
- [Python bindings](https://github.com/bogdanfinn/tls-client/tree/master/bindings/python)
- [Node.js bindings](https://github.com/bogdanfinn/tls-client/tree/master/bindings/node)
