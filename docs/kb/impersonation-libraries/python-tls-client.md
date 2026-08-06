# Python-Tls-Client (FlorianREGAZ/Python-Tls-Client)

**Repository:** https://github.com/FlorianREGAZ/Python-Tls-Client
**Language:** Python (wraps bogdanfinn's Go tls-client via CFFI)
**License:** MIT
**Stars:** ~1,000

## Overview

Python-Tls-Client is the **most widely used Python port** of bogdanfinn's Go `tls-client`. It wraps the Go binary via CFFI, providing a `requests`-inspired API with browser fingerprint impersonation. It ships pre-built `.so`/`.dylib`/`.dll` binaries for all major platforms, so callers don't need a Go toolchain. It supports Chrome 103-120, Firefox 102-120, Opera 89/90, Safari 15/16, iOS, and Android OkHttp, with the `random_tls_extension_order=True` option for per-connection extension randomization.

## Architecture

```
Python code
  ↓
Python-Tls-Client API (requests-inspired)
  ↓
CFFI bindings to Go tls-client shared library (.so/.dylib/.dll)
  ↓
Go tls-client — composes utls + fhttp
  ↓
Browser profile configs
  ↓
OS TCP/IP stack
```

## Browser Coverage

| Browser | Versions |
|---------|----------|
| Chrome | 103, 104, 107, 110, 116, 119, 120 |
| Firefox | 102, 109, 117, 120 |
| Opera | 89, 90 |
| Safari | 15, 16 |
| iOS | OkHttp-based |
| Android | OkHttp-based |

Browser profiles are identified by `client_identifier` strings:
```python
session = tls_client.Session(client_identifier="chrome_120")
session = tls_client.Session(client_identifier="firefox_117")
session = tls_client.Session(client_identifier="safari_16")
session = tls_client.Session(client_identifier="opera_90")
```

## API Surface

```python
import tls_client

# Create a session with a specific browser profile
session = tls_client.Session(
    client_identifier="chrome_120",
    random_tls_extension_order=True,
)

# requests-inspired API
response = session.get("https://example.com")
response = session.post("https://example.com", json={"key": "value"})
response = session.put("https://example.com", data="body")
response = session.delete("https://example.com")
response = session.head("https://example.com")

# Response object
print(response.status_code)   # int
print(response.text)          # str
print(response.json())        # dict
print(response.headers)       # dict
print(response.cookies)       # dict
print(response.url)           # str

# Request customization
response = session.get(
    "https://example.com",
    headers={"Accept-Language": "en-US"},
    cookies={"session": "abc123"},
    proxy="http://proxy:8080",
    timeout=30,
    allow_redirects=True,
)

# Per-request profile override
response = session.get(
    "https://example.com",
    client_identifier="firefox_117",  # override for this request only
)

# Close the session
session.close()
```

### `random_tls_extension_order`

```python
# Randomize TLS extension order per-connection
# This avoids fingerprint-based rate limiting
session = tls_client.Session(
    client_identifier="chrome_120",
    random_tls_extension_order=True,
)
```

## Fingerprint Signals Controlled

### TLS (JA3/JA4)
- Cipher suites (per profile)
- TLS extensions (per profile, with optional per-connection randomization)
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
- Header ordering

### HTTP/1.1
- Custom header ordering
- User-Agent per profile
- Accept-Language per profile
- Cookie handling

## Unique Features

### 1. Pre-Built Binaries

Python-Tls-Client ships **pre-compiled `.so`/`.dylib`/`.dll` binaries** for all major platforms (Linux, macOS, Windows, x64/arm64). This means callers can `pip install python-tls-client` without needing a Go toolchain. The binaries are bundled in the wheel, making installation trivial.

### 2. `requests`-Inspired API

The API is modeled after Python's `requests` library — the most popular HTTP library in Python. This makes it easy for Python developers to adopt:
- `session.get(url)` — familiar syntax
- `response.status_code`, `response.text`, `response.json()` — familiar response object
- `session.post(url, json=...)` — familiar request methods

### 3. Per-Request Profile Override

The `client_identifier` parameter can be overridden on a per-request basis, allowing callers to use different browser profiles for different requests within the same session. This is useful for multi-target scraping where different sites may respond better to different fingerprints.

### 4. `random_tls_extension_order`

The `random_tls_extension_order=True` flag randomizes the TLS extension order on each connection while keeping all other fingerprint signals stable. This is a simple but effective anti-fingerprinting measure that avoids detection based on identical extension orders across requests.

### 5. Session Persistence

Like `requests.Session`, the Python-Tls-Client session persists cookies, headers, and other state across requests. This mimics real browser behavior where cookies set in one request are sent in subsequent requests.

## What browsercore Can Learn

- **The `requests`-inspired API** — making the API familiar to Python developers is a strong usability pattern. browsercore's API is designed for TypeScript ergonomics, but the principle of mirroring the ecosystem's most popular HTTP library applies.
- **Per-request profile override** — the ability to override the browser profile on a per-request basis within a persistent session is useful for multi-target scenarios. browsercore could support this via a per-request profile override in its `crawl()` helper.
- **Pre-built binaries for all platforms** — shipping pre-compiled binaries removes the installation barrier. browsercore's pure-TypeScript approach avoids this problem entirely, but the pattern is worth noting for any future native components.
- **Session persistence model** — the `requests.Session` model (cookies, headers, and state persisted across requests) is a good pattern for browsercore's `crawl()` helper, which already maintains a shared client and cookie jar.

## Key Source Files

| File | Purpose |
|------|---------|
| `tls_client/__init__.py` | Package entry point — exports `Session` |
| `tls_client/session.py` | `Session` type — wraps Go tls-client via CFFI |
| `tls_client/response.py` | `Response` type — `requests`-inspired response object |
| `tls_client/cookies.py` | Cookie handling |
| `tls_client/profiles.py` | Browser profile definitions |
| `tls_client/settings.py` | Session settings (proxy, timeout, redirects) |
| `tls_client/build/` | Pre-built Go binaries (.so/.dylib/.dll) |
| `setup.py` / `pyproject.toml` | Package configuration — includes prebuilt binaries in wheel |

## References

- [GitHub](https://github.com/FlorianREGAZ/Python-Tls-Client)
- [PyPI](https://pypi.org/project/python-tls-client/)
- [Session type](https://github.com/FlorianREGAZ/Python-Tls-Client/blob/main/tls_client/session.py)
- [Response type](https://github.com/FlorianREGAZ/Python-Tls-Client/blob/main/tls_client/response.py)
- [Pre-built binaries](https://github.com/FlorianREGAZ/Python-Tls-Client/tree/main/tls_client/build)
- [Go tls-client](https://github.com/bogdanfinn/tls-client) — underlying Go library
