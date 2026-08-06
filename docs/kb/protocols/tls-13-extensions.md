# TLS 1.3 Extensions — Fingerprint Reference

TLS extensions are the primary signal in JA3/JA4 fingerprints. Each extension has a 2-byte type code, and the order in which they appear (for pre-permutation Chrome) or the set (for post-permutation) distinguishes browsers.

**Detection risk: Critical.** Extension ordering, presence/absence, and contents are the dominant signals in TLS fingerprinting.

---

## Extension Type Reference Table

| Type | Name | RFC | Fingerprint relevance |
|---|---|---|---|
| 0 | server_name (SNI) | RFC 6066 §3 | Required for `d` flag in JA4. Must be present. |
| 1 | max_fragment_length | RFC 6066 §4 | Rarely sent by browsers. |
| 2 | client_certificate_url | RFC 6066 §8 | Not sent by browsers. |
| 3 | trusted_ca_keys | RFC 6066 §10 | Not sent by browsers. |
| 4 | truncated_hmac | RFC 6066 §7 | Not sent by browsers. |
| 5 | status_request (OCSP) | RFC 6066 §8 | **Chrome, Firefox, Safari** send this. |
| 6 | user_mapping | RFC 4681 | Not sent by browsers. |
| 7 | client_authz | — | Not sent by browsers. |
| 8 | server_authz | — | Not sent by browsers. |
| 9 | cert_type | — | Not sent by browsers. |
| 10 | supported_groups (curves) | RFC 8446 §4.2.7 | **Critical.** Order and contents distinguish browsers. |
| 11 | ec_point_formats | RFC 8422 §5.1 | **All browsers** send this with value `[0x00]` (uncompressed). |
| 12 | SRP | RFC 5054 | Not sent by browsers. |
| 13 | signature_algorithms | RFC 8446 §4.2.3 | **Critical.** Order and contents distinguish browsers. |
| 14 | use_srtp | — | Not sent by browsers. |
| 15 | heartbeat | RFC 6520 | Not sent by browsers. |
| 16 | application_layer_protocol_negotiation (ALPN) | RFC 7301 §3.1 | **Critical.** Must contain `h2` and/or `http/1.1`. |
| 17 | status_request_v2 | — | Not sent by browsers. |
| 18 | signed_certificate_timestamp (SCT) | RFC 6962 §3.3 | **Chrome, Safari** send this. Firefox disables. |
| 19 | client_certificate_type | — | Not sent by browsers. |
| 20 | server_certificate_type | — | Not sent by browsers. |
| 21 | padding | RFC 7685 | **Chrome, Safari** send this (with payload). Firefox does not. |
| 22 | encrypt_then_mac | — | Not sent by browsers. |
| 23 | extended_master_secret | RFC 7627 | **All browsers** send this. |
| 24 | token_binding | — | Not sent by browsers. |
| 25 | cached_info | — | Not sent by browsers. |
| 26 | tls_lts | — | Not sent by browsers. |
| 27 | compress_certificate | RFC 8879 | **Chrome** (brotli), **Safari** (zlib), **Firefox** (zlib + brotli + zstd). |
| 28 | record_size_limit | RFC 8449 | **Firefox** sends this (`0x4001` = 16385). Chrome and Safari do not. |
| 29 | pwd_protect | — | Not sent by browsers. |
| 30 | pwd_clear | — | Not sent by browsers. |
| 31 | password_salt | — | Not sent by browsers. |
| 32 | ticket_request | — | Not sent by browsers. |
| 33 | ticket | — | Not sent by browsers. |
| 34 | delegated_credentials | draft-ietf-tls-subcerts | **Firefox** sends this. Chrome and Safari do not. |
| 35 | session_ticket | RFC 5077 | **Chrome, Firefox** send this (empty). Safari does not. |
| 36-41 | (various) | — | Not sent by browsers. |
| 42 | pre_shared_key | RFC 8446 §4.2.11 | Only in resumption handshakes. |
| 43 | supported_versions | RFC 8446 §4.2.1 | **Critical.** Contains TLS 1.3 + TLS 1.2. |
| 44 | cookie | — | Not sent by browsers. |
| 45 | psk_key_exchange_modes | RFC 8446 §4.2.9 | **All browsers** send this with value `[0x01]` (psk_dhe_ke). |
| 46 | (reserved) | — | Not sent by browsers. |
| 47 | certificate_authorities | — | Not sent by browsers. |
| 48 | oid_filters | — | Not sent by browsers. |
| 49 | post_handshake_auth | — | Not sent by browsers. |
| 50 | signature_algorithms_cert | — | **Chrome** sometimes sends this. Firefox and Safari do not. |
| 51 | key_share | RFC 8446 §4.2.8 | **Critical.** Contains the key exchange public keys. |
| 52 | transparency_info | — | Not sent by browsers. |
| 53-55 | (various) | — | Not sent by browsers. |
| 56-65279 | (unassigned) | — | Not sent by browsers. |
| 65037 | encrypted_client_hello (ECH) | draft-ietf-tls-esni | **Chrome** sends this (in outer ClientHello). |
| 65281 | renegotiation_info | RFC 5746 | **All browsers** send this with value `00`. |
| 17513 | application_settings (ALPS old) | draft-vvv-tls-alps | **Chrome** sends this with `h2`. |
| 17613 | application_settings (ALPS new) | — | (Newer Chrome versions.) |
| 0x?a?a | GREASE | RFC 8701 | **Chrome, Safari** send GREASE extension types. |

---

## GREASE Extension Types

GREASE (Generate Random Extensions And Sustain Extensibility) reserves extension type values matching `0x?a?a` to prevent middleboxes from rejecting unknown extensions. Chrome and Safari send one or two GREASE extension types in their ClientHello.

### GREASE Values (16 total)

```
0x0a0a (2570)  0x1a1a (6682)  0x2a2a (10794)  0x3a3a (14906)
0x4a4a (19018) 0x5a5a (23130) 0x6a6a (27242)  0x7a7a (31354)
0x8a8a (35466) 0x9a9a (39578) 0xaaaa (43690)  0xbaba (47802)
0xcaca (51914) 0xdada (56026) 0xeaea (60138)  0xfafa (64250)
```

### Per-Browser GREASE Usage

| Browser | GREASE extensions | Position |
|---|---|---|
| Chrome 131 | 2 (e.g., `0x4a4a`, `0x2a2a`) | First and last |
| Chrome 133 | 2 | First and last |
| Firefox | **0** | — |
| Safari 18.4 | 1 (e.g., `0x9a9a`) | First |

**Golden example — Chrome 131 extensions:**
```
[0]: GREASE (0x5a5a)  ← GREASE
[1]: compress_certificate (27)
[2]: key_share (51)
[3]: server_name (0)
[4]: signature_algorithms (13)
[5]: supported_versions (43)
[6]: extensionRenegotiationInfo (65281)
[7]: psk_key_exchange_modes (45)
[8]: status_request (5)
[9]: extensionEncryptedClientHello (65037)
[10]: application_layer_protocol_negotiation (16)
[11]: signed_certificate_timestamp (18)
[12]: ec_point_formats (11)
[13]: supported_groups (10)
[14]: session_ticket (35)
[15]: extended_master_secret (23)
[16]: application_settings_old (17513)
[17]: GREASE (0x2a2a)  ← GREASE
```

Note: Chrome 131 uses a post-110 permutation, so the order shown is one of many possible orderings. The set of 17 extensions (minus the 2 GREASE) is stable.

---

## Key Share Extension (Type 51)

The key_share extension contains the client's public keys for key exchange. The group order and whether GREASE is included are fingerprint signals.

### Standard Named Groups

| Group | Wire value | Decimal | Used by |
|---|---|---|---|
| X25519 | 0x001d | 29 | Chrome, Firefox, Safari |
| P-256 (secp256r1) | 0x0017 | 23 | Chrome, Firefox, Safari |
| P-384 (secp384r1) | 0x0018 | 24 | Chrome, Firefox, Safari |
| P-521 (secp521r1) | 0x0019 | 25 | Firefox, Safari |

### Post-Quantum Groups

| Group | Wire value | Decimal | Used by |
|---|---|---|---|
| X25519Kyber768 | 0x6399 | 25497 | Chrome (experimental) |
| X25519MLKEM768 | 0x11ec | 4588 | Chrome 131+, Firefox 133+ |

### Golden Key Share Ordering

| Browser | Key share groups (in order) |
|---|---|
| Chrome 131 | `GREASE, X25519MLKEM768, X25519` |
| Chrome 133 | `GREASE, X25519MLKEM768, X25519` |
| Firefox 133 | `X25519MLKEM768, X25519, P-256` |
| Safari 17 | `GREASE, X25519` |

Firefox does NOT send GREASE in key_share. It sends three key shares (MLKEM, X25519, P-256). Chrome sends two plus GREASE.

---

## Supported Groups Extension (Type 10)

Lists the elliptic curves the client supports, in preference order.

### Golden Supported Groups

| Browser | Groups (in order) |
|---|---|
| Chrome 131 | `GREASE, X25519MLKEM768, X25519, P-256, P-384` |
| Chrome 133 | `GREASE, X25519MLKEM768, X25519, P-256, P-384` |
| Firefox 133 | `X25519MLKEM768, X25519, P-256, P-384, P-521, ffdhe2048, ffdhe3072` |
| Safari 17 | `GREASE, X25519, P-256, P-384, P-521` |

Firefox is unique in sending FFDHE groups (`ffdhe2048` = 256, `ffdhe3072` = 257). This is a strong fingerprint signal.

---

## Signature Algorithms Extension (Type 13)

Lists the signature algorithms the client supports.

### Golden Signature Algorithms

| Browser | Algorithms (in order) |
|---|---|
| Chrome 131 | `ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256, rsa_pkcs1_sha256, ecdsa_secp384r1_sha384, rsa_pss_rsae_sha384, rsa_pkcs1_sha384, rsa_pss_rsae_sha512, rsa_pkcs1_sha512` |
| Firefox 133 | `ecdsa_secp256r1_sha256, ecdsa_secp384r1_sha384, ecdsa_secp521r1_sha512, rsa_pss_rsae_sha256, rsa_pss_rsae_sha384, rsa_pss_rsae_sha512, rsa_pkcs1_sha256, rsa_pkcs1_sha384, rsa_pkcs1_sha512, ecdsa_sha1, rsa_pkcs1_sha1` |
| Safari 18.4 | `ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256, rsa_pkcs1_sha256, ecdsa_secp384r1_sha384, rsa_pss_rsae_sha384, rsa_pss_rsae_sha384 (DUPLICATE), rsa_pkcs1_sha384, rsa_pss_rsae_sha512, rsa_pkcs1_sha512, rsa_pkcs1_sha1` |

**Safari anomaly:** Safari 15+ intentionally sends `rsa_pss_rsae_sha384` **twice**. This is a deliberate fingerprint signal. Removing the duplicate makes the fingerprint not match Safari.

---

## Compress Certificate Extension (Type 27)

RFC 8879 — Certificate compression algorithms.

| Browser | Algorithms |
|---|---|
| Chrome | `[brotli (2)]` |
| Firefox | `[zlib (1), brotli (2), zstd (3)]` |
| Safari | `[zlib (1)]` |

---

## ALPS Extension (Type 17513 / 17613)

Application-Layer Protocol Settings — lets the client tell the server which protocols it supports at the application layer.

- Chrome sends ALPS with value `h2`.
- Firefox and Safari do not send ALPS.

This is a strong Chrome-specific signal.

---

## Delegated Credentials Extension (Type 34)

draft-ietf-tls-subcerts — Allows a server to delegate certificate authentication.

- Firefox sends this (with a list of signature algorithms).
- Chrome and Safari do not.

---

## Record Size Limit Extension (Type 28)

RFC 8449 — Limits the size of TLS records.

- Firefox sends this with value `0x4001` (16385 bytes).
- Chrome and Safari do not.

---

## Padding Extension (Type 21)

RFC 7685 — Pads the ClientHello to a minimum size to avoid size-based fingerprinting.

- Chrome sends this with a variable-length payload (zeros).
- Safari sends this with a large payload (394 bytes in golden capture).
- Firefox does not send this.

---

## Extended Master Secret (Type 23)

RFC 7627 — All browsers send this with empty data. Required for TLS 1.3.

---

## Session Ticket Extension (Type 35)

RFC 5077 — Allows session resumption.

- Chrome sends this with empty data (supports tickets).
- Firefox sends this with empty data.
- Safari does **not** send this extension.

The absence of session_ticket in Safari is a fingerprint signal.

---

## Renegotiation Info Extension (Type 65281)

RFC 5746 — All browsers send this with a single byte `00`.

---

## Extension Ordering — Per-Browser Reference

### Chrome 99–107 (Pre-Permutation)

Before Chrome 110, the extension order was deterministic:

```
GREASE, server_name, extended_master_secret, renegotiation_info (65281),
supported_groups, ec_point_formats, session_ticket, ALPN, status_request,
signature_algorithms, signed_certificate_timestamp, key_share,
psk_key_exchange_modes, supported_versions, compress_certificate,
application_settings (17513), GREASE, padding
```

### Chrome 110+ (Permutation)

Chrome 110 introduced `SSL_CTX_set_permute_extensions` which randomizes extension order using a fixed rotation. The set is the same, but the position changes. This is why JA3N (sorted extensions) or JA4 (which sorts b/c parts) must be used for matching.

Golden Chrome 110 extension order:
```
GREASE, key_share, signature_algorithms, ec_point_formats, supported_versions,
server_name, supported_groups, extended_master_secret, renegotiation_info,
compress_certificate, status_request, session_ticket, ALPN,
signed_certificate_timestamp, application_settings (17513), psk_key_exchange_modes,
GREASE, padding
```

Golden Chrome 131 extension order:
```
GREASE, compress_certificate, key_share, server_name, signature_algorithms,
supported_versions, renegotiation_info, psk_key_exchange_modes, status_request,
ECH (65037), ALPN, signed_certificate_timestamp, ec_point_formats,
supported_groups, session_ticket, extended_master_secret, application_settings,
GREASE
```

### Firefox 133 (No GREASE, Fixed Order)

```
server_name, extended_master_secret, renegotiation_info (65281),
supported_groups, ec_point_formats, session_ticket, ALPN, status_request,
delegated_credentials (34), key_share, supported_versions,
signature_algorithms, psk_key_exchange_modes, record_size_limit (28),
compress_certificate (27), ECH (65037)
```

### Safari 18.4 (GREASE, No Session Ticket, Padding)

```
GREASE, server_name, extended_master_secret, renegotiation_info (65281),
supported_groups, ec_point_formats, ALPN, status_request, signature_algorithms,
signed_certificate_timestamp, key_share, psk_key_exchange_modes,
supported_versions, compress_certificate (27), GREASE, padding
```

---

## Wire-Format Diagram: ClientHello Structure

```
ClientHandshake (type 0x01):
┌─────────────────────────────────────────────────────┐
│ Handshake Type    │ 0x01 (1 byte)                    │
│ Length            │ 3 bytes                          │
├─────────────────────────────────────────────────────┤
│ Client Version    │ 0x0303 (TLS 1.2 record version) │
│ Random            │ 32 bytes                         │
│ Session ID Len    │ 1 byte                           │
│ Session ID        │ variable                         │
│ Cipher Suites Len │ 2 bytes                          │
│ Cipher Suites     │ variable (GREASE + 15 suites)    │
│ Comp Methods Len  │ 1 byte                           │
│ Comp Methods      │ 0x01 (null)                      │
│ Extensions Len    │ 2 bytes                          │
│ Extensions        │ variable                         │
│   ┌───────────────────────────────────────────────┐ │
│   │ Ext Type     │ 2 bytes (e.g., 0x0000 = SNI)   │ │
│   │ Ext Len      │ 2 bytes                        │ │
│   │ Ext Data     │ variable                       │ │
│   └───────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────┐ │
│   │ Ext Type     │ 2 bytes (e.g., 0x000a = groups)│ │
│   │ Ext Len      │ 2 bytes                        │ │
│   │ Ext Data     │ variable                       │ │
│   └───────────────────────────────────────────────┘ │
│   ...                                               │
└─────────────────────────────────────────────────────┘
```

### Chrome 131 ClientHello Hex Breakdown (Partial)

```
16 03 01 06 d4    ← TLS record: type=handshake(0x16), ver=3.1, len=0x06d4
01 00 06 d4       ← Handshake: type=ClientHello(0x01), len=0x06d4
03 03             ← Client version: TLS 1.2 (record)
fe a6 96 0b ...  ← Random (32 bytes) [byteOffset 12, length 32]
20               ← Session ID length: 32
53 40 e7 c1 ...  ← Session ID (32 bytes)
00 20            ← Cipher suites length: 32 (16 suites × 2 bytes)
5a 5a            ← GREASE (0x5a5a)
13 01            ← TLS_AES_128_GCM_SHA256 (0x1301)
13 02            ← TLS_AES_256_GCM_SHA384 (0x1302)
13 03            ← TLS_CHACHA20_POLY1305_SHA256 (0x1303)
c0 2b            ← TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 (0xc02b)
c0 2f            ← TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)
c0 2c            ← TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 (0xc02c)
c0 30            ← TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (0xc030)
cc a9            ← TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256 (0xcca9)
cc a8            ← TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256 (0xcca8)
c0 13            ← TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA (0xc013)
c0 14            ← TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA (0xc014)
00 9c            ← TLS_RSA_WITH_AES_128_GCM_SHA256 (0x009c)
00 9d            ← TLS_RSA_WITH_AES_256_GCM_SHA384 (0x009d)
00 2f            ← TLS_RSA_WITH_AES_128_GCM_SHA256 (0x002f) — duplicate
00 35            ← TLS_RSA_WITH_AES_256_CBC_SHA (0x0035)
01 00            ← Extensions length: 0x0100 (256 bytes)
06 67            ← First extension type: 0x0667 → 1639? No, let me recheck...

Actually: 0x0033 = key_share (51), so let me parse the extension start:
00 33            ← Extension type: key_share (51)
04 ef            ← Extension length: 0x04ef (1263 bytes)
```

---

## Implementation Notes for browsercore

1. **Must include all extensions in the golden capture** for each profile. Missing even one extension (like ALPS or delegated_credentials) changes the JA4_c hash.

2. **GREASE must be randomized** per connection. The extension types, cipher suite, supported groups, and key share groups must all use a consistent GREASE value within a single handshake (same `0x?a?a` value for all positions in that connection).

3. **Safari's duplicate sigalg** (`rsa_pss_rsae_sha384` sent twice) must be preserved. Removing it makes the JA4_b hash wrong for Safari.

4. **Firefox's FFDHE groups** (`ffdhe2048`, `ffdhe3072`) must be in the supported_groups extension. Chrome and Safari omit these.

5. **Chrome 131+ sends X25519MLKEM768** (post-quantum) in key_share and supported_groups. This is a newer signal — older Chrome profiles do not send it.

6. **ECH extension (type 65037)** is sent by Chrome even when ECH is not being used (the extension is present with placeholder data). This is part of Chrome's anti-fingerprinting strategy.

---

## References

- [RFC 8446 §4.2](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2) — TLS 1.3 extensions
- [RFC 8701](https://datatracker.ietf.org/doc/html/rfc8701) — GREASE
- [RFC 8879](https://datatracker.ietf.org/doc/html/rfc8879) — Certificate compression
- [RFC 8449](https://datatracker.ietf.org/doc/html/rfc8449) — Record size limit
- [RFC 7685](https://datatracker.ietf.org/doc/html/rfc7685) — Padding
- [draft-ietf-tls-subcerts](https://datatracker.ietf.org/doc/html/draft-ietf-tls-subcerts) — Delegated credentials
- [FoxIO-LLC/ja4](https://github.com/FoxIO-LLC/ja4) — Extension handling in JA4
