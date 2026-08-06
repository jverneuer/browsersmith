# curl_cffi

**Repository:** https://github.com/lexiforest/curl_cffi
**Language:** Python (CFFI bindings to libcurl-impersonate)
**License:** MIT
**Stars:** ~6,240
**Version:** 0.16.0

## Overview

curl_cffi is the **most popular Python browser-impersonation HTTP client**. It wraps `curl-impersonate` (the lexiforest fork) via CFFI, providing a `requests`-like API. All TLS/HTTP fingerprinting is delegated to the C library; the Python layer is a thin wrapper.

## Architecture

```
Python code
  ↓
curl_cffi.requests / curl_cffi.Curl
  ↓
CFFI bindings to libcurl-impersonate
  ↓
Patched libcurl + BoringSSL/NSS
  ↓
OS TCP/IP stack
```

## Browser Coverage

Convenience aliases resolve to latest: `chrome` → chrome146, `firefox` → firefox147, `safari` → safari2601

| Browser | Versions |
|---------|----------|
| Chrome | 99, 100, 101, 104, 107, 110, 116, 119, 120, 123, 124, 131, 133a, 136, 142, 145, 146 |
| Chrome Android | 99, 131 |
| Edge | 99, 101 |
| Firefox | 133, 135, 144, 147 |
| Safari | 15.3, 15.5, 17.0, 18.0, 18.4, 26.0, 26.0.1 |
| Safari iOS | 17.2, 18.0, 18.4, 26.0 |
| Tor | 14.5 |

## API Surface

Three levels:

```python
# 1. Functional (one-shot)
curl_cffi.get(url, impersonate="chrome", ja3=..., akamai=..., extra_fp=...)

# 2. Session (connection reuse, cookies)
s = curl_cffi.Session(impersonate="chrome")
s.get(url)

# 3. AsyncSession
async with curl_cffi.AsyncSession() as s:
    r = await s.get(url)

# 4. Low-level Curl handle
c = Curl()
c.setopt(CurlOpt.IMPERSONATE, b"chrome")
c.perform()

# 5. CLI
# curl-cffi get tls.browserleaks.com/json --impersonate chrome
# curl-cffi list          # list available fingerprints
# curl-cffi update        # fetch latest fingerprints
```

## Unique Features

### Fingerprint Management System
- `Fingerprint` dataclass — structured representation of every fingerprint signal
- `FingerprintManager` — loads fingerprints from `~/.config/impersonate/fingerprints.json`
- Remote update — `curl-cffi update` pulls latest from `api.impersonate.pro`

### Custom Fingerprint Support
```python
curl_cffi.get(url,
    ja3="771,4865-4866-...",           # raw JA3 string
    akamai="4:16772166|...",            # Akamai HTTP/2 string
    extra_fp={...},                      # granular overrides
)
```

### JA4 Stance
curl_cffi intentionally does NOT accept JA4 strings as input. Their reasoning: JA4 mixes human-readable text with hashed segments; they impersonate the entire packet, making any fingerprint format a derived side-effect.

## What browsercore Can Learn

- The `Fingerprint` dataclass pattern is a clean model for representing all fingerprint signals in a structured way
- The `extra_fp` overlay pattern ("start with Chrome 140, then tweak signature algorithms") could be added to browsercore's profile system
- The remote fingerprint update model decouples fingerprint data from library releases

## References

- [GitHub](https://github.com/lexiforest/curl_cffi)
- [PyPI](https://pypi.org/project/curl-cffi/)
- [Documentation](https://curl-cffi.readthedocs.io/)
- [Fingerprint spec](https://github.com/lexiforest/curl_cffi/blob/main/curl_cffi/requests.py)
