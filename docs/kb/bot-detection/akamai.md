# Akamai Bot Manager

**Product:** Akamai Bot Manager
**Fingerprint Name:** Akamai fingerprint (sometimes called "Akamai HTTP/2 fingerprint")

## Overview

Akamai's bot detection inspects the **HTTP/2 SETTINGS frame, WINDOW_UPDATE, PRIORITY frames, and pseudo-header ordering** to produce a fingerprint string. This is one of the most widely deployed HTTP/2 fingerprints — many other systems (including Cloudflare) use similar techniques.

## Fingerprint Components

### 1. SETTINGS Frame
The HTTP/2 SETTINGS frame is sent by the client immediately after the connection preface. Akamai inspects:
- **Which SETTINGS IDs are sent** (not all 6 are sent by every browser)
- **The order they're sent in** (each browser has a characteristic order)
- **The values** (e.g., Chrome's INITIAL_WINDOW_SIZE = 6291456 vs Firefox's 131072)

Format: Each setting is 6 bytes — 2-byte ID + 4-byte value.

**Reference values:**

| Browser | SETTINGS Order | Values |
|---------|---------------|--------|
| Chrome | 2, 4, 3 | ENABLE_PUSH=0, INITIAL_WINDOW_SIZE=6291456, MAX_CONCURRENT_STREAMS=1000 |
| Firefox | 3, 4 | MAX_CONCURRENT_STREAMS=100, INITIAL_WINDOW_SIZE=131072 |
| Safari | 1, 2, 4, 5 | HEADER_TABLE_SIZE=65536, ENABLE_PUSH=0, INITIAL_WINDOW_SIZE=4194304, MAX_FRAME_SIZE=16384 |

### 2. WINDOW_UPDATE
Chrome sends a connection-level WINDOW_UPDATE immediately after SETTINGS ACK, raising the window from 65535 to 15728640 (increment = 15663105). Firefox and Safari use different values.

### 3. PRIORITY Frames
The initial HEADERS frame's priority fields (exclusive flag, stream dependency, weight) differ by browser:
- Chrome: exclusive=1, weight=255
- Firefox: exclusive=0, weight=42
- Safari: exclusive=0, weight=255 (v17) or 256

### 4. Pseudo-Header Order
The order of HTTP/2 pseudo-headers in the HEADERS frame:
- Chrome: `:method, :authority, :scheme, :path` (MASP)
- Firefox: `:method, :path, :authority, :scheme` (MPSA)
- Safari: `:method, :scheme, :path, :authority` (MSPA)

### 5. Header Order
The order of regular HTTP headers in the HEADERS frame, HPACK-encoded.

## Fingerprint String Format

```
settings|window_update|streams|header_order
```

Example: `1:65536;2:0;4:6291456|15663105|1000:1:0:...|user-agent,accept,...`

## Detection Risk for browsercore

**HIGH** — browsercore currently sends:
- All 6 SETTINGS in fixed order (should be browser-specific subset + order)
- No initial WINDOW_UPDATE (Chrome should send 15663105)
- Fixed pseudo-header order MSAP (should be MASP for Chrome)
- No priority fields on HEADERS frames

## What browsercore Must Fix

1. Per-browser SETTINGS ordering + subset selection
2. Initial WINDOW_UPDATE for Chrome profiles
3. Per-browser pseudo-header ordering
4. Stream priority in HEADERS frames
5. HEADERS frame padding (Chrome adds small padding)

## References

- [Akamai Bot Manager](https://www.akamai.com/products/bot-manager)
- [curl-impersonate Akamai support](https://github.com/lwthiker/curl-impersonate) — `CURLOPT_HTTP2_SETTINGS`, `CURLOPT_HTTP2_WINDOW_UPDATE`
- [curl_cffi Akamai support](https://github.com/lexiforest/curl_cffi) — `akamai=` parameter
- [impers Akamai support](https://github.com/lexiforest/impers) — `http2Settings`, `http2WindowUpdate` fingerprint fields
- Golden captures: `testing/captures/*/http2/settings.bin`
