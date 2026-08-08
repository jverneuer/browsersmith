/**
 * {@link CryptoProvider} backed by Node's native `node:crypto` module.
 *
 * Higher layers call the provider methods here, never `node:crypto` directly, so the
 * backend stays replaceable. This is the Node.js adapter for the platform crypto
 * contract — consumers receive it through the Platform, never by importing this
 * class directly.
 */

import {
    randomBytes as nodeRandomBytes,
    createHash,
    createHmac,
    hkdfSync,
    createPublicKey,
    createVerify,
    createECDH,
    createCipheriv,
    constants,
} from "node:crypto";

import {
    AES_128_GCM,
    AES_128_CCM,
    AES_256_GCM,
    CHACHA20_POLY1305,
} from "@browsercore/crypto";
import type {
    EcdhCurve,
    EcdhKeyPair,
    HashId,
    X25519KeyPair,
} from "@browsercore/contracts";
import { UnsupportedAlgorithmError } from "@browsercore/crypto";
import { assertNever } from "@browsercore/crypto";
import { aeadEncrypt, aeadDecrypt } from "./aead.js";
import { NobleX25519Backend } from "@browsercore/crypto";
import type { CryptoProvider } from "@browsercore/contracts";
import type { X25519Backend } from "@browsercore/crypto";

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

export class NodeCryptoProvider implements CryptoProvider {
    constructor(private readonly x25519: X25519Backend = new NobleX25519Backend()) {}

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
        const key = hkdfSync(digest, ikm, salt, info, length);
        return new Uint8Array(key);
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

    public aes128CcmEncrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadEncrypt(AES_128_CCM, key, nonce, plaintext, aad);
    }

    public aes128CcmDecrypt(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
        aad: Uint8Array,
    ): Uint8Array {
        return aeadDecrypt(AES_128_CCM, key, nonce, ciphertext, aad);
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
        // Delegate to the default X25519 backend (noble-curves). The backend
        // applies RFC 7748 §5 clamping internally, removing the DER/ASN.1 bug
        // class that plagued the old node:crypto KeyObject path.
        const secretKey = this.randomBytes(32);
        const publicKey = this.x25519.publicKey(secretKey);
        return { publicKey, secretKey };
    }

    public x25519SharedSecret(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
        // Delegate to the default X25519 backend. The noble-curves backend
        // handles the RFC 7748 §5 degenerate (all-zero) u-coordinate correctly,
        // returning the mandated 32 zero bytes — no special-casing needed.
        return this.x25519.sharedSecret(secretKey, peerPublicKey);
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
            // RSA-PSS salt length MUST equal the hash digest length (RFC 8017 §8.1.1):
            // SHA-256 = 32 bytes, SHA-384 = 48 bytes. node:crypto enforces this.
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

    public ecdhGenerateKeyPair(curve: EcdhCurve): EcdhKeyPair {
        const ecdh = createECDH(ecdhCurveToNode(curve));
        ecdh.generateKeys();
        // getPublicKey() defaults to uncompressed form (0x04 || x || y) — exactly
        // the layout TLS 1.3 KeyShareEntry expects.
        //
        // getPrivateKey() returns a big-endian scalar with leading zero bytes
        // stripped, so it can be shorter than the curve's fixed byte length
        // (e.g. 47 bytes for secp384r1 instead of 48). Left-pad to the curve's
        // canonical length so callers get a fixed-width scalar.
        const scalarLength = curve === "secp256r1" ? 32 : 48;
        const rawScalar = ecdh.getPrivateKey();
        const secretKey = new Uint8Array(scalarLength);
        secretKey.set(rawScalar, scalarLength - rawScalar.length);
        return {
            curve,
            publicKey: new Uint8Array(ecdh.getPublicKey()),
            secretKey,
        };
    }

    public ecdhSharedSecret(curve: EcdhCurve, secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
        const ecdh = createECDH(ecdhCurveToNode(curve));
        ecdh.setPrivateKey(secretKey);
        // computeSecret returns the x-coordinate of the shared point — the raw
        // ECDH output that TLS feeds into the key schedule.
        return new Uint8Array(ecdh.computeSecret(peerPublicKey));
    }

    public aesEcbEncrypt(key: Uint8Array, block: Uint8Array): Uint8Array {
        // QUIC header protection (RFC 9001 §5.4.1) requires AES-ECB on a
        // single 16-byte block. ECB mode takes no IV. Only AES-128 (16-byte
        // key) and AES-256 (32-byte key) are used by QUIC.
        const algorithm = key.length === 16 ? "aes-128-ecb" : "aes-256-ecb";
        const cipher = createCipheriv(algorithm, key, new Uint8Array(0));
        cipher.setAutoPadding(false);
        const out = new Uint8Array(cipher.update(block));
        const final = new Uint8Array(cipher.final());
        const result = new Uint8Array(out.length + final.length);
        result.set(out, 0);
        result.set(final, out.length);
        return result;
    }
}

/** Map a branded {@link EcdhCurve} to the node:crypto curve name. */
function ecdhCurveToNode(curve: EcdhCurve): string {
    switch (curve) {
        case "secp256r1":
            return "prime256v1";
        case "secp384r1":
            return "secp384r1";
        default:
            return assertNever(curve);
    }
}

/** Default Node.js crypto adapter — composed into the Platform in platform/index.ts. */
export const nodeCryptoProvider: CryptoProvider = new NodeCryptoProvider();
