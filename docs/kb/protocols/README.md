# Protocol Fingerprinting Reference

Technical reference for the wire-level fingerprint signals that bot-detection systems (Akamai, Cloudflare, DataDome, PerimeterX) use to distinguish real browsers from automated clients. Each file covers one protocol layer with RFC references, wire-format diagrams, and golden-capture ground truth.

## Files

| File | Covers | Key signals |
|---|---|---|
| [`ja3-ja4.md`](ja3-ja4.md) | TLS fingerprinting algorithms | JA3 (MD5 of ClientHello fields), JA4 (structured multi-part), JA4H/S/X/R, GREASE handling, Chrome 110+ permutation |
| [`tls-13-extensions.md`](tls-13-extensions.md) | TLS 1.3 extension types | Extension type table, GREASE sentinels, ALPS, cert compression, key share (PQ groups), ECH, ordering reference per browser |
| [`http2-fingerprinting.md`](http2-fingerprinting.md) | HTTP/2 Akamai fingerprint | SETTINGS ordering + values, WINDOW_UPDATE, PRIORITY, pseudo-header order, padding, HPACK table updates, golden hex dumps |
| [`http3-fingerprinting.md`](http3-fingerprinting.md) | QUIC + HTTP/3 fingerprint | Transport parameter ordering, GREASE frames, HTTP/3 SETTINGS, packet number length, spin bit, 0-RTT |
| [`http1-fingerprinting.md`](http1-fingerprinting.md) | HTTP/1.1 header ordering | Per-browser header order, Connection, Accept-Encoding, TE, case sensitivity, multi-value ordering |

## How These Signals Combine

Bot detection systems rarely rely on a single signal. A typical WAF inspection stack:

```
TLS handshake
  → JA3 / JA4 fingerprint     (tls-13-extensions.md, ja3-ja4.md)
  → Extension ordering         (tls-13-extensions.md)
  → ALPN result                (tls-13-extensions.md)

HTTP/2 preface
  → SETTINGS frame             (http2-fingerprinting.md)
  → WINDOW_UPDATE              (http2-fingerprinting.md)
  → HEADERS frame
      → Pseudo-header order    (http2-fingerprinting.md)
      → Header order           (http1-fingerprinting.md)
      → Header values          (http1-fingerprinting.md)
      → Padding                (http2-fingerprinting.md)

HTTP/3 (if negotiated)
  → QUIC transport params     (http3-fingerprinting.md)
  → HTTP/3 SETTINGS           (http3-fingerprinting.md)
  → Packet number length       (http3-fingerprinting.md)
```

**A client that gets the TLS cipher list right but sends the wrong SETTINGS order is detectable.** Every layer must match the target browser.

## Golden Capture Ground Truth

All fingerprint values in these files are validated against byte-level golden captures in `testing/captures/` — real ClientHello and SETTINGS bytes extracted from `curl-impersonate` connections. See [`../golden-captures/`](../golden-captures/) for the capture methodology and reference data.

## Detection Risk Levels

| Risk | Meaning |
|---|---|
| **Critical** | Detected by all major WAFs (Akamai, Cloudflare, PerimeterX). A mismatch = immediate block. |
| **High** | Detected by 2+ WAFs or used in JA3/JA4 computation. |
| **Medium** | Used in secondary scoring. Mismatch raises suspicion but alone may not block. |
| **Low** | Informational signal. Rarely checked in isolation. |

---

*Last updated: 2026-08-06 — validated against golden captures: chrome-131, chrome-140, firefox-128, firefox-133, safari-17, safari-180, safari-184*
