# Reference Captures

What golden captures we have, what's missing, and the actual wire bytes for reference.

## Existing Captures

### Chrome 131 (REAL)
**Source:** curl_cffi 0.13.0 capture
**Files:** `testing/captures/chrome-131/tls/client_hello.bin` (1753 bytes), `testing/captures/chrome-131/http2/settings.bin` (33 bytes)

**TLS ClientHello JA3:** `fb519300321e7e157792ac8d3a77e9ee`
**Key features:** GREASE, post-quantum key share (X25519MLKEM768), 16 cipher suites, 17-18 extensions

**HTTP/2 SETTINGS (33 bytes, 4 settings):**
```
00 02 00 00 00 00 → ENABLE_PUSH = 0
00 04 00 40 00 00 → INITIAL_WINDOW_SIZE = 4194304
00 03 00 00 00 64 → MAX_CONCURRENT_STREAMS = 100
```
Order: `2, 4, 3`

### Firefox 133 (REAL)
**Source:** curl_cffi 0.13.0 capture
**Files:** `testing/captures/firefox-133/tls/client_hello.bin` (1797 bytes), `testing/captures/firefox-133/http2/settings.bin` (33 bytes)

**TLS ClientHello JA3:** `2d692a4485ca2f5f2b10ecb2d2909ad3`
**Key features:** No GREASE, 17 cipher suites, 16 extensions, delegated_credentials (34), record_size_limit (28)

**HTTP/2 SETTINGS (33 bytes, 2 settings):**
```
00 03 00 00 00 64 → MAX_CONCURRENT_STREAMS = 100
00 04 00 01 00 00 → INITIAL_WINDOW_SIZE = 65536
```
Order: `3, 4`

### Safari 17 (REAL)
**Source:** curl_cffi 0.13.0 capture
**Files:** `testing/captures/safari-17/tls/client_hello.bin` (517 bytes), `testing/captures/safari-17/http2/settings.bin` (27 bytes)

**TLS ClientHello JA3:** `773906b0efdefa24a7f2b8eb6985bf37`
**Key features:** GREASE, 20 cipher suites, 14 extensions, no ALPS, no cert compression, no session_ticket

**HTTP/2 SETTINGS (27 bytes, 3 settings):**
```
00 02 00 00 00 00 → ENABLE_PUSH = 0
00 04 00 02 00 00 → INITIAL_WINDOW_SIZE = 131072
00 03 00 00 00 64 → MAX_CONCURRENT_STREAMS = 100
```
Order: `2, 4, 3`

### Chrome 140 (SYNTHETIC STUB)
**Source:** Test fixture (not real wire data)
**Files:** `testing/captures/chrome-140/tls/client_hello.bin` (96 bytes)
**JA3:** `853b03398669dbeffb6116ecd6e6beb6` (identical to firefox-128 stub — proof it's synthetic)
**Note:** No GREASE, only 2 cipher suites, 4 extensions. Not usable for real comparison.

### Firefox 128 (SYNTHETIC STUB)
**Source:** Test fixture (not real wire data)
**Files:** `testing/captures/firefox-128/tls/client_hello.bin` (96 bytes)
**JA3:** `853b03398669dbeffb6116ecd6e6beb6` (identical to chrome-140 stub — proof it's synthetic)

## What's Missing

### High Priority (Needed for Core Profiles)
| Profile | TLS | HTTP/2 | HTTP/1.1 |
|---------|-----|--------|----------|
| chrome-140 | Need real capture | Need real capture | Need header order capture |
| firefox-128 | Need real capture | Need real capture | Need header order capture |
| firefox-135 | Need real capture | Need real capture | Need header order capture |
| safari-18 | Need real capture | Need real capture | Need header order capture |
| edge-120 | Need real capture | Need real capture | Need header order capture |
| edge-128 | Need real capture | Need real capture | Need header order capture |

### Medium Priority (New Profiles)
| Profile | TLS | HTTP/2 |
|---------|-----|--------|
| chrome-133 | Need real capture | Need real capture |
| chrome-136 | Need real capture | Need real capture |
| chrome-142 | Need real capture | Need real capture |
| chrome-145 | Need real capture | Need real capture |
| chrome-146 | Need real capture | Need real capture |
| firefox-135 | Need real capture | Need real capture |
| firefox-144 | Need real capture | Need real capture |
| firefox-147 | Need real capture | Need real capture |
| safari-18.4 | Need real capture | Need real capture |
| safari-26.0 | Need real capture | Need real capture |

### Low Priority (Mobile, Tor)
| Profile | TLS | HTTP/2 |
|---------|-----|--------|
| chrome-131-android | Need real capture | Need real capture |
| safari-17.2-ios | Need real capture | Need real capture |
| safari-18.0-ios | Need real capture | Need real capture |
| tor-145 | Need real capture | Need real capture |

## Probe Output Archive

`testing/captures/_probe/output/` contains historical oracle JSON for 24 profiles:
- chrome99-chrome136, edge99/101, safari155/170/180/184/180_ios/260, firefox133/135
- Each has `oracle_capture.reference.json` with full tls.peet.ws response

These are oracle responses (parsed data), not raw wire bytes. They're useful for field-level comparison but not for byte-level golden testing.

## How to Add a New Capture

1. Capture using curl-impersonate or curl_cffi (see [capture-methodology.md](capture-methodology.md))
2. Verify JA3/JA4 against tls.peet.ws oracle
3. Store in `testing/captures/{profile}/{protocol}/{record}.bin`
4. Create `.meta.json` sidecar with capture metadata
5. Register in `testing/src/captures/manifest.ts`
6. Add to this reference file with JA3/JA4 and key features
