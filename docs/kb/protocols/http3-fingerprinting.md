# HTTP/3 + QUIC Fingerprinting

HTTP/3 runs over QUIC (RFC 9000), a UDP-based transport protocol. QUIC integrates TLS 1.3 directly into the transport layer, and the combination of QUIC transport parameters and HTTP/3 SETTINGS forms a distinct fingerprint signal.

**Detection risk: Medium-High.** HTTP/3 fingerprinting is less mature than HTTP/2, but Akamai, Cloudflare, and curl-impersonate all validate these signals. As HTTP/3 adoption grows, this becomes increasingly important.

---

## QUIC Transport Parameters

QUIC carries transport parameters in a TLS extension (`quic_transport_parameters`, type 57) during the handshake. Each parameter is encoded as a varint ID + varint length + value bytes.

```
QUIC Transport Parameter wire format:
┌─────────────────────────────────────────────────────────┐
│ Parameter ID (varint)  │ Variable length                 │
│ Length (varint)        │ Variable length                 │
│ Value (bytes)          │ Length bytes                    │
└─────────────────────────────────────────────────────────┘
```

### Standard Transport Parameter IDs (RFC 9002 §18.2)

| ID (hex) | ID (dec) | Name | RFC |
|---|---|---|---|
| 0x00 | 0 | original_destination_connection_id | RFC 9000 |
| 0x01 | 1 | max_idle_timeout | RFC 9000 |
| 0x02 | 2 | stateless_reset_token | RFC 9000 |
| 0x03 | 3 | max_udp_payload_size | RFC 9000 |
| 0x04 | 4 | initial_max_data | RFC 9000 |
| 0x05 | 5 | initial_max_stream_data_bidi_local | RFC 9000 |
| 0x06 | 6 | initial_max_stream_data_bidi_remote | RFC 9000 |
| 0x07 | 7 | initial_max_stream_data_uni | RFC 9000 |
| 0x08 | 8 | initial_max_streams_bidi | RFC 9000 |
| 0x09 | 9 | initial_max_streams_uni | RFC 9000 |
| 0x0a | 10 | ack_delay_exponent | RFC 9000 |
| 0x0b | 11 | max_ack_delay | RFC 9000 |
| 0x0c | 12 | disable_active_migration | RFC 9000 |
| 0x0d | 13 | preferred_address | RFC 9000 |
| 0x0e | 14 | active_connection_id_limit | RFC 9000 |
| 0x0f | 15 | initial_source_connection_id | RFC 9000 |
| 0x10 | 16 | retry_source_connection_id | RFC 9000 |
| 0x20 | 32 | max_datagram_frame_size (RFC 9221) | RFC 9221 |
| 0x2ab2 | 10930 | discard (GREASE) | — |
| 0x6881 | 26753 | quic_version_indicator | draft |

### Per-Browser Transport Parameter Order

**Chrome** sorts transport parameters by ID (ascending) for deterministic encoding:
```
0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, ...
```

**Firefox** uses a browser-specific order (not strictly sorted):
```
0, 1, 3, 4, 5, 6, 7, 8, 9, 14, ...
```

**Safari** sends fewer parameters and in a distinct order.

### Per-Browser Transport Parameter Values

| Parameter | Chrome | Firefox | Safari |
|---|---|---|---|
| `max_idle_timeout` (1) | 30000 (ms) | 30000 (ms) | 30000 (ms) |
| `max_udp_payload_size` (3) | 65527 | 65527 | 65527 |
| `initial_max_data` (4) | 65536 | 65536 | 1048576 |
| `initial_max_stream_data_bidi_local` (5) | 65536 | 262144 | 262144 |
| `initial_max_stream_data_bidi_remote` (6) | 65536 | 65536 | 131072 |
| `initial_max_stream_data_uni` (7) | 65536 | 65536 | 131072 |
| `initial_max_streams_bidi` (8) | 100 | 16 | 100 |
| `initial_max_streams_uni` (9) | 100 | 16 | 3 |
| `ack_delay_exponent` (10) | 3 (or 10) | 10 | 10 |
| `max_ack_delay` (11) | 25 (ms) | 25 (ms) | 25 (ms) |
| `active_connection_id_limit` (14) | 2 | 2 | 2 |

**Key distinguishing signals:**
- `initial_max_data`: Chrome = 65536, Safari = 1048576
- `initial_max_streams_bidi`: Firefox = 16, Chrome/Safari = 100
- `initial_max_streams_uni`: Firefox = 16, Chrome = 100, Safari = 3
- `ack_delay_exponent`: Chrome = 3 or 10, Firefox/Safari = 10

---

## QUIC GREASE

QUIC has two forms of GREASE:

### 1. Transport Parameter ID GREASE

Chrome sends a transport parameter with a GREASE ID (random `0x?a?a` value) to prevent middlebox interference.

GREASE transport parameter IDs: `0x0a0a`, `0x1a1a`, ..., `0xfafa` (same pattern as TLS GREASE).

### 2. GREASE Frames

Chrome sends GREASY frames early in the connection to exercise the frame parsing path.

```
GREASE QUIC frame type: 0x?a?a × N (varint-encoded frame type)
```

These frames are ignored by the receiver but must be present for Chrome fingerprinting.

---

## HTTP/3 SETTINGS

After the QUIC handshake, HTTP/3 SETTINGS frames are exchanged. These differ from HTTP/2 SETTINGS.

```
HTTP/3 SETTINGS frame (type 0x04):
┌─────────────────────────────────────────────────────────┐
│ Length (varint)    │ Total settings length              │
│ Type (1 byte)      │ 0x04                              │
├─────────────────────────────────────────────────────────┤
│ Setting ID (varint)│ One of:                           │
│                    │   0x00 = SETTINGS_MAX_FIELD_SECTION_SIZE │
│                    │   0x01 = QPACK_MAX_TABLE_CAPACITY  │
│                    │   0x02 = QPACK_BLOCKED_STREAMS     │
│                    │   0x06 = SETTINGS_NUM_PLACEHOLDERS │
│ Value (varint)     │ Variable-length integer           │
└─────────────────────────────────────────────────────────┘
```

### HTTP/3 Setting IDs

| ID (hex) | Name | RFC 9114 |
|---|---|---|
| 0x00 | SETTINGS_MAX_FIELD_SECTION_SIZE | §7.2.4.1 |
| 0x01 | QPACK_MAX_TABLE_CAPACITY | §7.2.4.2 |
| 0x02 | QPACK_BLOCKED_STREAMS | §7.2.4.3 |
| 0x06 | SETTINGS_NUM_PLACEHOLDERS | §7.2.4.4 |

### Per-Browser HTTP/3 SETTINGS

| Browser | Settings sent | Order |
|---|---|---|
| Chrome | QPACK_MAX_TABLE_CAPACITY=0, QPACK_BLOCKED_STREAMS=0 | 1, 2 |
| Firefox | QPACK_MAX_TABLE_CAPACITY=0, QPACK_BLOCKED_STREAMS=0, SETTINGS_NUM_PLACEHOLDERS=100 | 1, 2, 6 |
| Safari | QPACK_MAX_TABLE_CAPACITY=0, QPACK_BLOCKED_STREAMS=0 | 1, 2 |

**Note:** HTTP/3 SETTINGS are less fingerprintable than HTTP/2 SETTINGS because many implementations send identical minimal sets. The QUIC transport parameters are the stronger signal.

---

## HTTP/3 Pseudo-Header Order

Like HTTP/2, HTTP/3 HEADERS contain pseudo-headers. The order matches the HTTP/2 convention for each browser:

| Browser | Order | Notation |
|---|---|---|
| Chrome | `:method, :authority, :scheme, :path` | MASP |
| Firefox | `:method, :path, :authority, :scheme` | MPAS |
| Safari | `:method, :scheme, :authority, :path` | MSAP |

---

## HTTP/3 GREASE Frames (RFC 9114 §7.2.8)

RFC 9114 §7.2.8 mandates that implementations ignore unknown frame types. Chrome sends GREASE frames with random type values early in the connection.

```
HTTP/3 GREASE frame:
┌─────────────────────────────────────────────────────────┐
│ Type (varint)    │ Random (not a defined setting)       │
│ Length (varint)  │ 0 (empty payload)                    │
└─────────────────────────────────────────────────────────┘
```

Chrome sends one GREASE frame before the first HEADERS frame. The frame type is a random varint that doesn't match any defined HTTP/3 frame type.

---

## Packet Number Length

QUIC packet headers encode the packet number with a variable-length encoding (1-4 bytes). After the handshake completes:

| Browser | Packet number length (short header) |
|---|---|
| Chrome | 1-2 bytes (often 1 after handshake) |
| Firefox | 1-4 bytes (variable) |
| Safari | 1-4 bytes (variable) |

Chrome tends to use the shortest possible packet number encoding (1 byte) when the packet number difference is small. This is a secondary signal that WAFs can observe from packet captures.

---

## Spin Bit Behavior

QUIC has an optional "spin bit" in the short header (bit 3) that can be used to measure RTT. The spin bit toggles every RTT.

| Browser | Spin bit |
|---|---|
| Chrome | Enabled (toggles every RTT) |
| Firefox | Disabled (always 0) |
| Safari | Disabled (always 0) |

This is observable by on-path observers and can distinguish Chrome from Firefox/Safari.

---

## 0-RTT Connection Resumption

QUIC supports 0-RTT resumption, allowing the client to send data in the first flight after the handshake:

| Browser | 0-RTT behavior |
|---|---|
| Chrome | Supports 0-RTT, sends early data for GET requests |
| Firefox | Supports 0-RTT but conservative |
| Safari | Supports 0-RTT |

The presence of 0-RTT data in resumed connections is a fingerprint signal (Chrome is more aggressive).

---

## QUIC Version Negotiation

QUIC version numbers in the long header:

| Browser | Version |
|---|---|
| Chrome | 0x00000001 (RFC 9000) + 0xff00001d (draft-29, fallback) |
| Firefox | 0x00000001 (RFC 9000) |
| Safari | 0x00000001 (RFC 9000) |

The version number in the long header is part of the fingerprint. Chrome's use of specific draft versions is a signal.

---

## Connection ID Handling

QUIC uses connection IDs to identify connections across network path changes:

| Browser | Initial connection ID length |
|---|---|
| Chrome | 8 bytes (or longer in some versions) |
| Firefox | 8 bytes |
| Safari | Varies (often 8-18 bytes) |

---

## Implementation Notes for browsercore

1. **QUIC transport parameter ordering matters.** Chrome sorts by ID; Firefox uses browser-specific order. Match the target.

2. **QUIC GREASE transport parameter must be sent for Chrome.** Without it, the fingerprint diverges.

3. **HTTP/3 SETTINGS are minimal.** Most browsers send only QPACK_MAX_TABLE_CAPACITY=0 and QPACK_BLOCKED_STREAMS=0. Don't over-engineer this layer.

4. **Pseudo-header order in HTTP/3 must match HTTP/2.** The same MASP/MPAS/MSAP convention applies.

5. **Packet number length should use the shortest encoding.** Chrome uses 1 byte when possible. This is a packet-capture observable signal.

6. **Spin bit must toggle for Chrome.** Firefox and Safari keep it at 0.

---

## References

- [RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000) — QUIC transport
- [RFC 9001](https://datatracker.ietf.org/doc/html/rfc9001) — QUIC TLS integration
- [RFC 9002](https://datatracker.ietf.org/doc/html/rfc9002) — QUIC transport parameters
- [RFC 9114](https://datatracker.ietf.org/doc/html/rfc9114) — HTTP/3
- [RFC 9114 §7.2.8](https://datatracker.ietf.org/doc/html/rfc9114#section-7.2.8) — HTTP/3 GREASE
- [RFC 9221](https://datatracker.ietf.org/doc/html/rfc9221) — QUIC datagram extension
- [curl-impersonate HTTP/3 support](https://github.com/lwthiker/curl-impersonate) — Reference implementation
- [impers HTTP/3 fingerprint](https://github.com/Showfom/impers) — HTTP/3 fingerprint fields
