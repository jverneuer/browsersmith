# DataDome

**Product:** DataDome
**Fingerprint Approach:** TLS + HTTP/2 + JavaScript challenges + header analysis + cookie behavior

## Overview

DataDome uses a multi-layered approach combining wire-level protocol fingerprints with browser-side JavaScript challenges. Their system is known for being particularly aggressive in cross-checking signals across layers.

## Detection Layers

### Layer 1: TLS Fingerprint
- JA3/JA4 computation from ClientHello
- Cipher suite analysis
- Extension order analysis
- GREASE detection (absence of GREASE in a "Chrome" ClientHello is flagged)

### Layer 2: HTTP/2 Fingerprint
- SETTINGS frame values and order
- WINDOW_UPDATE behavior
- Pseudo-header ordering
- Header ordering

### Layer 3: Header Consistency
- Cross-layer checks: does `sec-ch-ua` match the TLS fingerprint?
- Header presence checks: is `sec-fetch-*` present for Chrome?
- Header value consistency: does `accept-encoding` match the browser?

### Layer 4: Cookie Behavior
- `__dd_b` cookie format validation
- Cookie acceptance patterns
- Split cookie handling

### Layer 5: JavaScript Challenges
- Canvas fingerprinting
- WebGL vendor/renderer
- AudioContext
- Navigator properties (webdriver, plugins, languages, platform)
- Font enumeration
- Screen properties (colorDepth, pixelRatio)

## Detection Risk for browsercore

**HIGH** — DataDome is known for aggressive cross-layer consistency checks. A Chrome JA3 with Firefox HTTP/2 SETTINGS would be immediately flagged.

## What browsercore Must Fix

1. All TLS fingerprint signals (JA4)
2. All HTTP/2 fingerprint signals (SETTINGS, pseudo-headers)
3. Cross-layer header consistency (sec-ch-ua ↔ TLS profile ↔ HTTP/2 settings)
4. HTTP/1.1 header ordering

## References

- [DataDome](https://datadome.co/)
- [DataDome bot detection](https://datadome.co/bot-protection/)
