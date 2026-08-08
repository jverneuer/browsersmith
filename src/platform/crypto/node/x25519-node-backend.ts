/**
 * node:crypto-backed X25519 scalar multiplication.
 *
 * Delegates all ASN.1 (PKCS#8 / SPKI DER wrapping) to fixed RFC 8410 prefixes
 * so the OpenSSL implementation owns the curve arithmetic. This is the tested
 * alternative to the noble-curves backend — it trades the dependency for a
 * double-clamping suspicion documented where it matters.
 *
 * If `src/x25519/rfc8410.ts` exists (a parallel task), import
 * `rawPrivateToPkcs8` / `rawPublicToSpki` from there so this file holds ZERO
 * hardcoded DER bytes. Until then, the conversions live inline below.
 */

import {
    diffieHellman,
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
} from "node:crypto";

/**
 * The X25519 scalar-multiplication backend contract. Higher layers depend on
 * this interface — never on a concrete backend — so the implementation is
 * replaceable (noble-curves, WebCrypto, HSM).
 */
export interface X25519Backend {
    /**
     * Compute the X25519 shared secret between the raw 32-byte private scalar
     * `priv` and the raw 32-byte public u-coordinate `pub`. Returns 32 bytes,
     * or 32 zero bytes for degenerate (small-order) u-coordinates.
     */
    sharedSecret(priv: Uint8Array, pub: Uint8Array): Uint8Array;

    /** Generate an X25519 key pair (32-byte keys). */
    generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
}

// ---------------------------------------------------------------------------
// RFC 8410 DER prefixes (inline — replaced by ./rfc8410.ts once available).
// ---------------------------------------------------------------------------

/**
 * PKCS#8 prefix for an X25519 private key — the DER encoding up to (but not
 * including) the 32-byte raw scalar:
 *
 *   30 2e       SEQUENCE (46 bytes)
 *     02 01 00    INTEGER (version = 0)
 *     30 05       SEQUENCE (AlgorithmIdentifier, 5 bytes)
 *       06 03 2b 65 6e  OID 1.3.101.110 (X25519)
 *     04 22       OCTET STRING (34 bytes — the private-key wrapper)
 *     04 20       OCTET STRING (32 bytes — the raw scalar follows)
 */
const PKCS8_PREFIX: Uint8Array = new Uint8Array(
    Buffer.from("302e020100300506032b656e04220420", "hex"),
);

/**
 * SPKI prefix for an X25519 public key — the DER encoding up to (but not
 * including) the 32-byte raw u-coordinate:
 *
 *   30 2a       SEQUENCE (42 bytes)
 *     30 05       SEQUENCE (AlgorithmIdentifier, 5 bytes)
 *       06 03 2b 65 6e  OID 1.3.101.110 (X25519)
 *     03 21 00    BIT STRING (33 bytes, 0 unused bits — the raw key follows)
 */
const SPKI_PREFIX: Uint8Array = new Uint8Array(
    Buffer.from("302a300506032b656e032100", "hex"),
);

/** Wrap a raw 32-byte X25519 private scalar as a PKCS#8 DER blob. */
function rawPrivateToPkcs8(priv: Uint8Array): Uint8Array {
    const der = new Uint8Array(PKCS8_PREFIX.length + priv.length);
    der.set(PKCS8_PREFIX, 0);
    der.set(priv, PKCS8_PREFIX.length);
    return der;
}

/** Wrap a raw 32-byte X25519 public u-coordinate as a SPKI DER blob. */
function rawPublicToSpki(pub: Uint8Array): Uint8Array {
    const der = new Uint8Array(SPKI_PREFIX.length + pub.length);
    der.set(SPKI_PREFIX, 0);
    der.set(pub, SPKI_PREFIX.length);
    return der;
}

// ---------------------------------------------------------------------------
// Backend implementation.
// ---------------------------------------------------------------------------

export class NodeX25519Backend implements X25519Backend {
    public sharedSecret(priv: Uint8Array, pub: Uint8Array): Uint8Array {
        try {
            const secret = diffieHellman({
                privateKey: createPrivateKey({
                    key: Buffer.from(rawPrivateToPkcs8(priv)),
                    format: "der",
                    type: "pkcs8",
                }),
                publicKey: createPublicKey({
                    key: Buffer.from(rawPublicToSpki(pub)),
                    format: "der",
                    type: "spki",
                }),
            });
            return new Uint8Array(secret);
        } catch (e) {
            // RFC 7748 §5: a degenerate / small-order u-coordinate (e.g. the
            // all-zero input) MUST yield the all-zero shared secret. OpenSSL
            // rejects these inputs with ERR_OSSL_FAILED_DURING_DERIVATION;
            // convert it to 32 zero bytes. Any other error (malformed key,
            // genuine programming error) is re-thrown so it is not masked.
            if (
                e instanceof Error &&
                (e as Error & { code?: string }).code === "ERR_OSSL_FAILED_DURING_DERIVATION"
            ) {
                return new Uint8Array(32);
            }
            throw e;
        }
    }

    public generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
        const pair = generateKeyPairSync("x25519", {
            publicKeyEncoding: { type: "spki", format: "der" },
            privateKeyEncoding: { type: "pkcs8", format: "der" },
        });
        const publicKey = new Uint8Array(pair.publicKey).subarray(SPKI_PREFIX.length);
        const secretKey = new Uint8Array(pair.privateKey).subarray(PKCS8_PREFIX.length);
        return { publicKey, secretKey };
    }
}
