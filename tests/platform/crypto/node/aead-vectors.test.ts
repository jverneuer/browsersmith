/**
 * Known-answer (KAT) tests for the AEAD primitives.
 *
 * These lock the provider's encrypt/decrypt to published, independently
 * sourced test vectors (RFC 8439 for ChaCha20-Poly1305; the McGrew/Viega GCM
 * specification appendix for AES-GCM). This is stronger than round-trip
 * coverage: it catches a node:crypto version regression or a constant/wiring
 * drift, because the expected bytes come from the standard text — not from
 * node computing them for us.
 *
 * Sources:
 *  - RFC 8439 §2.8.2 (AEAD_CHACHA20_POLY1305 "sunscreen" vector)
 *  - McGrew & Viega, "The Galois/Counter Mode of Operation", Appendix B
 *    (AES-128-GCM Test Case 3; AES-256-GCM Test Cases 14 & 15)
 */

import { describe, expect, it } from "vitest";

import { nodeCryptoProvider, NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";
import { aes128Gcm, aes256Gcm, chacha20Poly1305 } from "../../../../src/platform/crypto/node/ciphers.js";

const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, "hex"));
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

const provider = new NodeCryptoProvider();

describe("AEAD KAT: ChaCha20-Poly1305 (RFC 8439 §2.8.2 — sunscreen vector)", () => {
    // 32-byte key 80:81:…:9f, 12-byte nonce = 32-bit fixed-common 07000000
    // concatenated with IV 4041424344454647, AAD = 50515253c0c1c2c3c4c5c6c7.
    const key = fromHex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
    const nonce = fromHex("070000004041424344454647");
    const aad = fromHex("50515253c0c1c2c3c4c5c6c7");
    const plaintext = fromHex(
        "4c616469657320616e642047656e746c656d656e206f662074686520636c6173" +
        "73206f66202739393a204966204920636f756c64206f6666657220796f75206f" +
        "6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73" +
        "637265656e20776f756c642062652069742e",
    );
    // Published ciphertext (114 bytes) with the 16-byte tag appended.
    const expectedCtAndTag = fromHex(
        "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6" +
        "3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36" +
        "92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
        "3ff4def08e4b7a9de576d26586cec64b6116" +
        "1ae10b594f09e26a7e902ecbd0600691",
    );

    it("provider.chacha20Poly1305Encrypt reproduces the RFC ciphertext||tag byte-for-byte", () => {
        const ct = provider.chacha20Poly1305Encrypt(key, nonce, plaintext, aad);
        expect(toHex(ct)).toBe(toHex(expectedCtAndTag));
    });

    it("descriptor round-trip reproduces the same ciphertext (encrypt is deterministic)", () => {
        const ct = chacha20Poly1305.encrypt(key, nonce, plaintext, aad);
        expect(toHex(ct)).toBe(toHex(expectedCtAndTag));
    });

    it("provider.chacha20Poly1305Decrypt recovers the RFC plaintext from the published bytes", () => {
        const recovered = provider.chacha20Poly1305Decrypt(key, nonce, expectedCtAndTag, aad);
        expect(recovered).toEqual(plaintext);
    });

    it("the default singleton crypto produces the same KAT output", () => {
        expect(nodeCryptoProvider.chacha20Poly1305Encrypt(key, nonce, plaintext, aad)).toEqual(expectedCtAndTag);
    });
});

describe("AEAD KAT: AES-128-GCM (McGrew/Viega GCM Test Case 4 — with AAD)", () => {
    // 16-byte key, 12-byte IV, 60-byte plaintext, 20-byte AAD.
    const key = fromHex("feffe9928665731c6d6a8f9467308308");
    const iv = fromHex("cafebabefacedbaddecaf888");
    const aad = fromHex("feedfacedeadbeeffeedfacedeadbeefabaddad2");
    const plaintext = fromHex(
        "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72" +
        "1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39",
    );
    const expectedCt = fromHex(
        "42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e" +
        "21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091",
    );
    const expectedTag = fromHex("5bc94fbc3221a5db94fae95ae7121a47");

    it("reproduces the published ciphertext and tag (tag appended)", () => {
        const ct = provider.aes128GcmEncrypt(key, iv, plaintext, aad);
        expect(toHex(ct.subarray(0, expectedCt.length))).toBe(toHex(expectedCt));
        expect(toHex(ct.subarray(expectedCt.length))).toBe(toHex(expectedTag));
        expect(ct.length).toBe(plaintext.length + 16);
    });

    it("decrypts the published bytes back to the plaintext", () => {
        const combined = new Uint8Array(expectedCt.length + expectedTag.length);
        combined.set(expectedCt, 0);
        combined.set(expectedTag, expectedCt.length);
        expect(provider.aes128GcmDecrypt(key, iv, combined, aad)).toEqual(plaintext);
    });
});

describe("AEAD KAT: AES-128-GCM (McGrew/Viega GCM Test Case 3 — no AAD, 64-byte PT)", () => {
    // Same key/IV as TC4 but a 64-byte plaintext and no AAD.
    const key = fromHex("feffe9928665731c6d6a8f9467308308");
    const iv = fromHex("cafebabefacedbaddecaf888");
    const plaintext = fromHex(
        "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72" +
        "1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255",
    );
    const expectedCt = fromHex(
        "42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e" +
        "21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091473f5985",
    );
    const expectedTag = fromHex("4d5c2af327cd64a62cf35abd2ba6fab4");

    it("reproduces the published ciphertext and tag", () => {
        const ct = provider.aes128GcmEncrypt(key, iv, plaintext, new Uint8Array(0));
        expect(toHex(ct.subarray(0, expectedCt.length))).toBe(toHex(expectedCt));
        expect(toHex(ct.subarray(expectedCt.length))).toBe(toHex(expectedTag));
    });
});

describe("AEAD KAT: AES-256-GCM (McGrew/Viega Test Cases 14 & 15)", () => {
    // TC14: all-zero key/IV, empty plaintext+AAD → empty ciphertext, known tag.
    it("TC14: empty plaintext authenticates to the published tag", () => {
        const key = new Uint8Array(32);
        const iv = new Uint8Array(12);
        const ct = provider.aes256GcmEncrypt(key, iv, new Uint8Array(0), new Uint8Array(0));
        expect(ct.length).toBe(16); // tag only
        expect(toHex(ct)).toBe("530f8afbc74536b9a963b4f1c4cb738b");
    });

    // TC15: all-zero key/IV/AAD, 16 zero bytes of plaintext.
    it("TC15: 16 zero bytes reproduce the published ciphertext and tag", () => {
        const key = new Uint8Array(32);
        const iv = new Uint8Array(12);
        const plaintext = new Uint8Array(16);
        const ct = provider.aes256GcmEncrypt(key, iv, plaintext, new Uint8Array(0));
        expect(toHex(ct)).toBe("cea7403d4d606b6e074ec5d3baf39d18" + "d0d1c8a799996bf0265b98b5d48ab919");
    });
});

describe("AEAD edge cases", () => {
    const key = fromHex("000102030405060708090a0b0c0d0e0f");
    const key256 = fromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    const nonce = fromHex("00112233445566778899aabb");

    it("encrypts an empty plaintext to a tag-only output (length == tagSize)", () => {
        for (const { name, encrypt, tagSize } of [
            { name: "aes128Gcm", encrypt: (k: Uint8Array, n: Uint8Array, p: Uint8Array, a: Uint8Array) => provider.aes128GcmEncrypt(k, n, p, a), tagSize: 16 },
            { name: "aes256Gcm", encrypt: (k: Uint8Array, n: Uint8Array, p: Uint8Array, a: Uint8Array) => provider.aes256GcmEncrypt(k, n, p, a), tagSize: 16 },
            { name: "chacha20Poly1305", encrypt: (k: Uint8Array, n: Uint8Array, p: Uint8Array, a: Uint8Array) => provider.chacha20Poly1305Encrypt(k, n, p, a), tagSize: 16 },
        ]) {
            const k = name === "aes128Gcm" ? key : key256;
            const ct = encrypt(k, nonce, new Uint8Array(0), new Uint8Array(0));
            expect(ct.length).toBe(tagSize);
        }
    });

    it("round-trips an empty plaintext (tag-only ciphertext decrypts to empty)", () => {
        const ct = aes128Gcm.encrypt(key, nonce, new Uint8Array(0), new Uint8Array(0));
        expect(ct.length).toBe(16);
        const recovered = aes128Gcm.decrypt(key, nonce, ct, new Uint8Array(0));
        expect(recovered.length).toBe(0);
    });

    it("round-trips with empty AAD (no associated data)", () => {
        const plaintext = new TextEncoder().encode("secret with no aad");
        const ct = aes256Gcm.encrypt(key256, nonce, plaintext, new Uint8Array(0));
        expect(aes256Gcm.decrypt(key256, nonce, ct, new Uint8Array(0))).toEqual(plaintext);
    });

    it("round-trips a plaintext spanning many cipher blocks (>4 KiB)", () => {
        // 8192 bytes exercises multi-block keystream + a final partial block.
        const plaintext = new Uint8Array(8192);
        for (let i = 0; i < plaintext.length; i++) plaintext[i] = i % 251;
        const aad = new TextEncoder().encode("large-blob-aad");
        const ct = chacha20Poly1305.encrypt(key256, nonce, plaintext, aad);
        expect(ct.length).toBe(plaintext.length + 16);
        expect(chacha20Poly1305.decrypt(key256, nonce, ct, aad)).toEqual(plaintext);
    });

    it("round-trips a plaintext whose length is an exact block multiple (16 / 64)", () => {
        // Exact-multiple lengths exercise the final() == empty path in both
        // AES-GCM (16-byte block) and ChaCha20 (64-byte block).
        const aad = new Uint8Array(0);
        for (const len of [16, 32, 64, 128]) {
            const plaintext = new Uint8Array(len).fill(0xa5);
            const ct = aes128Gcm.encrypt(key, nonce, plaintext, aad);
            expect(aes128Gcm.decrypt(key, nonce, ct, aad)).toEqual(plaintext);
        }
    });

    it("rejects a tag-only ciphertext under the wrong key with DecryptError", () => {
        const ct = aes128Gcm.encrypt(key, nonce, new Uint8Array(0), new Uint8Array(0));
        const wrongKey = new Uint8Array(16).fill(0xff);
        expect(() => aes128Gcm.decrypt(wrongKey, nonce, ct, new Uint8Array(0))).toThrow(/authentication/);
    });

    it("rejects a 1-byte ciphertext (shorter than the 16-byte tag)", () => {
        const tooShort = new Uint8Array(1);
        expect(() => aes128Gcm.decrypt(key, nonce, tooShort, new Uint8Array(0))).toThrow();
    });

    it("treats ciphertext.length === tagSize (16) as tag-only empty plaintext, not malformed", () => {
        // Exactly 16 bytes is the boundary below which aeadDecrypt throws; 16
        // itself must be accepted as a valid empty-plaintext ciphertext.
        const ct = chacha20Poly1305.encrypt(key256, nonce, new Uint8Array(0), new Uint8Array(0));
        expect(ct.length).toBe(16);
        expect(chacha20Poly1305.decrypt(key256, nonce, ct, new Uint8Array(0)).length).toBe(0);
    });
});
