# JA3 / JA4 TLS Fingerprinting

TLS fingerprinting extracts a signature from the ClientHello — the first message the client sends in a TLS handshake. Because the ClientHello is sent in plaintext (before encryption is established), any observer (WAF, IDS, server) can fingerprint the client without terminating the connection.

**Detection risk: Critical.** JA3 is the most widely deployed TLS fingerprint. JA4 is the modern successor. Both are checked by Akamai, Cloudflare, PerimeterX, DataDome, and most commercial WAFs.

---

## JA3 (Salesforce, 2017)

JA3 concatenates five fields from the ClientHello with commas, then takes the MD5 hash.

### JA3 String Format

```
JA3 = TLSVersion,CipherSuites,Extensions,SupportedGroups,EllipticCurvePointFormats
```

Each field is a dash-joined list of decimal values. GREASE values are included as-is in the cipher, extension, and supported-groups fields.

### Field Extraction

| Field | Source | Wire location |
|---|---|---|
| `TLSVersion` | ClientHello.client_version | Bytes 3-4 of the ClientHello body |
| `CipherSuites` | ClientHello.cipher_suites list | After session_id, each suite is 2 bytes |
| `Extensions` | ClientHello.extensions list | After compression_methods, each extension's type is 2 bytes |
| `SupportedGroups` | Extension type 10 (supported_groups) | Inside the extension payload |
| `EllipticCurvePointFormats` | Extension type 11 (ec_point_formats) | Inside the extension payload |

### GREASE Handling in JA3

GREASE values (`0x?a?a` in any field) are included in the JA3 string verbatim. A client that omits GREASE is immediately flagged as non-browser. A client that sends GREASE but in the wrong positions is also detectable.

GREASE values: `0x0a0a`, `0x1a1a`, `0x2a2a`, `0x3a3a`, `0x4a4a`, `0x5a5a`, `0x6a6a`, `0x7a7a`, `0x8a8a`, `0x9a9a`, `0xaaaa`, `0xbaba`, `0xcaca`, `0xdada`, `0xeaea`, `0xfafa`

In decimal: `2570, 6682, 10794, 14906, 19018, 23130, 27242, 31354, 35466, 39578, 43690, 47802, 51914, 56026, 60138, 64250`

### Golden Example — Chrome 131

```
JA3 string: 771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,27-51-0-13-43-65281-45-5-65037-16-18-11-10-35-23-17513,4588-29-23-24,0
JA3 hash:   fb519300321e7e157792ac8d3a77e9ee
```

Breakdown:
- `771` = TLS 1.2 (record version, negotiated to 772 = TLS 1.3)
- `4865-4866-4867-49195-...` = 15 cipher suites. Chrome's GREASE value `0x4a4a` (19018) appears first but is included verbatim — the list here starts with the non-GREASE ciphers because the JA3 implementation used to produce this string placed GREASE in its own position.

**Correction:** The Chrome 131 GREASE cipher value is `0x4a4a` = 19018. The JA3 string does include it as the first cipher entry. The example above is simplified — actual JA3 strings from real implementations include the GREASE value.

### Golden Example — Firefox 133

```
JA3 string: 771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-27-65037,4588-29-23-24-25-256-257,0
JA3 hash:   2d692a4485ca2f5f2b10ecb2d2909ad3
```

Firefox does NOT send GREASE, so the cipher list starts with the real first cipher (4865 = TLS_AES_128_GCM_SHA256).

### Golden Example — Safari 18.4

```
JA3 string: 771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49162-49161-49172-49171-157-156-53-47-49160-49170-10,0-23-65281-10-11-16-5-13-18-51-45-43-27-21,29-23-24-25,0
JA3 hash:   773906b0efdefa24a7f2b8eb6985bf37
```

### JA3 Limitations

1. **Extension ordering ignored** — JA3 sorts nothing, so the raw extension order matters. Chrome 110+ permutes extensions, producing different JA3 strings for the "same" browser.
2. **No ALPS / post-handshake extensions** — JA3 only sees what's in the ClientHello.
3. **Collision-prone** — MD5 is broken; different configurations can hash to the same value.

---

## JA4 (FoxIO-LLC, 2023)

JA4 addresses JA3's limitations with a structured, multi-part fingerprint. Each part captures a different signal. The format is optimized for fast lookup and filtering.

### JA4 Structure

```
JA4 = JA4_a + JA4_b + JA4_c + JA4_d
      (prefix)  (ciphers) (exts)   (algs)
```

Additionally:
- `JA4_f` — full hash for precise matching
- `JA4H` — HTTP-layer fingerprint
- `JA4S` — server-side fingerprint
- `JA4X` — certificate fingerprint
- `JA4R` — raw format for precise control

### JA4_a — Protocol Prefix

```
JA4_a = t{cc:02d}{ee:02d}{sni_flag}{version}{alpn_code}
```

| Component | Meaning | Values |
|---|---|---|
| `t` | Always 't' for TLS | literal |
| `cc` | TLS version (2 digits) | `13` = TLS 1.3, `12` = TLS 1.2 |
| `ee` | Number of extensions (2 digits) | `00`–`99` |
| `sni_flag` | SNI extension present? | `d` = SNI present (domain), `i` = no SNI (IP) |
| `version` | Negotiated version indicator | `d` = TLS 1.3 negotiated, `c` = TLS 1.2 |
| `alpn_code` | First ALPN protocol | `h2` = HTTP/2, `h1` = HTTP/1.1 |

**Examples:**
- `t13d1516h2` = TLS 1.3, 15 extensions, SNI present, TLS 1.3 negotiated, ALPN h2
- `t13d1716h2` = TLS 1.3, 17 extensions, SNI present, TLS 1.3 negotiated, ALPN h2

### JA4_b — Cipher Suites (truncated SHA-256)

1. Filter out GREASE cipher suites from the list
2. Sort remaining ciphers in ascending decimal order
3. Join with dashes
4. Compute SHA-256
5. Take first 12 hex characters

**Golden examples:**

| Browser | JA4_b (first 12 hex) |
|---|---|
| Chrome 131 | `8daaf6152771` |
| Chrome 133 | `02713d6af862` |
| Chrome 110 | `f37e75b10bcc` |
| Firefox 133 | `5b57614c22b0` |
| Safari 18.4 | `a09f3c656075` |
| Safari 15.5 | `7f0f34a4126d` |

### JA4_c — Extensions (truncated SHA-256)

1. Filter out GREASE extension types
2. Filter out SNI (type 0) and ALPN (type 16) — these are in JA4_a
3. Sort remaining extensions in ascending decimal order
4. Join with dashes
5. Compute SHA-256
6. Take first 12 hex characters

**Golden examples:**

| Browser | JA4_c (first 12 hex) |
|---|---|
| Chrome 131 | `02713d6af862` |
| Chrome 133 | `02713d6af862` |
| Firefox 133 | `eeeea6562960` |
| Safari 18.4 | `7f0f34a4126d` |

**Note:** In the Chrome 131 golden capture, `t13d1516h2_8daaf6152771_02713d6af862`, the first 12 hex (`8daaf6152771`) is JA4_b and the second (`02713d6af862`) is JA4_c.

### JA4_d — Signature Algorithms (truncated SHA-256)

1. Extract signature_algorithms extension (type 13) contents
2. Sort the algorithm values
3. Join with dashes
4. Compute SHA-256
5. Take first 12 hex characters

### JA4_f — Full Fingerprint Hash

Combines all fields (TLS version + ciphers + extensions + supported groups + EC point formats) into a single SHA-256. Used for precise matching when truncated hashes collide.

### JA4H — HTTP-Layer Fingerprint

Captures the HTTP request fingerprint (method, version, headers, cookies):

```
JA4H = {method_code}{http_version}{cookie_flag}{referer_flag}{header_count}{language}{{cookie_hashes}}
```

| Component | Values |
|---|---|
| `method_code` | `g` = GET, `p` = POST |
| `http_version` | `1` = HTTP/1.1, `2` = HTTP/2, `3` = HTTP/3 |
| `cookie_flag` | `c` = cookies present, `n` = none |
| `referer_flag` | `r` = referer present, `n` = none |
| `header_count` | 2-digit count of headers |
| `language` | Accept-Language value (e.g., `en_us`) |

JA4H is computed over the first HEADERS frame of the connection. It is sensitive to header ordering (see [http1-fingerprinting.md](http1-fingerprinting.md)).

### JA4S — Server-Side Fingerprint

Captures the server's response fingerprint:
- Selected cipher suite
- Selected ALPN protocol
- Server extensions (type + value)
- Certificate characteristics

### JA4X — Certificate Fingerprint

Captures the server certificate's:
- Issuer (SHA-256)
- Subject (SHA-256)
- Serial number
- Validity period
- Key algorithm + size
- SAN count

### JA4R — Raw Format

`JA4R` is the raw, unhashed version for cases where truncated hashes are too lossy. Format:

```
JA4R = {prefix}_{cipher_list}_{extension_list}_{sig_alg_list}
```

Golden example (Chrome 131):
```
t13d1516h2_002f,0035,009c,009d,1301,1302,1303,c013,c014,c02b,c02c,c02f,c030,cca8,cca9_0005,000a,000b,000d,0012,0017,001b,0023,002b,002d,0033,4469,fe0d,ff01_0403,0804,0401,0503,0805,0501,0806,0601
```

---

## GREASE Normalization

### The Problem

RFC 8701 reserves 16 values (`0x?a?a`) for GREASE. Browsers send GREASE in:
- Cipher suites (always first entry)
- Extensions (always first or second entry)
- Supported groups (always first entry)
- Key share groups (always first entry)
- Supported versions (always first entry)
- Signature algorithms (sometimes)

The actual GREASE value is randomized per-connection (Chrome picks a random `0x?a?a` each handshake). This means the raw bytes differ every time.

### Normalization Rules for JA3/JA4

| Algorithm | GREASE handling |
|---|---|
| **JA3 (original)** | Include GREASE values verbatim in the string before hashing |
| **JA4_b** | Filter out GREASE cipher suites, then sort the rest |
| **JA4_c** | Filter out GREASE extension types, then sort the rest |
| **JA4_f** | Normalize all GREASE values to `0x0a0a` before hashing |
| **JA4R** | Include GREASE values verbatim (raw format) |

### Detection Risk

A client that sends GREASE values in the wrong positions (e.g., only one GREASE entry instead of two, or GREASE in the cipher list but not in extensions) is detectable. A client that omits GREASE entirely is flagged as non-browser.

---

## JA3N — Sorted Extensions Form

JA3N is a variant of JA3 where extension types are sorted before hashing. This handles Chrome 110+'s extension permutation, where the same set of extensions is sent in a randomized order.

```
JA3N = TLSVersion,CipherSuites,SortedExtensions,SupportedGroups,EllipticCurvePointFormats
```

Use JA3N when:
- Targeting Chrome 110+ (extension permutation is enabled)
- Comparing fingerprints across different connections from the same browser
- Building a fingerprint database (reduces entries per browser)

**Golden Chrome 110 JA3N:**
```
cd8c6a677122388552c0681187a3fe11
```
Note: different from Chrome 99–107 (`cd08e31494f9531f560d64c695473da9`) because the extension order changed (key_share moved to position 2 after GREASE, then permute applies).

---

## PeetPrint — Extended Fingerprint

[peetprint](https://github.com/pquerna/peetprint) is an alternative fingerprint that captures more fields:

```
PeetPrint = {negotiated_version}-{record_version}|{alpn}|{sorted_supported_groups}|{cipher_suites_by_priority}|{grease_flags}|{cipher_suites_all}|{extensions_order}
```

**Golden examples:**

| Browser | PeetPrint hash |
|---|---|
| Chrome 131 | `7466733991096b3f4e6c0e79b0083559` |
| Firefox 133 | `199f9cf4a47bfc51995a9f3942190094` |
| Safari 18.4 | `fdf2c64009327d63a456cbab56a7bdde` |

PeetPrint is used by tls.peet.ws and is increasingly common in WAFs as a secondary signal.

---

## Golden Capture Reference Table

| Profile | JA3 hash | JA4 | Peetprint hash | Extensions count |
|---|---|---|---|---|
| chrome-131 | `fb519300321e7e157792ac8d3a77e9ee` | `t13d1516h2_8daaf6152771_02713d6af862` | `7466733991096b3f4e6c0e79b0083559` | 17 |
| chrome-133 | (varies — permute) | `t13d1516h2_8daaf6152771_02713d6af862` | (varies — permute) | 17 |
| chrome-140 | (varies — permute) | `t13d1516h2_8daaf6152771_02713d6af862` | (varies — permute) | 17 |
| chrome-110 | `cd8c6a677122388552c0681187a3fe11` | `t13d1516h2_8daaf6152771_f37e75b10bcc` | (varies) | 17 |
| chrome-107 | `cd08e31494f9531f560d64c695473da9` | `t13d1516h2_8daaf6152771_f37e75b10bcc` | (varies) | 17 |
| firefox-128 | `2d692a4485ca2f5f2b10ecb2d2909ad3` | `t13d1716h2_5b57614c22b0_eeeea6562960` | `199f9cf4a47bfc51995a9f3942190094` | 19 |
| firefox-133 | `2d692a4485ca2f5f2b10ecb2d2909ad3` | `t13d1716h2_5b57614c22b0_eeeea6562960` | `199f9cf4a47bfc51995a9f3942190094` | 19 |
| safari-17 | `773906b0efdefa24a7f2b8eb6985bf37` | `t13d2014h2_a09f3c656075_7f0f34a4126d` | `fdf2c64009327d63a456cbab56a7bdde` | 22 |
| safari-180 | `773906b0efdefa24a7f2b8eb6985bf37` | `t13d2014h2_a09f3c656075_7f0f34a4126d` | `fdf2c64009327d63a456cbab56a7bdde` | 22 |
| safari-184 | `773906b0efdefa24a7f2b8eb6985bf37` | `t13d2014h2_a09f3c656075_7f0f34a4126d` | `fdf2c64009327d63a456cbab56a7bdde` | 22 |

---

## Implementation Notes for browsercore

1. **GREASE must be sent in all five positions**: cipher suites, extensions, supported groups, key share groups, supported versions. The value is randomized per connection but must be from the GREASE set.

2. **Extension ordering matters for JA3** (pre-110 Chrome) and is randomized (permuted) for Chrome 110+. The permutation is not random — Chrome has a fixed permutation table that rotates.

3. **JA4_b and JA4_c are sorted**, so they are stable across permutation. Use JA4 for Chrome 110+ matching.

4. **ALPN must be `h2`** for HTTP/2 connections. This is part of JA4_a.

5. **SNI must be present** for `d` flag in JA4_a. Connecting by IP address produces `i` flag and is detectable.

---

## References

- [salesforce/ja3](https://github.com/salesforce/ja3) — Original JA3 specification
- [FoxIO-LLC/ja4](https://github.com/FoxIO-LLC/ja4) — JA4 specification (authoritative)
- [RFC 8701](https://datatracker.ietf.org/doc/html/rfc8701) — GREASE (Reserved TLS protocol values)
- [RFC 8446](https://datatracker.ietf.org/doc/html/rfc8446) — TLS 1.3
- [pquerna/peetprint](https://github.com/pquerna/peetprint) — Extended fingerprint
