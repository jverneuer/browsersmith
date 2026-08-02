# @browsercore/crypto

A clean abstraction wrapping Node's native crypto APIs. Higher layers — especially
TLS — call these methods so the crypto backend is replaceable.

## Responsibility

Provide cryptographic primitives: secure randomness, hashing (SHA-256/384), HKDF
extract+expand per RFC 5869, AEAD (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305),
and X25519 key exchange. All I/O-free and unit-testable.

## What it does NOT know about

- TLS handshakes, key schedules, or wire formats
- HTTP (any version)
- Browser fingerprints
- Cookies

Higher layers compose exclusively through the `CryptoProvider` interface. The
production TLS implementation **never** calls `node:crypto` directly — it calls
`crypto.hkdf(...)`, `crypto.encrypt(...)`, etc. This makes the backend swappable
(WebCrypto, HSM, test double).

## Public API

```ts
import { crypto, NodeCryptoProvider, CryptoProvider } from "@browsercore/crypto";

// Use the default singleton (backed by node:crypto):
const key = crypto.randomBytes(32);
const digest = crypto.sha256(key);

// Or inject a custom provider (e.g. for tests):
const provider: CryptoProvider = new NodeCryptoProvider();
const bytes = provider.randomBytes(16);
```

## Types

| Export | Kind | Purpose |
| --- | --- | --- |
| `CryptoProvider` | interface | Pure crypto primitive abstraction higher layers depend on |
| `NodeCryptoProvider` | class | `node:crypto`-backed implementation |
| `crypto` | singleton | Default backend higher layers call into |
| `AeadCipher` | interface | Static AEAD parameters + encrypt/decrypt |
| `SymmetricCipherId` | discriminated union | `AES-128-GCM \| AES-256-GCM \| ChaCha20-Poly1305` |
| `HashId` | discriminated union | `SHA-256 \| SHA-384` |
| `KeyExchangeId` | discriminated union | `X25519` |
| `CryptoSessionId` | branded type | Derived-session identifier |
| `X25519KeyPair` | interface | X25519 public + secret key |
| `CryptoError` | class | Base typed error |
| `UnsupportedAlgorithmError` | class | Requested algorithm not supported |
| `DecryptError` | class | AEAD authentication failure |

## Dependency graph

```
@browsercore/crypto
  └─ node:crypto
```

No other `@browsercore/*` packages are imported.
