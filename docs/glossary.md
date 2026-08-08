# Glossary

Definitions of the fingerprinting and protocol terms used throughout the browsersmith docs. Each entry cites the relevant RFC and links to the docs page where the term is most useful.

## TLS terms

### AES-GCM / AES-CCM / ChaCha20-Poly1305

The three AEAD (authenticated encryption with associated data) cipher families browsersmith supports. All combine encryption and integrity in one step; TLS 1.3 (RFC 8446) uses them exclusively for the symmetric phase.

### ALPN

Application-Layer Protocol Negotiation (RFC 7301) — a TLS extension where the client advertises which application protocols it speaks (`h2`, `http/1.1`) during the handshake. browsersmith's profiles advertise `["h2", "http/1.1"]` to match Chrome and Firefox.

### Cipher suite

A named bundle of key exchange, authentication, encryption, and MAC algorithms (e.g. `TLS_AES_128_GCM_SHA256`) that TLS negotiates. TLS 1.3 (RFC 8446) defines five standard suites; the order of the client's offered list is part of the fingerprint. See [architecture.md](./architecture.md#where-the-fingerprint-lives).

### ClientHello

The first message of the TLS handshake (RFC 8446), carrying version, cipher suites, extensions, key shares, and ALPN list. Its byte layout is the entire input to JA3 and JA4 — the load-bearing fingerprint surface. See [architecture.md](./architecture.md#where-the-fingerprint-lives).

### GREASE

Generate Random Extensions And Sustain Extensibility (RFC 8701) — reserved "garbage" values Chrome injects into cipher lists, extensions, and key shares to prevent middlebox ossification. Firefox does not. browsersmith's `chrome-140` profile sets `grease: true`; `firefox-128` sets `grease: false`.

### JA3

Salesforce's TLS fingerprint (2017): an MD5 of five comma-joined ClientHello fields — version, cipher list, extension list, supported groups, EC point formats. Bot detectors compare the hash against known-browser whitelists; browsersmith's `@browsercore/tls` matches the target browser. See [bot-detection.md](./bot-detection.md).

### JA4

FoxIO's newer TLS fingerprint (2023): a four-part `a_b_c_d` tag from GREASE-stripped ClientHello fields, hashed with SHA-256 and truncated. More permutation-resistant than JA3; some detectors have migrated. browsersmith profiles match JA4 as well as JA3.

### Key share

A TLS 1.3 extension (RFC 8446) carrying the client's ephemeral public key for key exchange — X25519, secp256r1, or secp384r1. The set of groups and their order are part of the fingerprint.

### Named group

The elliptic curve or finite-field group used for TLS key exchange (e.g. `x25519`, `secp256r1`, `secp384r1`, `ffdhe2048`). Listed in the ClientHello's `supported_groups` extension; the order is part of JA3 and JA4.

## HTTP/2 terms

### HPACK

HTTP/2's header compression format (RFC 7541): a static table of 61 common headers, a per-connection dynamic table, and Huffman coding. The dynamic-table size and the encoder's indexing choices are part of the fingerprint surface, owned by `@browsercore/http2`.

### HTTP/2 fingerprint (Akamai format)

A string like `1:65536;2:0;4:131072;5:16384|12517377|0|m,a,s,p` encoding the client's SETTINGS, initial WINDOW_UPDATE, priority frame, and pseudo-header order. Named after Akamai, the first major detector to use it; the second fingerprinting layer after TLS. See [bot-detection.md](./bot-detection.md).

### Pseudo-headers

HTTP/2's replacement for the HTTP/1.1 request line (RFC 9113): four headers — `:method`, `:scheme`, `:authority`, `:path` — prefixed with a colon. Their order in HEADERS is part of the Akamai fingerprint; Chrome uses `m,a,s,p`, Firefox uses `m,p,a,s`.

### SETTINGS frame

HTTP/2's per-connection config frame (RFC 9113), sent at connection start. Carries parameters like `HEADER_TABLE_SIZE`, `INITIAL_WINDOW_SIZE`, and `MAX_CONCURRENT_STREAMS`. The values and their emit order are the primary input to the Akamai HTTP/2 fingerprint.

### Stream

HTTP/2's per-request multiplexed channel (RFC 9113), identified by a 31-bit stream id (odd for client-initiated, even for server, 0 for the connection itself). Multiple streams share one TCP connection.

### WINDOW_UPDATE

HTTP/2 flow-control frame (RFC 9113) advertising bytes a receiver will accept on a stream or connection. The initial connection-level WINDOW_UPDATE is part of the Akamai fingerprint string.

## HTTP/3 and QUIC terms

### Datagram

A UDP packet — QUIC's underlying transport unit. browsersmith's `@browsercore/quic` consumes a `DatagramTransport` interface (`read`/`write`/`close` over UDP). AWS Lambda blocks UDP egress, so HTTP/3 is unavailable there. See [serverless.md](./serverless.md#http3-caveat).

### HTTP/3

RFC 9114 — HTTP semantics over QUIC instead of TCP. Multiplexed streams with no head-of-line blocking, built-in 0-RTT, and a separate fingerprint surface (transport parameters + QPACK). Experimental in browsersmith. See [architecture.md](./architecture.md#the-http3-path).

### QPACK

HTTP/3's header compression format (RFC 9204), the QUIC-friendly successor to HPACK. Same static + dynamic table model, redesigned to handle QUIC's out-of-order stream delivery. Owned by `@browsercore/http3`.

### QUIC

RFC 9000 — a UDP-based transport combining TLS 1.3, stream multiplexing, congestion control, and 0-RTT resumption. The substrate HTTP/3 runs on. browsersmith implements it in pure TypeScript in `@browsercore/quic`. See [architecture.md](./architecture.md#the-http3-path).

### Transport parameters

QUIC's per-connection config (RFC 9000): initial max data, max streams, idle timeout, etc. Exchanged in the TLS handshake; part of the QUIC fingerprint surface for HTTP/3-aware detectors.

## Cookies and bot detection

### Bot detection

Server-side systems that fingerprint HTTP, TLS, and behavioral signals to reject non-browser clients. Cloudflare, Akamai, DataDome, and PerimeterX all do it. See [bot-detection.md](./bot-detection.md).

### CHIPS

Cookies Having Independent Partitioned State — the `Partitioned` cookie attribute (RFC 6265bis) that scopes a third-party cookie to the top-level site that set it. Supported by Chrome 115+; `@browsercore/cookies` is CHIPS-aware.

### HTTP/2 fingerprinting

Identifying a client by its HTTP/2 SETTINGS, initial WINDOW_UPDATE, and pseudo-header order, usually in the Akamai string format. The second fingerprinting layer after TLS; browsersmith's profiles pin all three.

### SameSite

A cookie attribute (RFC 6265bis) — `Strict`, `Lax`, or `None` — controlling whether a cookie is sent on cross-site requests. Modern browsers default to `Lax`; `@browsercore/cookies` parses and enforces the rules.

### TLS fingerprinting

Identifying a client by hashing its TLS ClientHello bytes — most commonly as JA3 or JA4. The first fingerprinting layer a request hits; browsersmith defeats it by emitting a Chrome- or Firefox-matching ClientHello.
