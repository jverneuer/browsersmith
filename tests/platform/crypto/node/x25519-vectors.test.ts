/**
 * Known-answer and property tests for X25519 (RFC 7748).
 *
 * crypto.test.ts already covers the 1,000-iteration scalar-mult vector; this
 * file adds the two single-shot §5.2 scalar-multipliers, the §6.1
 * Diffie-Hellman vector (including deriving each party's public key from
 * their private scalar against the u=9 base point), and small-order /
 * low-entropy edge behavior.
 */

import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";

const provider = new NodeCryptoProvider();
const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, "hex"));

/** The X25519 base point u=9, encoded little-endian as 32 bytes. */
const BASE_POINT_9: Uint8Array = (() => {
    const u = new Uint8Array(32);
    u[0] = 9;
    return u;
})();

describe("RFC 7748 §5.2 X25519 scalar-multiplication vectors", () => {
    it("Vector 1: matches the published output u-coordinate", () => {
        const scalar = fromHex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
        const u = fromHex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c");
        const expected = fromHex("c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552");
        expect(provider.x25519SharedSecret(scalar, u)).toEqual(expected);
    });

    it("Vector 2: matches the published output u-coordinate", () => {
        const scalar = fromHex("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d");
        const u = fromHex("e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493");
        const expected = fromHex("95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957");
        expect(provider.x25519SharedSecret(scalar, u)).toEqual(expected);
    });
});

describe("RFC 7748 §6.1 X25519 Diffie-Hellman vector", () => {
    const alicePriv = fromHex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
    const alicePub = fromHex("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
    const bobPriv = fromHex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
    const bobPub = fromHex("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
    const sharedK = fromHex("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742");

    it("Alice's public key is X25519(a, 9) — the published value", () => {
        expect(provider.x25519SharedSecret(alicePriv, BASE_POINT_9)).toEqual(alicePub);
    });

    it("Bob's public key is X25519(b, 9) — the published value", () => {
        expect(provider.x25519SharedSecret(bobPriv, BASE_POINT_9)).toEqual(bobPub);
    });

    it("X25519(a, K_B) === the published shared secret K", () => {
        expect(provider.x25519SharedSecret(alicePriv, bobPub)).toEqual(sharedK);
    });

    it("X25519(b, K_A) === the published shared secret K (DH symmetry)", () => {
        expect(provider.x25519SharedSecret(bobPriv, alicePub)).toEqual(sharedK);
    });
});

describe("X25519 properties", () => {
    it("generateKeyPair yields keys whose DH with the base point matches the derived public key", () => {
        // Sanity: the provider's "public key" is exactly X25519(secret, 9).
        const { publicKey, secretKey } = provider.x25519GenerateKeyPair();
        expect(provider.x25519SharedSecret(secretKey, BASE_POINT_9)).toEqual(publicKey);
    });

    it("two independent key pairs agree on the shared secret (DH symmetry, randomized)", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        const ab = provider.x25519SharedSecret(a.secretKey, b.publicKey);
        const ba = provider.x25519SharedSecret(b.secretKey, a.publicKey);
        expect(ab).toHaveLength(32);
        expect(ab).toEqual(ba);
    });

    it("two distinct key pairs almost surely derive distinct shared secrets", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        const c = provider.x25519GenerateKeyPair();
        const ab = provider.x25519SharedSecret(a.secretKey, b.publicKey);
        const ac = provider.x25519SharedSecret(a.secretKey, c.publicKey);
        expect(ab).not.toEqual(ac);
    });

    it("the shared secret is not all-zero for a genuine random key pair", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        const secret = provider.x25519SharedSecret(a.secretKey, b.publicKey);
        expect(secret.some((byte) => byte !== 0)).toBe(true);
    });

    it("two key pairs generated in succession are almost surely distinct", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(false);
        expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
    });
});

describe("RFC 7748 §5 degenerate / small-order u-coordinates", () => {
    // A degenerate (small-order) u-coordinate MUST yield the all-zero shared
    // secret rather than aborting. Node's OpenSSL rejects these inputs outright
    // (ERR_OSSL_FAILED_DURING_DERIVATION); the provider converts that failure
    // into the RFC-mandated 32 zero bytes. The all-zero u-coordinate (u = 0,
    // the identity element representation) is the canonical degenerate input.
    const ZERO = new Uint8Array(32);

    it("returns 32 zero bytes for the all-zero u-coordinate (no throw)", () => {
        const { secretKey } = provider.x25519GenerateKeyPair();
        const secret = provider.x25519SharedSecret(secretKey, ZERO);
        expect(secret).toHaveLength(32);
        expect(secret).toEqual(new Uint8Array(32));
    });

    it("the all-zero result is stable across distinct secret scalars", () => {
        const expected = new Uint8Array(32);
        for (let i = 0; i < 8; i++) {
            const { secretKey } = provider.x25519GenerateKeyPair();
            // Distinct scalars guarantee we're hitting the degenerate path, not
            // accidentally reusing the same key material.
            expect(provider.x25519SharedSecret(secretKey, ZERO)).toEqual(expected);
        }
    });

    it("a genuine (non-degenerate) peer still yields a non-zero secret", () => {
        // Regression guard: the degenerate-input fix must not mask real results.
        const { secretKey } = provider.x25519GenerateKeyPair();
        const { publicKey } = provider.x25519GenerateKeyPair();
        const secret = provider.x25519SharedSecret(secretKey, publicKey);
        expect(secret).toHaveLength(32);
        expect(secret.some((b) => b !== 0)).toBe(true);
    });

    it("a malformed (wrong-length) peer key yields the all-zero shared secret", () => {
        // The pure-TypeScript noble-curves backend treats a wrong-length
        // u-coordinate as a small-order input and returns the RFC 7748 §5-mandated
        // all-zero shared secret, rather than throwing on ASN.1 rehydration as
        // the old node:crypto path did. This is safe: a malformed key derives no
        // usable shared secret, so the handshake cannot succeed with a bogus peer.
        const { secretKey } = provider.x25519GenerateKeyPair();
        const malformed = new Uint8Array(31);
        const secret = provider.x25519SharedSecret(secretKey, malformed);
        expect(secret).toHaveLength(32);
        expect(secret).toEqual(new Uint8Array(32));
    });
});
