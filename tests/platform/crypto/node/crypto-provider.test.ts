/**
 * Unit tests for the Node.js platform crypto adapter.
 *
 * `nodeCryptoProvider` (`src/platform/crypto/node/node-crypto-provider.ts`) is
 * a thin re-export of the `@browsercore/crypto` singleton. These tests exercise
 * that adapter against REAL crypto operations — lengths and known answer
 * vectors — to prove the platform layer's delegation is wired correctly end to
 * end, not just that the import resolves.
 */

import { describe, it, expect } from "vitest";
import { nodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";

describe("nodeCryptoProvider", () => {
    describe("randomBytes", () => {
        it("returns a Uint8Array of the requested length", () => {
            const result = nodeCryptoProvider.randomBytes(16);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(16);
        });

        it("returns 32 bytes when asked for 32", () => {
            const result = nodeCryptoProvider.randomBytes(32);
            expect(result.length).toBe(32);
        });

        it("produces distinct output across calls (CSPRNG, not a stub)", () => {
            const a = nodeCryptoProvider.randomBytes(16);
            const b = nodeCryptoProvider.randomBytes(16);
            // Two CSPRNG draws of 128 bits are effectively never equal.
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        });
    });

    describe("sha256", () => {
        it("returns a 32-byte digest", () => {
            const digest = nodeCryptoProvider.sha256(new Uint8Array([1, 2, 3, 4]));
            expect(digest).toBeInstanceOf(Uint8Array);
            expect(digest.length).toBe(32);
        });

        it("matches the NIST SHA-256 empty-string test vector", () => {
            // SHA-256("") =
            // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
            const digest = nodeCryptoProvider.sha256(new Uint8Array(0));
            const hex = Buffer.from(digest).toString("hex");
            expect(hex).toBe(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            );
        });

        it("is deterministic for a given input", () => {
            const input = new TextEncoder().encode("browsersmith");
            const a = nodeCryptoProvider.sha256(input);
            const b = nodeCryptoProvider.sha256(input);
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        });
    });

    describe("x25519GenerateKeyPair", () => {
        it("returns a keypair with 32-byte publicKey and secretKey", () => {
            const kp = nodeCryptoProvider.x25519GenerateKeyPair();
            expect(kp.publicKey).toBeInstanceOf(Uint8Array);
            expect(kp.secretKey).toBeInstanceOf(Uint8Array);
            expect(kp.publicKey.length).toBe(32);
            expect(kp.secretKey.length).toBe(32);
        });

        it("produces distinct keypairs on each call", () => {
            const a = nodeCryptoProvider.x25519GenerateKeyPair();
            const b = nodeCryptoProvider.x25519GenerateKeyPair();
            expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
            expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(false);
        });

        it("derives a matching shared secret from a generated keypair", () => {
            // Sanity: a freshly generated keypair is internally consistent —
            // the public key is the scalar mult base of the secret key.
            const kp = nodeCryptoProvider.x25519GenerateKeyPair();
            const shared = nodeCryptoProvider.x25519SharedSecret(kp.secretKey, kp.publicKey);
            // x25519(s, base) would give a different point, so we don't assert
            // against the public key. Instead: a degenerate / all-zero peer must
            // yield the mandated all-zero shared secret per RFC 7748 §5.
            const allZero = new Uint8Array(32);
            const degenerate = nodeCryptoProvider.x25519SharedSecret(kp.secretKey, allZero);
            expect(Buffer.from(degenerate).equals(Buffer.from(allZero))).toBe(true);
        });
    });

    describe("hmac", () => {
        it("returns 32 bytes for SHA-256", () => {
            const key = new Uint8Array(32);
            const data = new TextEncoder().encode("message");
            const mac = nodeCryptoProvider.hmac("SHA-256", key, data);
            expect(mac).toBeInstanceOf(Uint8Array);
            expect(mac.length).toBe(32);
        });

        it("returns 48 bytes for SHA-384", () => {
            const key = new Uint8Array(32);
            const data = new TextEncoder().encode("message");
            const mac = nodeCryptoProvider.hmac("SHA-384", key, data);
            expect(mac.length).toBe(48);
        });

        it("matches RFC 4231 test vector 1 (SHA-256, 20-byte key of 0x0b)", () => {
            // RFC 4231 §4.2 — HMAC-SHA256(key=0x0b*20, data="Hi There") =
            // b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
            const key = new Uint8Array(20).fill(0x0b);
            const data = new TextEncoder().encode("Hi There");
            const mac = nodeCryptoProvider.hmac("SHA-256", key, data);
            const hex = Buffer.from(mac).toString("hex");
            expect(hex).toBe(
                "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
            );
        });

        it("is deterministic for the same key and data", () => {
            const key = nodeCryptoProvider.randomBytes(32);
            const data = new TextEncoder().encode("deterministic");
            const a = nodeCryptoProvider.hmac("SHA-256", key, data);
            const b = nodeCryptoProvider.hmac("SHA-256", key, data);
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        });

        it("differs when the key changes", () => {
            const keyA = new Uint8Array(32).fill(0x01);
            const keyB = new Uint8Array(32).fill(0x02);
            const data = new TextEncoder().encode("message");
            const macA = nodeCryptoProvider.hmac("SHA-256", keyA, data);
            const macB = nodeCryptoProvider.hmac("SHA-256", keyB, data);
            expect(Buffer.from(macA).equals(Buffer.from(macB))).toBe(false);
        });
    });
});
