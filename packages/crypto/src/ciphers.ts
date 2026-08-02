/**
 * Concrete {@link AeadCipher} descriptors for @network/crypto.
 *
 * These are thin wrappers over the node:crypto AEAD primitives (imported from
 * `crypto.ts` — this file does NOT import `node:crypto` itself). Higher layers
 * size buffers from `keySize`/`nonceSize`/`tagSize` instead of hard-coding the
 * NIST/IETF constants.
 *
 * Constants used here are the standard, fixed values for these ciphers:
 *  - AES (FIPS 197 / NIST SP 800-38D): 128-bit key = 16 bytes, 256-bit key =
 *    32 bytes; GCM nonce = 12 bytes (96-bit, the recommended/IV length); GCM tag
 *    = 16 bytes (the maximum, and what node:crypto always emits).
 *  - ChaCha20-Poly1305 (RFC 8439): key = 32 bytes (256-bit); nonce = 12 bytes
 *    (96-bit IETF variant); Poly1305 tag = 16 bytes.
 */

import { aeadDecrypt, aeadEncrypt } from "./crypto.js";
import { AES_128_GCM, AES_256_GCM, CHACHA20_POLY1305 } from "./types.js";
import type { AeadCipher, SymmetricCipherId } from "./types.js";

/** AES-128-GCM: 16-byte key, 12-byte nonce, 16-byte tag (NIST SP 800-38D). */
export const aes128Gcm: AeadCipher = {
    id: AES_128_GCM,
    keySize: 16,
    nonceSize: 12,
    tagSize: 16,
    encrypt(key, nonce, plaintext, aad): Uint8Array {
        return aeadEncrypt(AES_128_GCM, key, nonce, plaintext, aad);
    },
    decrypt(key, nonce, ciphertext, aad): Uint8Array {
        return aeadDecrypt(AES_128_GCM, key, nonce, ciphertext, aad);
    },
};

/** AES-256-GCM: 32-byte key, 12-byte nonce, 16-byte tag (NIST SP 800-38D). */
export const aes256Gcm: AeadCipher = {
    id: AES_256_GCM,
    keySize: 32,
    nonceSize: 12,
    tagSize: 16,
    encrypt(key, nonce, plaintext, aad): Uint8Array {
        return aeadEncrypt(AES_256_GCM, key, nonce, plaintext, aad);
    },
    decrypt(key, nonce, ciphertext, aad): Uint8Array {
        return aeadDecrypt(AES_256_GCM, key, nonce, ciphertext, aad);
    },
};

/** ChaCha20-Poly1305: 32-byte key, 12-byte nonce, 16-byte tag (RFC 8439). */
export const chacha20Poly1305: AeadCipher = {
    id: CHACHA20_POLY1305,
    keySize: 32,
    nonceSize: 12,
    tagSize: 16,
    encrypt(key, nonce, plaintext, aad): Uint8Array {
        return aeadEncrypt(CHACHA20_POLY1305, key, nonce, plaintext, aad);
    },
    decrypt(key, nonce, ciphertext, aad): Uint8Array {
        return aeadDecrypt(CHACHA20_POLY1305, key, nonce, ciphertext, aad);
    },
};

/** Every supported {@link AeadCipher}, indexed by {@link SymmetricCipherId}. */
export const CIPHER_BY_ID: Readonly<Record<SymmetricCipherId, AeadCipher>> = {
    [AES_128_GCM]: aes128Gcm,
    [AES_256_GCM]: aes256Gcm,
    [CHACHA20_POLY1305]: chacha20Poly1305,
};
