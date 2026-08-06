# HTTP/1.1 Header Ordering Fingerprint

HTTP/1.1 header ordering is a fingerprint signal that WAFs use to distinguish real browsers from automated clients. Even when TLS and HTTP/2 fingerprints match, a wrong header order is detectable.

**Detection risk: High.** Header order is checked by Akamai, Cloudflare, and PerimeterX. It is also a component of JA4H.

---

## Header Order as a JA4H Signal

JA4H (HTTP-layer fingerprint) captures the header count and the Accept-Language value as part of its prefix. The full header order is used by WAFs that compute a hash over the header names in order.

---

## Per-Browser Header Order Reference

### Chrome 131+ (Desktop)

```
:method: GET
:authority: tls.peet.ws
:scheme: https
:path: /api/all
sec-ch-ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "macOS"
upgrade-insecure-requests: 1
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
sec-fetch-site: none
sec-fetch-mode: navigate
sec-fetch-user: ?1
sec-fetch-dest: document
accept-encoding: gzip, deflate, br, zstd
accept-language: en-US,en;q=0.9
priority: u=0, i
```

**Header count:** 16 (including pseudo-headers) or 12 (regular headers only)

**Key signals:**
- `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform` come BEFORE `user-agent`
- `sec-fetch-*` headers are Chrome-specific
- `priority: u=0, i` is Chrome-specific
- `accept-encoding` includes `zstd` (Chrome 131+)
- No `connection` header (HTTP/2 and HTTP/1.1 keep-alive default)

### Firefox 133 (Desktop)

```
:method: GET
:path: /api/all
:authority: tls.peet.ws
:scheme: https
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0
accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
accept-language: en-US,en;q=0.5
accept-encoding: gzip, deflate, br, zstd
upgrade-insecure-requests: 1
sec-fetch-dest: document
sec-fetch-mode: navigate
sec-fetch-site: none
sec-fetch-user: ?1
priority: u=0, i
te: trailers
```

**Key signals:**
- `user-agent` comes FIRST among regular headers (before accept)
- `accept-language: en-US,en;q=0.5` (note: `q=0.5`, not `q=0.9`)
- `te: trailers` (Firefox-specific, signals HTTP/2 support)
- No `sec-ch-ua*` headers (Firefox doesn't send Client Hints by default)
- `sec-fetch-*` headers present but in different order than Chrome

### Safari 18.4 (Desktop)

```
:method: GET
:scheme: https
:authority: tls.peet.ws
:path: /api/all
sec-fetch-dest: document
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15
accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
sec-fetch-site: none
sec-fetch-mode: navigate
accept-language: en-US,en;q=0.9
priority: u=0, i
accept-encoding: gzip, deflate, br
```

**Key signals:**
- Minimal header set (only 12 regular headers)
- `sec-fetch-dest` comes BEFORE `user-agent`
- No `upgrade-insecure-requests` header (Safari doesn't send it)
- `accept-encoding` does NOT include `zstd` (Safari doesn't support zstd as of 18.4)
- No `te: trailers` header
- No `sec-ch-ua*` headers
- `priority: u=0, i` is present (Safari supports HTTP/2 priority)

---

## Header Order Comparison Table

| Position | Chrome | Firefox | Safari |
|---|---|---|---|
| 1 | sec-ch-ua | user-agent | sec-fetch-dest |
| 2 | sec-ch-ua-mobile | accept | user-agent |
| 3 | sec-ch-ua-platform | accept-language | accept |
| 4 | upgrade-insecure-requests | accept-encoding | sec-fetch-site |
| 5 | user-agent | upgrade-insecure-requests | sec-fetch-mode |
| 6 | accept | sec-fetch-dest | accept-language |
| 7 | sec-fetch-site | sec-fetch-mode | priority |
| 8 | sec-fetch-mode | sec-fetch-site | accept-encoding |
| 9 | sec-fetch-user | sec-fetch-user | — |
| 10 | sec-fetch-dest | priority | — |
| 11 | accept-encoding | te: trailers | — |
| 12 | accept-language | — | — |
| 13 | priority | — | — |

---

## Connection Header

The `Connection` header is obsolete in HTTP/2 but still appears in HTTP/1.1 connections.

| Browser | Connection header |
|---|---|
| Chrome | Not sent (HTTP/1.1 keep-alive is default) |
| Firefox | Not sent |
| Safari | Not sent |

**Note:** HTTP/2 forbids the `Connection` header (RFC 7540 §8.1.2.2). Sending it in HTTP/2 is a protocol violation.

---

## Accept-Encoding Header

The `Accept-Encoding` header signals which compression algorithms the client supports.

| Browser | Value |
|---|---|
| Chrome 131+ | `gzip, deflate, br, zstd` |
| Firefox 133+ | `gzip, deflate, br, zstd` |
| Safari 18.4 | `gzip, deflate, br` |

**Key signal:** Chrome and Firefox added `zstd` support in recent versions. Safari does not send `zstd`. A Chrome client without `zstd` is detectable (it would match an older Chrome profile).

---

## TE Header

The `TE` header signals transfer encoding preferences.

| Browser | TE header |
|---|---|
| Chrome | Not sent |
| Firefox | `TE: trailers` |
| Safari | Not sent |

Firefox sends `TE: trailers` to signal that it can handle chunked trailers (used in HTTP/2). This is a Firefox-specific signal.

---

## Header Case Sensitivity

HTTP/1.1 header names are case-insensitive (RFC 7230 §3.2). However, browsers use specific casing that WAFs can check.

### Per-Browser Header Casing

| Header | Chrome | Firefox | Safari |
|---|---|---|---|
| `sec-ch-ua` | camelCase | — | — |
| `sec-ch-ua-mobile` | camelCase | — | — |
| `sec-ch-ua-platform` | camelCase | — | — |
| `user-agent` | camelCase | camelCase | camelCase |
| `accept-encoding` | camelCase | camelCase | camelCase |
| `accept-language` | camelCase | camelCase | camelCase |
| `sec-fetch-site` | camelCase | camelCase | camelCase |
| `sec-fetch-mode` | camelCase | camelCase | camelCase |
| `sec-fetch-user` | camelCase | camelCase | camelCase |
| `sec-fetch-dest` | camelCase | camelCase | camelCase |

**Note:** Chrome uses camelCase for `sec-ch-ua` (not `Sec-CH-UA`). Some implementations incorrectly capitalize the Client Hints headers, which is detectable.

### HTTP/2 Pseudo-Header Casing

In HTTP/2, pseudo-headers are always lowercase (RFC 7540 §8.1.2.1). Using uppercase (e.g., `:Method` instead of `:method`) is a protocol violation.

---

## Header Value Ordering Within Multi-Value Headers

### Accept Header

The `Accept` header can contain multiple MIME types separated by commas, with quality parameters.

| Browser | Accept value |
|---|---|
| Chrome | `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7` |
| Firefox | `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` |
| Safari | `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` |

**Key differences:**
- Chrome lists specific image types (`image/avif,image/webp,image/apng`)
- Firefox and Safari fall back to `*/*;q=0.8`
- Chrome includes `application/signed-exchange;v=b3;q=0.7` (signed exchange support)

### Accept-Language Header

| Browser | Accept-Language value |
|---|---|
| Chrome | `en-US,en;q=0.9` |
| Firefox | `en-US,en;q=0.5` |
| Safari | `en-US,en;q=0.9` |

**Key signal:** Firefox uses `q=0.5` for the fallback language, while Chrome and Safari use `q=0.9`.

---

## Sec-CH-UA (Client Hints) Headers

Client Hints are sent by Chrome and (optionally) by Firefox/Safari with different values.

### sec-ch-ua (Brand List)

Chrome sends a list of browser brands and versions:
```
sec-ch-ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"
```

The brand list format is defined in [Client Hints Infrastructure](https://wicg.github.io/client-hints-infrastructure/) and [UA Client Hints](https://wicg.github.io/ua-client-hints/).

### sec-ch-ua-mobile

```
sec-ch-ua-mobile: ?0    (desktop)
sec-ch-ua-mobile: ?1    (mobile)
```

### sec-ch-ua-platform

```
sec-ch-ua-platform: "macOS"
sec-ch-ua-platform: "Windows"
sec-ch-ua-platform: "Linux"
sec-ch-ua-platform: "Android"
sec-ch-ua-platform: "Chrome OS"
```

**Detection:** A Chrome client that sends `sec-ch-ua-platform: "macOS"` but has a Windows User-Agent is detectable.

---

## Sec-Fetch Headers

The `Sec-Fetch-*` headers are sent by all modern browsers (Chrome, Firefox, Safari, Edge). They describe the request context.

| Header | Meaning | Chrome default |
|---|---|---|
| `sec-fetch-site` | Relationship to origin | `none` (top-level nav), `same-origin`, `same-site`, `cross-site` |
| `sec-fetch-mode` | Request mode | `navigate`, `no-cors`, `cors`, `same-origin`, `websocket` |
| `sec-fetch-user` | Was the request user-activated? | `?1` (yes), `?0` (no), or absent |
| `sec-fetch-dest` | Destination type | `document`, `empty`, `image`, `script`, `style`, `worker` |

For a top-level navigation to a new origin:
```
sec-fetch-site: none
sec-fetch-mode: navigate
sec-fetch-user: ?1
sec-fetch-dest: document
```

**Detection:** A request that fetches an image but has `sec-fetch-mode: navigate` is detectable. Mismatch between the actual request and Sec-Fetch headers is a strong bot signal.

---

## HTTP/2 Specific Header Notes

### Pseudo-Headers Take Priority

In HTTP/2, pseudo-headers (`:method`, `:authority`, `:scheme`, `:path`) MUST appear before regular headers and are encoded in the HEADERS frame's header block. They are not regular headers.

### Connection-Specific Headers Forbidden

The following headers are forbidden in HTTP/2 (RFC 7540 §8.1.2.2):
- `Connection`
- `Keep-Alive`
- `Proxy-Connection`
- `Transfer-Encoding`
- `Upgrade`

Sending any of these in an HTTP/2 HEADERS frame is a protocol violation.

---

## Implementation Notes for browsercore

1. **Header order must match the target browser exactly.** Even one header out of place changes the fingerprint.

2. **Chrome's sec-ch-ua headers MUST come before user-agent.** This is a Chrome-specific convention.

3. **Firefox MUST send `TE: trailers`** — it's a Firefox-specific signal.

4. **Safari MUST NOT send `upgrade-insecure-requests`** — Safari doesn't implement this.

5. **Accept-Encoding must include `zstd` for Chrome 131+ and Firefox 133+.** Safari does not send `zstd`.

6. **Accept-Language must use `q=0.5` for Firefox** and `q=0.9` for Chrome/Safari.

7. **Sec-Fetch headers must be consistent with the actual request.** A cross-origin image fetch with `sec-fetch-site: none` is detectable.

8. **Client Hints (sec-ch-ua*) must match the User-Agent.** A macOS platform claim with a Windows UA is a mismatch.

---

## References

- [RFC 7230 §3.2](https://datatracker.ietf.org/doc/html/rfc7230#section-3.2) — HTTP/1.1 header fields
- [RFC 7231 §5.3.2](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.2) — Accept-Encoding
- [RFC 7231 §5.3.4](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.4) — Accept-Language
- [RFC 7231 §5.3.3](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.3) — Accept
- [RFC 7540 §8.1.2.1](https://datatracker.ietf.org/doc/html/rfc7540#section-8.1.2.1) — HTTP/2 pseudo-headers
- [RFC 7540 §8.1.2.2](https://datatracker.ietf.org/doc/html/rfc7540#section-8.1.2.2) — Connection-specific headers forbidden
- [Fetch Metadata](https://w3c.github.io/webappsec-fetch-metadata/) — Sec-Fetch-* headers
- [UA Client Hints](https://wicg.github.io/ua-client-hints/) — sec-ch-ua headers
- [FoxIO-LLC/ja4](https://github.com/FoxIO-LLC/ja4) — JA4H specification
