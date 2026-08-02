/**
 * Domain types for @browsercore/crypto.
 *
 * This package owns NO knowledge of TLS handshakes, key schedules, or wire formats.
 * It is a pure cryptographic primitive abstraction — randomness, hashing, key
 * derivation, AEAD, and key exchange. Higher layers (tls) compose exclusively
 * through these exports.
 */

import { createId } from "./utils.js";

/** Branded identifier for a derived cryptographic session (e.g. a TLS 1.3 session). */
export type CryptoSessionId = string & { __brand: "CryptoSessionId" };

/** Build a {@link CryptoSessionId} from a unique seed. */
export function createCryptoSessionId(): CryptoSessionId {
    return createId("csid") as CryptoSessionId;
}

// ---------------------------------------------------------------------------
// Symmetric cipher identifiers — discriminated union.
// ---------------------------------------------------------------------------

export type Aes128GcmId = "AES-128-GCM" & { __brand: "Aes128GcmId" };
export type Aes256GcmId = "AES-256-GCM" & { __brand: "Aes256GcmId" };
export type ChaCha20Poly1305Id = "ChaCha20-Poly1305" & { __brand: "ChaCha20Poly1305Id" };

/** Every symmetric AEAD cipher this provider supports. */
export type SymmetricCipherId =
    | Aes128GcmId
    | Aes256GcmId
    | ChaCha20Poly1305Id;

/** Canonical string literal for each AES-128-GCM usage. */
export const AES_128_GCM: Aes128GcmId = "AES-128-GCM" as Aes128GcmId;
/** Canonical string literal for each AES-256-GCM usage. */
export const AES_256_GCM: Aes256GcmId = "AES-256-GCM" as Aes256GcmId;
/** Canonical string literal for each ChaCha20-Poly1305 usage. */
export const CHACHA20_POLY1305: ChaCha20Poly1305Id = "ChaCha20-Poly1305" as ChaCha20Poly1305Id;

// ---------------------------------------------------------------------------
// Hash identifiers — discriminated union.
// ---------------------------------------------------------------------------

export type Sha256Id = "SHA-256" & { __brand: "Sha256Id" };
export type Sha384Id = "SHA-384" & { __brand: "Sha384Id" };

/** Every hash function this provider supports. */
export type HashId = Sha256Id | Sha384Id;

/** Canonical string literal for each SHA-256 usage. */
export const SHA_256: Sha256Id = "SHA-256" as Sha256Id;
/** Canonical string literal for each SHA-384 usage. */
export const SHA_384: Sha384Id = "SHA-384" as Sha384Id;

// ---------------------------------------------------------------------------
// Key exchange identifiers — discriminated union.
// ---------------------------------------------------------------------------

export type X25519Id = "X25519" & { __brand: "X25519Id" };

/** Every key exchange mechanism this provider supports. */
export type KeyExchangeId = X25519Id;

/** Canonical string literal for each X25519 usage. */
export const X25519: X25519Id = "X25519" as X25519Id;

// ---------------------------------------------------------------------------
// AEAD cipher descriptor — describes the static parameters of a cipher.
// ---------------------------------------------------------------------------

/**
 * Static description of an AEAD cipher's parameters. Concrete ciphers expose
 * this so higher layers can size buffers without hard-coding constants.
 */
export interface AeadCipher {
    /** Identifier for this cipher. */
    readonly id: SymmetricCipherId;
    /** Key size in bytes. */
    readonly keySize: number;
    /** Nonce (IV) size in bytes. */
    readonly nonceSize: number;
    /** Authentication tag size in bytes. */
    readonly tagSize: number;
    /**
     * Encrypt `plaintext` under `key`/`nonce`, authenticating `aad`.
     * Returns ciphertext with the tag appended.
     */
    readonly encrypt: (
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ) => Uint8Array;
    /**
     * Decrypt `ciphertext` (with appended tag) under `key`/`nonce`, verifying `aad`.
     * Throws {@link DecryptError} on authentication failure.
     */
    readonly decrypt: (
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ) => Uint8Array;
}

/** An X25519 key pair. The secret key MUST be zeroed after use by the caller. */
export interface X25519KeyPair {
    /** Public key — 32 bytes. */
    readonly publicKey: Uint8Array;
    /** Secret key — 32 bytes. */
    readonly secretKey: Uint8Array;
}
