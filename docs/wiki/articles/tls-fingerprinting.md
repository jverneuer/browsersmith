# TLS Fingerprinting (JA3/JA4)

browsercore's TLS layer (`@browsercore/tls`) constructs a ClientHello that is
**byte-for-byte identical** to a specific browser version. Bot detectors that
hash the ClientHello (JA3) or the full TLS fingerprint (JA4) see the same value
a real browser would emit.

## How the ClientHello is built

`buildClientHello()` in `tls/src/handshake/client-hello.ts` serializes the
handshake message in RFC 8446 order:

```
legacy_version(2) || random(32) || session_id || cipher_suites ||
compression_methods || extensions
```

The signals that drive the fingerprint come from a `BrowserProfile`'s
`TlsProfile` (`profiles/src/types.ts`):

| Field | Type | Fingerprint impact |
| --- | --- | --- |
| `cipherSuites` | `readonly string[]` | Order matters. Chrome starts with a GREASE placeholder (`TLS_GREASE_RESERVED_0`), Firefox does not. |
| `extensionOrder` | `readonly number[]` | IANA extension type ids in the order they appear. Chrome sends `[0, 10, 11, 13, 16, 17513, 18, 23, 27, 35, 41, 43, 45, 5, 51, 65281]`; Firefox omits 27 and 5. |
| `supportedVersions` | `readonly string[]` | Advertised TLS versions. `["TLS 1.3", "TLS 1.2"]` for all built-ins. |
| `keyShareGroups` | `readonly string[]` | `(EC)DHE` groups in the key_share extension. Chrome: `["x25519", "secp256r1"]`; Firefox adds `secp384r1`. |
| `signatureAlgorithms` | `readonly string[]` | CertificateVerify algorithms. |
| `grease` | `boolean` | Whether to emit RFC 8701 GREASE values. Chrome/Edge/Safari: `true`. Firefox: `false`. |
| `recordSizeLimit?` | `number` | Optional `record_size_limit` extension value. |

## Translation seam

`fetch/src/profile.ts` is the **only** place that bridges the data layer
(string-based profiles) and the protocol layer (literal-union configs). The
`profileToTlsConfig()` function validates every value against the exhaustive
`CipherSuite`, `NamedGroup`, and `SignatureScheme` sets. Invalid values throw a
`FetchError` here — never deeper in the stack.

```ts
// tls/src/types.ts — the strict unions profiles are narrowed to:
export type CipherSuite =
    | "TLS_AES_128_GCM_SHA256"   // 0x1301
    | "TLS_AES_256_GCM_SHA384"   // 0x1302
    | "TLS_CHACHA20_POLY1305_SHA256" // 0x1303
    | "TLS_AES_128_CCM_SHA256";  // 0x1304

export type NamedGroup = "secp256r1" | "secp384r1" | "x25519" | "x448";

export type SignatureScheme =
    | "ecdsa_secp256r1_sha256" | "ecdsa_secp384r1_sha384"
    | "rsa_pss_rsae_sha256" | "rsa_pss_rsae_sha384" | "rsa_pkcs1_sha256";
```

Cipher suites map to IANA wire bytes via an exhaustive `cipherSuiteToWire()`
switch — `assertNever` in the default branch means adding a suite is a compile
error until handled.

## GREASE (RFC 8701)

Chrome, Edge, and Safari enable GREASE — they reserve cipher `0x?a?a`, extension
`0x?a?a`, and key-share group `0x?a?a` to force server tolerance. In the
profile data this is the `grease: true` flag and the `TLS_GREASE_RESERVED_0`
sentinel at the top of `cipherSuites`. Firefox omits all of it (`grease: false`),
which itself is a distinguishing signal.

## JA3 / JA4 verification

`@browsercore/testing` exports `computeJa3()` and `computeJa4()` from
`testing/src/fingerprint/index.js`. The test suite (`tests/golden-fingerprint.test.ts`)
compares the generated ClientHello against real browser captures in
`testing/captures/`:

- `chrome-140/tls/client_hello.bin` — captured via `curl-impersonate --chrome-140`
- `firefox-128/tls/client_hello.bin` — captured via `curl-impersonate --firefox-128`

The `.meta.json` sidecar lists randomized fields (`client_random` at offset 12,
ephemeral key at offset 49) so comparison masks them. HTTP/2 SETTINGS frames have
**no** randomized fields — their `.meta.json` has an empty `randomizedFields`
array.

## What the connection exposes

Once handshaked, the `TlsConnection.state` discriminated union carries the
negotiated parameters:

```ts
// tls/src/types.ts
export type TlsState =
    | { readonly state: "connecting" }
    | { readonly state: "handshaking" }
    | { readonly state: "open";
        readonly sessionId: TlsSessionId;
        readonly protocolVersion: ProtocolVersion;  // TLS 1.2 | TLS 1.3
        readonly cipherSuite: CipherSuite;
        readonly alpnProtocol?: string; }           // "h2" | "http/1.1"
    | { readonly state: "closed"; readonly reason: CloseReason };
```

The `alpnProtocol` value is what `fetch/src/dispatch.ts` reads to branch into
HTTP/2 or HTTP/1.1.
