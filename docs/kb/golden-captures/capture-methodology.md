# Capture Methodology

How to create golden captures that prove wire-level fingerprint accuracy.

## Trusted Capture Sources

### 1. curl-impersonate (Recommended)
curl-impersonate produces byte-identical output to real browsers because it uses BoringSSL (Chrome's TLS library) with patched extension ordering.

```bash
# Capture Chrome 140 ClientHello
curl_chrome140 https://tls.peet.ws/api/all --dump-traffic /tmp/chrome140.dump
# Parse the hex dump to extract TLS records
```

**Verification:** Check the JA3/JA4 on tls.peet.ws — it should match the target browser.

### 2. curl_cffi
Python wrapper for curl-impersonate. Can capture programmatically:

```python
from curl_cffi import requests
# Enable traffic dump via environment variable
import os
os.environ["CURL_IMPERSONATE_DUMP"] = "1"
response = requests.get("https://tls.peet.ws/api/all", impersonate="chrome140")
```

### 3. Wireshark + Real Browser
For browsers not covered by curl-impersonate:
1. Start Wireshark capture on the client machine
2. Connect to a TLS server with the target browser
3. Filter: `tls.handshake.type == 1` (ClientHello)
4. Export the TLS record bytes

**Limitation:** Real browser captures include ephemeral keys that change per-connection. Must normalize before comparison.

### 4. @browsercore/testing Probe Scripts
The existing probe scripts in `testing/captures/_probe/` use curl_cffi to capture:

```bash
python testing/captures/_probe/probe.py --target chrome131 --output captures/_probe/output/
```

## Capture Process

### Step 1: Connect and Capture
```
Client (curl-impersonate) → Server (tls.peet.ws or nghttpd)
                                ↓
                          Capture raw bytes (tcpdump or --dump-traffic)
```

### Step 2: Extract TLS Records
TLS records have a 5-byte header:
```
Content Type (1 byte) | Version (2 bytes) | Length (2 bytes)
0x16 (handshake)      | 0x0303 (TLS 1.3)  | variable
```

The ClientHello is inside a handshake record (content type 0x16, handshake type 0x01).

### Step 3: Normalize Random Fields
Before storing as a golden, mask fields that change per-connection:
- `client_random` (first 32 bytes of the ClientHello)
- Ephemeral key share values
- GREASE codepoints (normalize to 0x0a0a)
- Nonces

### Step 4: Verify Against Oracle
Submit the capture to an oracle service:
- tls.peet.ws — returns JA3, JA4, and parsed ClientHello fields
- ja3.zone — JA3 database

Compare the oracle's parsed fields against the expected browser profile.

### Step 5: Store Binary + Metadata
```
testing/captures/{profile}/{protocol}/{record}.bin    — raw bytes
testing/captures/{profile}/{protocol}/{record}.meta.json — metadata
```

### Step 6: Register in Manifest
Add to `testing/src/captures/manifest.ts`:
```typescript
{ id: "chrome-131/tls/client_hello", profile: "chrome-131", protocol: "tls", record: "client_hello" }
```

## Comparison Methods

### Strict Byte Comparison
```typescript
compareAgainstGolden(actual, "chrome-140/tls/client_hello")
// Throws GoldenMismatchError on any divergence
```

### Masked Comparison (Recommended)
```typescript
compareAgainstGoldenWithIgnore(actual, "chrome-140/tls/client_hello")
// Masks: client_random, ephemeral keys, GREASE, nonces
// Compares everything else byte-for-byte
```

### Field-Level Comparison
Parse the ClientHello and compare individual fields:
- Cipher suites (order-sensitive)
- Extension types (order-sensitive)
- Supported groups
- Signature algorithms
- TLS version

## Common Pitfalls

1. **GREASE randomization** — Chrome randomizes GREASE codepoints per-connection. Must normalize before comparison.
2. **client_random** — always changes. Must be masked.
3. **Session ID** — empty for full handshake, non-empty for resumption.
4. **Supported versions** — Chrome GREASEs this extension with a random 0x?a?a version.
5. **Timestamp in RSA keys** — if the capture includes server certificate, the timestamp changes.

## Verification Checklist

- [ ] JA3 hash matches expected browser
- [ ] JA4 hash matches expected browser
- [ ] Cipher suite count matches
- [ ] Extension count matches
- [ ] Extension order matches (after GREASE normalization)
- [ ] Supported groups match
- [ ] Signature algorithms match
- [ ] TLS version matches
- [ ] ALPN protocols match

## References

- [curl-impersonate](https://github.com/lwthiker/curl-impersonate) — trusted capture source
- [curl_cffi](https://github.com/lexiforest/curl_cffi) — Python capture tool
- [tls.peet.ws](https://tls.peet.ws) — TLS fingerprint oracle
- [JA3 specification](https://github.com/salesforce/ja3) — fingerprint format
- [JA4 specification](https://github.com/FoxIO-LLC/ja4) — next-gen fingerprint format
- [browsercore testing package](../../../testing/) — existing captures and comparison tools
