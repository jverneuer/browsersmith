# @browsercore/crypto — Implementation Plan

This package is the cryptographic foundation everything else builds on. Implement
in this order; each step is independently testable.

## Step 1 — Randomness + hashing (DONE)

`randomBytes`, `sha256`, and `sha384` are implemented and tested against
`node:crypto` as the oracle. These are simple wrappers — no design decisions to
defer.

## Step 2 — HKDF extract+expand per RFC 5869

Implement `hkdf()` over the already-working hash functions:

1. **Extract**: `PRK = HMAC-Hash(salt, ikm)`. Default `salt` to a zero-filled
   string of the hash length per the RFC when the caller passes an empty salt.
2. **Expand**: iterate `T(i) = HMAC-Hash(PRK, T(i-1) | info | counter)` until
   `length` bytes are produced; truncate the final block.
3. Use `crypto.hkdfSync` (Node 20+) under the hood — the wrapper exists so the
   provider interface stays the unit of abstraction.

Tests: verify against the RFC 5869 test vectors (cases 1–3) for SHA-256, and
assert the output length equals the requested `length` for a range of sizes.

## Step 3 — AEAD helpers with constant-time-ish handling

Implement the six AEAD methods (`aes128/256GcmEncrypt/Decrypt`,
`chacha20Poly1305Encrypt/Decrypt`):

1. Use `crypto.createCipheriv` / `crypto.createDecipheriv` with the matching
   algorithm string.
2. Call `setAuthTag` / `setAAD` for the additional authenticated data.
3. On decryption, let `final()` throw and map any auth-tag mismatch to
   `DecryptError` — never leak whether the error was truncation vs. tag.
4. Validate key/nonce sizes up front and throw `UnsupportedAlgorithmError` for
   anything that does not match the cipher's declared parameters.

Tests: encrypt-then-decrypt round trips for each cipher; assert `DecryptError`
fires on a flipped ciphertext byte; assert `DecryptError` fires on a wrong AAD.

## Step 4 — X25519 keygen + shared secret

Implement the two X25519 methods:

1. Use `crypto.generateKeyPairSync("x25519")` to produce a key pair; return raw
   32-byte `Uint8Array`s (not PEM/DER).
2. Use `crypto.diffieHellman({ privateKey, publicKey })` for the shared secret.
3. Assert both sides derive the same secret (Alice's secret + Bob's public ===
   Bob's secret + Alice's public).

Tests: against RFC 7748 test vector (Alice=0x90…/ Bob=0x89… → shared secret); assert
the shared secret is exactly 32 bytes; assert symmetry property holds.

## Step 5 — Wire the `AeadCipher` descriptors

Expose concrete `AeadCipher` objects for each supported cipher so higher layers
can size buffers from `keySize` / `nonceSize` / `tagSize` without hard-coding
constants. These are thin wrappers over the methods from Step 3.

Tests: assert the declared sizes match the real NIST/ITEF constants
(AES-128-GCM: 16/12/16; AES-256-GCM: 32/12/16; ChaCha20-Poly1305: 32/12/16).

## Step 6 — Signature verification

Implement `verifySignature()` over `@browsercore/crypto`'s `node:crypto` primitives:

1. Rehydrate a DER SPKI public key and dispatch on the signature scheme.
2. Support ECDSA (P-256/SHA-256, P-384/SHA-384) and RSA-PSS (SHA-256/384, salt length 32).

Tests: verify a known-good signature for each scheme; assert rejection on a flipped byte.

## Definition of done

- [x] `randomBytes` / `sha256` / `sha384` match `node:crypto` for known vectors.
- [x] `hkdf` matches RFC 5869 test vectors for SHA-256.
- [x] AEAD encrypt/decrypt round-trips for all three ciphers.
- [x] AEAD decryption throws `DecryptError` on tampered input or wrong AAD.
- [x] X25519 keygen/shared-secret match the RFC 7748 vector and are symmetric.
- [x] `AeadCipher` descriptors report correct sizes for each cipher.
- [x] `verifySignature` verifies ECDSA P-256/384 and RSA-PSS/PKCS1 SHA-256/384 signatures.
- [x] Every test in `tests/` passes; `tsc --build` is clean.
