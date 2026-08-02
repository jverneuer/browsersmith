/**
 * Core crypto abstraction for @browsercore/crypto.
 *
 * The TLS implementation calls these methods — never `node:crypto` directly — so
 * the backend is replaceable (e.g. a WebCrypto provider, an HSM, or a test double).
 *
 * Method bodies are typed stubs that throw "not implemented — see PLAN.md" where
 * the real implementation is non-trivial. `randomBytes`, `sha256`, and `sha384` are
 * simple enough to implement here and are covered by tests.
 */

import {
    randomBytes as nodeRandomBytes,
    createHash,
    createHmac,
    hkdfSync,
    createCipheriv,
    createDecipheriv,
    generateKeyPairSync,
    createPublicKey,
    createPrivateKey,
    createVerify,
    diffieHellman,
    constants,
    type CipherGCM,
    type DecipherGCM,
} from "node:crypto";

import type { HashId, SymmetricCipherId, X25519KeyPair } from "./types.js";
import { AES_128_GCM, AES_256_GCM, CHACHA20_POLY1305 } from "./types.js";
import { DecryptError, UnsupportedAlgorithmError } from "./errors.js";
import { assertNever } from "./utils.js";

/**
 * Pure cryptographic primitive abstraction. Higher layers depend on this
 * interface — never on a concrete provider.
 */
export interface CryptoProvider {
    /** Generate `length` cryptographically-strong random bytes. */
    randomBytes(length: number): Uint8Array;

    /** Compute the SHA-256 digest of `data`. */
    sha256(data: Uint8Array): Uint8Array;

    /** Compute the SHA-384 digest of `data`. */
    sha384(data: Uint8Array): Uint8Array;

    /**
     * HKDF extract+expand per RFC 5869, using the given hash. Returns exactly
     * `length` bytes of key material.
     */
    hkdf(
        hash: HashId,
        salt: Uint8Array,
        ikm: Uint8Array,
        info: Uint8Array,
        length: number,
    ): Uint8Array;

    /** Compute the HMAC of `data` under `key` using the given hash. */
    hmac(hash: HashId, key: Uint8Array, data: Uint8Array): Uint8Array;

    /** AEAD-encrypt with AES-128-GCM. Ciphertext has the tag appended. */
    aes128GcmEncrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** AEAD-decrypt with AES-128-GCM. Throws {@link DecryptError} on auth failure. */
    aes128GcmDecrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** AEAD-encrypt with AES-256-GCM. Ciphertext has the tag appended. */
    aes256GcmEncrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** AEAD-decrypt with AES-256-GCM. Throws {@link DecryptError} on auth failure. */
    aes256GcmDecrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** AEAD-encrypt with ChaCha20-Poly1305. Ciphertext has the tag appended. */
    chacha20Poly1305Encrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** AEAD-decrypt with ChaCha20-Poly1305. Throws {@link DecryptError} on auth failure. */
    chacha20Poly1305Decrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array;

    /** Generate an X25519 key pair (32-byte keys). */
    x25519GenerateKeyPair(): X25519KeyPair;

    /**
     * Compute the X25519 shared secret between `secretKey` and `peerPublicKey`.
     * Returns 32 bytes.
     */
    x25519SharedSecret(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array;

    /**
     * Verify a digital signature over `data` using the given scheme and public key.
     *
     * The `data` is the raw message bytes that the signature covers (e.g. the
     * TBSCertificate DER for X.509 chain verification, or the TLS 1.3
     * CertificateVerify signed content). The hash step is performed internally
     * by node:crypto according to `scheme` — callers pass the pre-hash message,
     * never a digest.
     *
     * @param scheme     Signature scheme name (e.g. "ecdsa_secp256r1_sha256",
     *                   "rsa_pss_rsae_sha256", "rsa_pkcs1_sha256").
     * @param publicKey  DER-encoded SubjectPublicKeyInfo of the signer.
     * @param signature  Signature bytes (DER for ECDSA, raw for RSA-PSS/PKCS1).
     * @param data       The message the signature covers (NOT a digest).
     * @returns true if the signature is valid.
     * @throws UnsupportedAlgorithmError if the scheme is not recognized.
     */
    verifySignature(
        scheme: string,
        publicKey: Uint8Array,
        signature: Uint8Array,
        data: Uint8Array,
    ): boolean;
}

/** AEAD tag length for the ciphers this provider supports (bytes). */
const AEAD_TAG_LENGTH = 16;

/** Map a branded {@link SymmetricCipherId} to the algorithm string node:crypto expects. */
function aeadAlgorithmName(cipher: SymmetricCipherId): string {
    switch (cipher) {
        case "AES-128-GCM":
            return "aes-128-gcm";
        case "AES-256-GCM":
            return "aes-256-gcm";
        case "ChaCha20-Poly1305":
            return "chacha20-poly1305";
        default:
            return assertNever(cipher);
    }
}

/**
 * AEAD-encrypt with a node:crypto cipher. Returns ciphertext with the 16-byte
 * authentication tag appended, matching the CryptoProvider contract.
 *
 * Exported so the concrete {@link AeadCipher} descriptors in `ciphers.ts` can
 * delegate to the same primitives without importing `node:crypto` themselves.
 */
export function aeadEncrypt(
    cipher: SymmetricCipherId,
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    const algorithm = aeadAlgorithmName(cipher);
    const enc = createCipheriv(algorithm, key, nonce) as CipherGCM;
    enc.setAAD(aad);
    const ciphertext = new Uint8Array(enc.update(plaintext));
    const final = new Uint8Array(enc.final());
    const tag = new Uint8Array(enc.getAuthTag());
    const out = new Uint8Array(ciphertext.length + final.length + tag.length);
    out.set(ciphertext, 0);
    out.set(final, ciphertext.length);
    out.set(tag, ciphertext.length + final.length);
    return out;
}

/**
 * AEAD-decrypt with a node:crypto cipher. Expects ciphertext with the 16-byte
 * tag appended. Throws {@link DecryptError} on authentication failure.
 *
 * Exported so the concrete {@link AeadCipher} descriptors in `ciphers.ts` can
 * delegate to the same primitives without importing `node:crypto` themselves.
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
    const algorithm = aeadAlgorithmName(cipher);
    const tagStart = ciphertextAndTag.length - AEAD_TAG_LENGTH;
    const ciphertext = ciphertextAndTag.subarray(0, tagStart);
    const tag = ciphertextAndTag.subarray(tagStart);
    const dec = createDecipheriv(algorithm, key, nonce) as DecipherGCM;
    dec.setAuthTag(tag);
    dec.setAAD(aad);
    try {
        const plaintext = new Uint8Array(dec.update(ciphertext));
        const final = new Uint8Array(dec.final());
        const out = new Uint8Array(plaintext.length + final.length);
        out.set(plaintext, 0);
        out.set(final, plaintext.length);
        return out;
    } catch (cause) {
        // exactOptionalPropertyTypes: only pass `cause` when it is a real Error.
        const err = cause instanceof Error ? cause : undefined;
        const options = err !== undefined ? { cause: err } : undefined;
        throw new DecryptError(cipher, options);
    }
}

/**
 * Raw-bytes <-> KeyObject conversion for X25519. Node's JWK import needs the
 * public coordinate on a private key, which a bare 32-byte secret doesn't carry,
 * so we instead rebuild the fixed DER containers: PKCS8 (private) and SPKI (public)
 * each have a constant prefix followed by the 32-byte coordinate. Capturing the
 * prefixes from one template keypair gives us stable wrappers for any raw scalar.
 */
const x25519Template = generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
});
const X25519_PRIV_PREFIX = new Uint8Array(x25519Template.privateKey).subarray(0, -32);
const X25519_PUB_PREFIX = new Uint8Array(x25519Template.publicKey).subarray(0, -32);

/** Wrap a raw 32-byte X25519 private scalar as a PKCS8 DER KeyObject. */
function x25519PrivateKeyFromRaw(d: Uint8Array): ReturnType<typeof createPrivateKey> {
    const der = new Uint8Array(X25519_PRIV_PREFIX.length + d.length);
    der.set(X25519_PRIV_PREFIX, 0);
    der.set(d, X25519_PRIV_PREFIX.length);
    return createPrivateKey({ key: Buffer.from(der), format: "der", type: "pkcs8" });
}

/** Wrap a raw 32-byte X25519 public coordinate as a SPKI DER KeyObject. */
function x25519PublicKeyFromRaw(x: Uint8Array): ReturnType<typeof createPublicKey> {
    const der = new Uint8Array(X25519_PUB_PREFIX.length + x.length);
    der.set(X25519_PUB_PREFIX, 0);
    der.set(x, X25519_PUB_PREFIX.length);
    return createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
}

/**
 * Map a branded {@link HashId} to the algorithm string Node's `node:crypto`
 * expects. Exhaustive — adding a member to {@link HashId} forces every branch
 * below to compile-error until handled.
 */
function hashAlgorithmName(hash: HashId): string {
    switch (hash) {
        case "SHA-256":
            return "sha256";
        case "SHA-384":
            return "sha384";
        default:
            return assertNever(hash);
    }
}

/**
 * {@link CryptoProvider} backed by Node's native `node:crypto` module.
 * Exported as the default singleton so higher layers can call `crypto.hkdf(...)`
 * without threading a provider through every constructor.
 */
export class NodeCryptoProvider implements CryptoProvider {
    public randomBytes(length: number): Uint8Array {
        return nodeRandomBytes(length);
    }

    public sha256(data: Uint8Array): Uint8Array {
        return createHash("sha256").update(data).digest();
    }

    public sha384(data: Uint8Array): Uint8Array {
        return createHash("sha384").update(data).digest();
    }

    public hkdf(
        hash: HashId,
        salt: Uint8Array,
        ikm: Uint8Array,
        info: Uint8Array,
        length: number,
    ): Uint8Array {
        // node:crypto.hkdfSync(digest, ikm, salt, info, length).
        const digest = hashAlgorithmName(hash);
        const key = hkdfSync(digest, ikm as Buffer, salt as Buffer, info as Buffer, length);
        return new Uint8Array(key as unknown as Uint8Array);
    }

    public hmac(hash: HashId, key: Uint8Array, data: Uint8Array): Uint8Array {
        const algorithm = hashAlgorithmName(hash);
        const digest = createHmac(algorithm, key).update(data).digest();
        return new Uint8Array(digest);
    }

    public aes128GcmEncrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadEncrypt(AES_128_GCM, key, nonce, plaintext, aad);
    }

    public aes128GcmDecrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadDecrypt(AES_128_GCM, key, nonce, ciphertext, aad);
    }

    public aes256GcmEncrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadEncrypt(AES_256_GCM, key, nonce, plaintext, aad);
    }

    public aes256GcmDecrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadDecrypt(AES_256_GCM, key, nonce, ciphertext, aad);
    }

    public chacha20Poly1305Encrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadEncrypt(CHACHA20_POLY1305, key, nonce, plaintext, aad);
    }

    public chacha20Poly1305Decrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadDecrypt(CHACHA20_POLY1305, key, nonce, ciphertext, aad);
    }

    public x25519GenerateKeyPair(): X25519KeyPair {
        // node:crypto.generateKeyPairSync("x25519") yields KeyObjects; export each
        // as raw DER and strip the fixed prefix to recover the 32-byte coordinate.
        const pair = generateKeyPairSync("x25519", {
            publicKeyEncoding: { type: "spki", format: "der" },
            privateKeyEncoding: { type: "pkcs8", format: "der" },
        });
        const publicKey = new Uint8Array(pair.publicKey).subarray(X25519_PUB_PREFIX.length);
        const secretKey = new Uint8Array(pair.privateKey).subarray(X25519_PRIV_PREFIX.length);
        return { publicKey, secretKey };
    }

    public x25519SharedSecret(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
        // Rehydrate raw 32-byte coordinates into KeyObjects via DER, then DH.
        const priv = x25519PrivateKeyFromRaw(secretKey);
        const pub = x25519PublicKeyFromRaw(peerPublicKey);
        const secret = diffieHellman({ privateKey: priv, publicKey: pub });
        return new Uint8Array(secret);
    }

    public verifySignature(
        scheme: string,
        publicKey: Uint8Array,
        signature: Uint8Array,
        data: Uint8Array,
    ): boolean {
        // Rehydrate the DER SPKI into a KeyObject node:crypto can verify with.
        const key = createPublicKey({ key: Buffer.from(publicKey), format: "der", type: "spki" });
        switch (scheme) {
            case "ecdsa_secp256r1_sha256":
                return createVerify("sha256").update(data).verify(key, signature);
            case "ecdsa_secp384r1_sha384":
                return createVerify("sha384").update(data).verify(key, signature);
            case "rsa_pss_rsae_sha256":
                return createVerify("sha256").update(data).verify(
                    { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
                    signature,
                );
            case "rsa_pss_rsae_sha384":
                return createVerify("sha384").update(data).verify(
                    { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 },
                    signature,
                );
            case "rsa_pkcs1_sha256":
                return createVerify("sha256").update(data).verify(
                    { key, padding: constants.RSA_PKCS1_PADDING },
                    signature,
                );
            default:
                throw new UnsupportedAlgorithmError(`unsupported signature scheme: ${scheme}`);
        }
    }
}

/** Default singleton — the crypto backend higher layers call into. */
export const crypto: CryptoProvider = new NodeCryptoProvider();
