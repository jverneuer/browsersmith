/**
 * AEAD encryption/decryption backed by node:crypto's GCM/ChaCha20-Poly1305 ciphers.
 *
 * Ciphertext is returned with the 16-byte authentication tag appended, matching the
 * CryptoProvider contract. These primitives are shared by the NodeCryptoProvider
 * methods and the concrete AeadCipher descriptors in ciphers.ts, so neither module
 * imports node:crypto directly for AEAD.
 *
 * @module
 * @since 0.1.0
 */

import { createCipheriv, createDecipheriv, type CipherCCM, type CipherCCMOptions, type CipherCCMTypes, type CipherChaCha20Poly1305Types, type CipherGCM, type CipherGCMTypes, type DecipherCCM, type DecipherGCM } from "node:crypto";

import { type SymmetricCipherId } from "@browsercore/crypto";
import { DecryptError } from "@browsercore/crypto";
import { assertNever } from "@browsercore/crypto";

/** AEAD tag length for the ciphers this provider supports (bytes). */
const AEAD_TAG_LENGTH = 16;

/**
 * Every node:crypto AEAD algorithm string this provider uses. Union of the three
 * algorithm-type unions so a single return type covers every branch below.
 */
type AeadAlgorithmName = CipherGCMTypes | CipherCCMTypes | CipherChaCha20Poly1305Types;

/**
 * Full node:crypto configuration for a branded cipher.
 *
 * Both the algorithm string and the per-cipher options are always looked up
 * together (in `aeadEncrypt` and `aeadDecrypt`), so a single switch returns
 * both — one exhaustiveness guard, reachable from the public API, instead of
 * two guards where the second was dead code.
 *
 * @param cipher The branded cipher identifier.
 * @returns The node:crypto algorithm string and its cipher options.
 */
function aeadCipherConfig(cipher: SymmetricCipherId): {
    algorithm: AeadAlgorithmName;
    options: CipherCCMOptions | undefined;
} {
    switch (cipher) {
        case "AES-128-GCM":
            return { algorithm: "aes-128-gcm", options: undefined };
        case "AES-256-GCM":
            return { algorithm: "aes-256-gcm", options: undefined };
        case "AES-128-CCM":
            return { algorithm: "aes-128-ccm", options: { authTagLength: AEAD_TAG_LENGTH } };
        case "ChaCha20-Poly1305":
            return { algorithm: "chacha20-poly1305", options: undefined };
        default:
            return assertNever(cipher);
    }
}

/**
 * Run the node:crypto AEAD step on a constructed cipher.
 *
 * Shared by encrypt and decrypt: set the AAD, push the data, finalize, and
 * append the auth tag. Returns a standalone copy (not a view over node's
 * internal Buffer pool).
 *
 * @param cipher The constructed node:crypto cipher.
 * @param data   Data to encrypt.
 * @param aad    Additional authenticated data.
 * @returns Ciphertext with the auth tag appended.
 */
function runCipher(
    cipher: CipherGCM | CipherCCM,
    data: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    cipher.setAAD(aad, { plaintextLength: data.length });
    // Copy each piece into a fresh, exactly-sized buffer: node:crypto returns
    // Buffers that may be views over an internal pool, so a standalone copy keeps
    // the result correctly sized and safe to hold alongside later crypto calls.
    const out = new Uint8Array(cipher.update(data));
    const final = new Uint8Array(cipher.final());
    const tag = new Uint8Array(cipher.getAuthTag());
    const result = new Uint8Array(out.length + final.length + tag.length);
    result.set(out, 0);
    result.set(final, out.length);
    result.set(tag, out.length + final.length);
    return result;
}

/**
 * AEAD-encrypt with a node:crypto cipher.
 *
 * Returns ciphertext with the 16-byte authentication tag appended, matching
 * the {@link CryptoProvider} contract.
 *
 * @remarks
 * The options argument is passed conditionally: AES-CCM requires an explicit
 * `authTagLength`, while GCM and ChaCha20-Poly1305 use node's default. Passing
 * `undefined` explicitly trips up TypeScript's overload resolution for
 * `createCipheriv`, so we branch on the options presence instead.
 *
 * @param cipher    The AEAD cipher to use.
 * @param key       Symmetric key (exact size per cipher — see {@link AeadCipher.keySize}).
 * @param nonce     Initialization vector (exact size per cipher — see {@link AeadCipher.nonceSize}).
 * @param plaintext Data to encrypt.
 * @param aad       Additional authenticated data (not encrypted).
 * @returns Ciphertext with the 16-byte tag appended.
 *
 * @example
 * ```ts
 * const ciphertext = aeadEncrypt(
 *   AES_256_GCM,
 *   key,       // 32 bytes
 *   nonce,     // 12 bytes
 *   plaintext,
 *   aad
 * );
 * // ciphertext.length === plaintext.length + 16
 * ```
 *
 * @since 0.1.0
 */
export function aeadEncrypt(
    cipher: SymmetricCipherId,
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    const { algorithm, options } = aeadCipherConfig(cipher);
    const enc = options === undefined
        ? (createCipheriv(algorithm, key, nonce) as CipherGCM)
        : (createCipheriv(algorithm, key, nonce, options) as CipherCCM);
    return runCipher(enc, plaintext, aad);
}

/**
 * AEAD-decrypt with a node:crypto cipher.
 *
 * Expects ciphertext with the 16-byte tag appended. Throws {@link DecryptError}
 * on authentication failure (wrong key, tampered ciphertext, or corrupt tag).
 *
 * @param cipher    The AEAD cipher to use.
 * @param key       Symmetric key (exact size per cipher — see {@link AeadCipher.keySize}).
 * @param nonce     Initialization vector (exact size per cipher — see {@link AeadCipher.nonceSize}).
 * @param ciphertextAndTag Ciphertext with the 16-byte tag appended.
 * @param aad       Additional authenticated data that was passed to encrypt.
 * @returns Decrypted plaintext.
 * @throws {@link DecryptError} on authentication failure or if the input is shorter than the tag.
 *
 * @example
 * ```ts
 * try {
 *   const plaintext = aeadDecrypt(AES_256_GCM, key, nonce, ciphertext, aad);
 * } catch (e) {
 *   if (e instanceof DecryptError) { throw e; }
 * }
 * ```
 *
 * @since 0.1.0
 */
export function aeadDecrypt(
    cipher: SymmetricCipherId,
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertextAndTag: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    if (ciphertextAndTag.length < AEAD_TAG_LENGTH) {
        throw new DecryptError(cipher);
    }
    const { algorithm, options } = aeadCipherConfig(cipher);
    const tagStart = ciphertextAndTag.length - AEAD_TAG_LENGTH;
    const ciphertext = ciphertextAndTag.subarray(0, tagStart);
    const tag = ciphertextAndTag.subarray(tagStart);
    const dec = options === undefined
        ? (createDecipheriv(algorithm, key, nonce) as DecipherGCM)
        : (createDecipheriv(algorithm, key, nonce, options) as DecipherCCM);
    dec.setAuthTag(tag);
    dec.setAAD(aad, { plaintextLength: ciphertext.length });
    try {
        // Standalone copy for the same reason as encrypt (pooled node Buffers).
        const plaintext = new Uint8Array(dec.update(ciphertext));
        const final = new Uint8Array(dec.final());
        const out = new Uint8Array(plaintext.length + final.length);
        out.set(plaintext, 0);
        out.set(final, plaintext.length);
        return out;
    } catch (cause) {
        // The only operations inside the try are node:crypto calls, which always
        // throw an Error on auth failure — cast preserves it as the cause.
        throw new DecryptError(cipher, { cause: cause as Error });
    }
}
