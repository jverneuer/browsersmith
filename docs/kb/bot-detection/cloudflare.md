# Cloudflare Bot Management

**Product:** Cloudflare Bot Management / Turnstile
**Fingerprint Approach:** Multi-layer: JA4 TLS fingerprint + HTTP/2 analysis + header consistency + JavaScript challenges

## Overview

Cloudflare uses a **multi-layered approach** to bot detection. The cheapest checks (TLS + HTTP/2 fingerprints) run on every connection. More expensive checks (JavaScript challenges, behavioral analysis) are reserved for suspicious clients.

## Detection Layers

### Layer 1: TLS Fingerprint (JA4)
Cloudflare has moved from JA3 to **JA4+** for TLS fingerprinting. JA4 provides more granular fingerprinting with separate components for:
- Connection prefix (JA4_a)
- Cipher suites (JA4_b)
- Extensions (JA4_c)
- Raw fields (JA4_f)

Cloudflare checks that the TLS fingerprint matches the claimed browser (e.g., a Chrome JA3 with a Firefox User-Agent is flagged).

### Layer 2: HTTP/2 Fingerprint
Similar to Akamai, Cloudflare inspects:
- SETTINGS frame values and order
- WINDOW_UPDATE behavior
- Pseudo-header ordering
- Header ordering

### Layer 3: Header Consistency
Cloudflare cross-checks signals across layers:
- Does `sec-ch-ua` match the JA4 fingerprint?
- Does the User-Agent match the TLS fingerprint?
- Are `sec-ch-ua-mobile` and `sec-ch-ua-platform` consistent with the TLS client?
- Is the `Accept-Encoding` header consistent with the browser?

### Layer 4: Cookie Behavior
- Cloudflare's `__cf_bm` cookie has specific format requirements
- Cookie splitting behavior (how `Set-Cookie` headers are handled)
- Cookie jar patterns (which cookies are accepted/rejected)

### Layer 5: JavaScript Challenges (Turnstile)
For suspicious clients, Cloudflare serves JavaScript challenges that check:
- Canvas/WebGL fingerprinting
- AudioContext fingerprinting
- WebRTC leak detection
- Navigator properties (webdriver, plugins, languages)
- Font enumeration
- Screen properties

### Layer 6: Behavioral Biometrics
- Mouse movement patterns
- Keystroke timing
- Navigation patterns (referrer, timing between pages)

## Detection Risk for browsercore

**HIGH** for Layers 1-3 (wire-level signals browsercore should address).
**OUT OF SCOPE** for Layers 4-6 (browser automation / JavaScript territory).

## What browsercore Must Fix

1. **TLS fingerprint consistency** — JA4 must match the claimed browser
2. **HTTP/2 fingerprint** — SETTINGS, WINDOW_UPDATE, pseudo-headers must match
3. **Cross-layer consistency** — `sec-ch-ua` version must match TLS profile version
4. **Header order** — must match the claimed browser

## Cross-Layer Consistency Checks

| Signal | Must Match |
|--------|-----------|
| `sec-ch-ua: "Chrome";v="131"` | JA4 of Chrome 131 |
| `sec-ch-ua-mobile: "?1"` | Mobile TLS profile |
| `sec-ch-ua-platform: "Android"` | Android TLS profile |
| `User-Agent` | TLS + HTTP/2 fingerprint |
| `Accept-Encoding` | Browser-specific defaults |

## References

- [Cloudflare Bot Management](https://www.cloudflare.com/products/bot-management/)
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
- [JA4+ specification](https://github.com/FoxIO-LLC/ja4)
- [Cloudflare fingerprinting blog](https://blog.cloudflare.com/)
