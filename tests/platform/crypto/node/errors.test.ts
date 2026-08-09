/**
 * Tests for the typed error hierarchy and ensureCryptoError normalization.
 *
 * Adds coverage the existing suite omits: DecryptError.cause propagation from
 * a *real* authentication failure (not just a synthetic constructor call),
 * error instanceof relationships, and the message format for each type.
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";
import {
    CryptoError,
    DecryptError,
    UnsupportedAlgorithmError,
    ensureCryptoError,
} from "@browsercore/crypto";
import { AES_128_GCM, AES_256_GCM, CHACHA20_POLY1305 } from "@browsercore/crypto";

const provider = new NodeCryptoProvider();

describe("DecryptError carries the underlying node error on a real auth failure", () => {
    it("wraps node:crypto's auth-failure Error as its `cause`", () => {
        const key = new Uint8Array(randomBytes(16));
        const nonce = new Uint8Array(randomBytes(12));
        const aad = new TextEncoder().encode("aad");
        const ct = provider.aes128GcmEncrypt(key, nonce, new TextEncoder().encode("pt"), aad);
        // Flip a ciphertext body byte (not just the tag) — failure surfaces in final().
        ct[0]! ^= 0xff;
        let caught: unknown;
        try {
            provider.aes128GcmDecrypt(key, nonce, ct, aad);
            expect.fail("expected DecryptError");
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(DecryptError);
        const err = caught as DecryptError;
        expect(err.algorithm).toBe(AES_128_GCM);
        expect(err.cause).toBeInstanceOf(Error);
        // node:crypto's auth-failure message mentions authentication.
        expect(err.cause!.message.toLowerCase()).toContain("authentic");
        expect(err.message).toContain(AES_128_GCM);
        expect(err.message).toContain("authentication mismatch or corrupt input");
    });

    it("preserves the cause for every cipher on a wrong-key decryption", () => {
        for (const [id, enc, dec] of [
            [AES_128_GCM, (k: Uint8Array, n: Uint8Array, p: Uint8Array) => provider.aes128GcmEncrypt(k, n, p, new Uint8Array(0)), (k: Uint8Array, n: Uint8Array, c: Uint8Array) => provider.aes128GcmDecrypt(k, n, c, new Uint8Array(0))],
            [AES_256_GCM, (k: Uint8Array, n: Uint8Array, p: Uint8Array) => provider.aes256GcmEncrypt(k, n, p, new Uint8Array(0)), (k: Uint8Array, n: Uint8Array, c: Uint8Array) => provider.aes256GcmDecrypt(k, n, c, new Uint8Array(0))],
            [CHACHA20_POLY1305, (k: Uint8Array, n: Uint8Array, p: Uint8Array) => provider.chacha20Poly1305Encrypt(k, n, p, new Uint8Array(0)), (k: Uint8Array, n: Uint8Array, c: Uint8Array) => provider.chacha20Poly1305Decrypt(k, n, c, new Uint8Array(0))],
        ] as [string, (k: Uint8Array, n: Uint8Array, p: Uint8Array) => Uint8Array, (k: Uint8Array, n: Uint8Array, c: Uint8Array) => Uint8Array][]) {
            const keyLen = id === AES_128_GCM ? 16 : 32;
            const key = new Uint8Array(randomBytes(keyLen));
            const wrongKey = new Uint8Array(randomBytes(keyLen));
            const nonce = new Uint8Array(randomBytes(12));
            const ct = enc(key, nonce, new TextEncoder().encode("payload"));
            let caught: unknown;
            try {
                dec(wrongKey, nonce, ct);
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeInstanceOf(DecryptError);
            expect((caught as DecryptError).algorithm).toBe(id);
            expect((caught as DecryptError).cause).toBeInstanceOf(Error);
        }
    });
});

describe("error class hierarchy and instanceof relationships", () => {
    it("CryptoError is an Error with kind, name, algorithm, cause", () => {
        const cause = new Error("root cause");
        const err = new CryptoError("something failed", "SHA-256", { cause });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(CryptoError);
        expect(err.kind).toBe("CryptoError");
        expect(err.name).toBe("CryptoError");
        expect(err.algorithm).toBe("SHA-256");
        expect(err.cause).toBe(cause);
        expect(err.message).toBe("something failed");
    });

    it("CryptoError allows omitting algorithm and cause", () => {
        const err = new CryptoError("bare");
        expect(err.algorithm).toBeUndefined();
        expect(err.cause).toBeUndefined();
        expect(err.message).toBe("bare");
    });

    it("DecryptError is an Error with the algorithm baked into the message", () => {
        const err = new DecryptError(CHACHA20_POLY1305);
        expect(err).toBeInstanceOf(Error);
        expect(err.kind).toBe("DecryptError");
        expect(err.name).toBe("DecryptError");
        expect(err.algorithm).toBe(CHACHA20_POLY1305);
        expect(err.message).toContain(CHACHA20_POLY1305);
    });

    it("UnsupportedAlgorithmError is an Error that names the algorithm in its message", () => {
        const err = new UnsupportedAlgorithmError("BogusScheme");
        expect(err).toBeInstanceOf(Error);
        expect(err.kind).toBe("UnsupportedAlgorithmError");
        expect(err.name).toBe("UnsupportedAlgorithmError");
        expect(err.algorithm).toBe("BogusScheme");
        expect(err.message).toBe("Unsupported crypto algorithm: BogusScheme");
    });

    it("verifySignature throws UnsupportedAlgorithmError (instanceof) for an unknown scheme", () => {
        // Use a real RSA SPKI so createPublicKey succeeds and we reach the switch default.
        const { publicKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "der" },
        });
        expect(() =>
            provider.verifySignature("eddsa_unknown", new Uint8Array(publicKey), new Uint8Array(0), new Uint8Array(0)),
        ).toThrow(UnsupportedAlgorithmError);
    });
});

describe("ensureCryptoError normalization", () => {
    it("passes through an existing CryptoError unchanged", () => {
        const err = new CryptoError("already typed", "SHA-256");
        expect(ensureCryptoError(err, "SHA-256")).toBe(err);
    });

    it("wraps a plain Error as a CryptoError with the original as cause", () => {
        const root = new Error("boom");
        const wrapped = ensureCryptoError(root, "HKDF");
        expect(wrapped).toBeInstanceOf(CryptoError);
        expect(wrapped.algorithm).toBe("HKDF");
        expect(wrapped.cause).toBe(root);
        expect(wrapped.message).toBe("boom");
    });

    it("wraps a string as a CryptoError", () => {
        const wrapped = ensureCryptoError("string failure", "HMAC");
        expect(wrapped).toBeInstanceOf(CryptoError);
        expect(wrapped.message).toBe("string failure");
        expect(wrapped.algorithm).toBe("HMAC");
    });

    it("wraps a non-string non-Error value with a generic message", () => {
        expect(ensureCryptoError(42).message).toBe("unknown crypto error");
        expect(ensureCryptoError(null).message).toBe("unknown crypto error");
        expect(ensureCryptoError(undefined).message).toBe("unknown crypto error");
    });

    it("omits the algorithm when none is provided", () => {
        expect(ensureCryptoError(new Error("x")).algorithm).toBeUndefined();
    });

    // DecryptError and UnsupportedAlgorithmError extend CryptoError, so
    // ensureCryptoError must pass them through UNCHANGED — same instance and
    // with their original `kind` preserved (no re-wrapping that loses kind).
    it("ensureCryptoError passes through DecryptError and UnsupportedAlgorithmError unchanged", () => {
        const decrypt = new DecryptError(AES_128_GCM, { cause: new Error("root") });
        const decryptOut = ensureCryptoError(decrypt, "ignored-algorithm");
        expect(decryptOut).toBe(decrypt); // same instance — not re-wrapped
        expect(decryptOut).toBeInstanceOf(CryptoError); // now a CryptoError subclass
        expect(decryptOut.kind).toBe("DecryptError"); // kind preserved

        const unsupported = new UnsupportedAlgorithmError("BogusScheme");
        const unsupportedOut = ensureCryptoError(unsupported, "ignored-algorithm");
        expect(unsupportedOut).toBe(unsupported); // same instance — not re-wrapped
        expect(unsupportedOut).toBeInstanceOf(CryptoError); // now a CryptoError subclass
        expect(unsupportedOut.kind).toBe("UnsupportedAlgorithmError"); // kind preserved
    });
});
