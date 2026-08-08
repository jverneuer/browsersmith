/**
 * Known-answer and property tests for ECDH over NIST named curves
 * (secp256r1 / P-256 and secp384r1 / P-384).
 *
 * Vectors are generated against node:crypto's createECDH as an independent
 * oracle — the provider MUST agree with the platform implementation that the
 * TLS layer ultimately relies on.
 */

import { createECDH, getCurves } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";

const provider = new NodeCryptoProvider();

/** Coerce a node:Buffer / Uint8Array to a standalone Uint8Array for comparison. */
function bytes(b: Uint8Array): Uint8Array {
    return new Uint8Array(b);
}

/**
 * Independent oracle: compute an ECDH shared secret directly via node:crypto,
 * decoupled from the provider under test.
 */
function oracleSharedSecret(
    curve: "secp256r1" | "secp384r1",
    secretKey: Uint8Array,
    peerPublicKey: Uint8Array,
): Uint8Array {
    const ecdh = createECDH(curve === "secp256r1" ? "prime256v1" : "secp384r1");
    ecdh.setPrivateKey(secretKey);
    return new Uint8Array(ecdh.computeSecret(peerPublicKey));
}

describe("ECDH curves are available in node:crypto", () => {
    it("node:crypto supports both NIST curves we need", () => {
        const curves = getCurves();
        expect(curves).toContain("prime256v1");
        expect(curves).toContain("secp384r1");
    });
});

describe("ecdhGenerateKeyPair", () => {
    it("secp256r1: generates a 65-byte uncompressed public key and a 32-byte scalar", () => {
        const kp = provider.ecdhGenerateKeyPair("secp256r1");
        expect(kp.curve).toBe("secp256r1");
        // Uncompressed form: 0x04 || 32-byte x || 32-byte y = 65 bytes.
        expect(kp.publicKey).toHaveLength(65);
        expect(kp.publicKey[0]).toBe(0x04);
        expect(kp.secretKey).toHaveLength(32);
        // Public and secret must differ (they encode different things).
        expect(Buffer.from(kp.publicKey).equals(Buffer.from(kp.secretKey))).toBe(false);
    });

    it("secp384r1: generates a 97-byte uncompressed public key and a 48-byte scalar", () => {
        const kp = provider.ecdhGenerateKeyPair("secp384r1");
        expect(kp.curve).toBe("secp384r1");
        // Uncompressed form: 0x04 || 48-byte x || 48-byte y = 97 bytes.
        expect(kp.publicKey).toHaveLength(97);
        expect(kp.publicKey[0]).toBe(0x04);
        expect(kp.secretKey).toHaveLength(48);
    });

    it("two key pairs generated in succession are almost surely distinct (secp256r1)", () => {
        const a = provider.ecdhGenerateKeyPair("secp256r1");
        const b = provider.ecdhGenerateKeyPair("secp256r1");
        expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(false);
        expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
    });
});

describe("ecdhSharedSecret agrees with node:crypto oracle", () => {
    it("secp256r1: matches the platform oracle for a random key pair", () => {
        const a = provider.ecdhGenerateKeyPair("secp256r1");
        const b = provider.ecdhGenerateKeyPair("secp256r1");
        const ours = provider.ecdhSharedSecret("secp256r1", a.secretKey, b.publicKey);
        const theirs = oracleSharedSecret("secp256r1", a.secretKey, b.publicKey);
        expect(ours).toEqual(theirs);
    });

    it("secp384r1: matches the platform oracle for a random key pair", () => {
        const a = provider.ecdhGenerateKeyPair("secp384r1");
        const b = provider.ecdhGenerateKeyPair("secp384r1");
        const ours = provider.ecdhSharedSecret("secp384r1", a.secretKey, b.publicKey);
        const theirs = oracleSharedSecret("secp384r1", a.secretKey, b.publicKey);
        expect(ours).toEqual(theirs);
    });
});

describe("ECDH DH symmetry (both curves)", () => {
    it("secp256r1: two parties agree on the shared secret", () => {
        const a = provider.ecdhGenerateKeyPair("secp256r1");
        const b = provider.ecdhGenerateKeyPair("secp256r1");
        const ab = provider.ecdhSharedSecret("secp256r1", a.secretKey, b.publicKey);
        const ba = provider.ecdhSharedSecret("secp256r1", b.secretKey, a.publicKey);
        // The shared secret is the x-coordinate: 32 bytes for P-256.
        expect(ab).toHaveLength(32);
        expect(ab).toEqual(ba);
    });

    it("secp384r1: two parties agree on the shared secret", () => {
        const a = provider.ecdhGenerateKeyPair("secp384r1");
        const b = provider.ecdhGenerateKeyPair("secp384r1");
        const ab = provider.ecdhSharedSecret("secp384r1", a.secretKey, b.publicKey);
        const ba = provider.ecdhSharedSecret("secp384r1", b.secretKey, a.publicKey);
        // The shared secret is the x-coordinate: 48 bytes for P-384.
        expect(ab).toHaveLength(48);
        expect(ab).toEqual(ba);
    });

    it("the shared secret is not all-zero for a genuine random key pair (secp256r1)", () => {
        const a = provider.ecdhGenerateKeyPair("secp256r1");
        const b = provider.ecdhGenerateKeyPair("secp256r1");
        const secret = provider.ecdhSharedSecret("secp256r1", a.secretKey, b.publicKey);
        expect(secret.some((byte) => byte !== 0)).toBe(true);
    });

    it("the shared secret is not all-zero for a genuine random key pair (secp384r1)", () => {
        const a = provider.ecdhGenerateKeyPair("secp384r1");
        const b = provider.ecdhGenerateKeyPair("secp384r1");
        const secret = provider.ecdhSharedSecret("secp384r1", a.secretKey, b.publicKey);
        expect(secret.some((byte) => byte !== 0)).toBe(true);
    });
});
