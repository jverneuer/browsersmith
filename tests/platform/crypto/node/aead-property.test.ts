/**
 * Property-style tests for AEAD confidentiality and integrity.
 *
 * Coverage already hits 100% via round-trips + a single tamper; these tests
 * assert the *cryptographic* properties that make the primitives safe, rather
 * than line coverage: deterministic encryption, nonce/key/plaintext/AAD
 * sensitivity, single-bit tamper detection at every position, nonce-reuse
 * keystream leakage, and randomized round-trips over many sizes.
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";
import { aes128Gcm, aes256Gcm, chacha20Poly1305, type AeadCipher } from "../../../../src/platform/crypto/node/ciphers.js";

const provider = new NodeCryptoProvider();

const randKey = (cipher: AeadCipher): Uint8Array => new Uint8Array(nodeRandomBytes(cipher.keySize));
const randNonce = (cipher: AeadCipher): Uint8Array => new Uint8Array(nodeRandomBytes(cipher.nonceSize));

/** Flip the least-significant bit of byte `i`, asserting the cipher rejects it. */
function assertTamperRejected(cipher: AeadCipher, key: Uint8Array, nonce: Uint8Array, ct: Uint8Array, aad: Uint8Array, i: number): void {
    const tampered = new Uint8Array(ct);
    tampered[i] ^= 0x01;
    expect(() => cipher.decrypt(key, nonce, tampered, aad)).toThrow(/authentication/);
}

describe("AEAD determinism: same inputs → identical ciphertext", () => {
    const plaintext = new TextEncoder().encode("deterministic encryption is expected for a fixed nonce");

    for (const cipher of [aes128Gcm, aes256Gcm, chacha20Poly1305]) {
        it(`${cipher.id} produces byte-identical output for repeated calls`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const aad = new TextEncoder().encode("aad");
            const a = cipher.encrypt(key, nonce, plaintext, aad);
            const b = cipher.encrypt(key, nonce, plaintext, aad);
            expect(a).toEqual(b);
        });
    }
});

describe("AEAD sensitivity: changing each input changes the ciphertext", () => {
    for (const cipher of [aes128Gcm, aes256Gcm, chacha20Poly1305]) {
        it(`${cipher.id} ciphertext differs when the nonce changes`, () => {
            const key = randKey(cipher);
            const aad = new TextEncoder().encode("aad");
            const pt = new TextEncoder().encode("pt");
            const n1 = randNonce(cipher);
            const n2 = randNonce(cipher);
            const c1 = cipher.encrypt(key, n1, pt, aad);
            const c2 = cipher.encrypt(key, n2, pt, aad);
            expect(c1).not.toEqual(c2);
        });

        it(`${cipher.id} ciphertext differs when the key changes`, () => {
            const nonce = randNonce(cipher);
            const aad = new TextEncoder().encode("aad");
            const pt = new TextEncoder().encode("pt");
            const c1 = cipher.encrypt(randKey(cipher), nonce, pt, aad);
            const c2 = cipher.encrypt(randKey(cipher), nonce, pt, aad);
            expect(c1).not.toEqual(c2);
        });

        it(`${cipher.id} ciphertext differs when the plaintext changes`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const aad = new Uint8Array(0);
            const c1 = cipher.encrypt(key, nonce, new TextEncoder().encode("pt-1"), aad);
            const c2 = cipher.encrypt(key, nonce, new TextEncoder().encode("pt-2"), aad);
            expect(c1).not.toEqual(c2);
        });

        it(`${cipher.id} ciphertext differs when the AAD changes (and decryption fails under old AAD)`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const pt = new TextEncoder().encode("pt");
            const aad1 = new TextEncoder().encode("aad-1");
            const aad2 = new TextEncoder().encode("aad-2");
            const c1 = cipher.encrypt(key, nonce, pt, aad1);
            const c2 = cipher.encrypt(key, nonce, pt, aad2);
            expect(c1).not.toEqual(c2); // tag differs even though ciphertext body may coincide
            expect(() => cipher.decrypt(key, nonce, c1, aad2)).toThrow(/authentication/);
        });
    }
});

describe("AEAD tamper detection: every byte of ciphertext||tag is authenticated", () => {
    for (const cipher of [aes128Gcm, aes256Gcm, chacha20Poly1305]) {
        it(`${cipher.id} rejects a single-bit flip at every output position`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            // 40 bytes of plaintext → ciphertext body + 16-byte tag = 56 positions.
            const pt = new Uint8Array(40);
            for (let i = 0; i < pt.length; i++) pt[i] = (i * 7) % 256;
            const aad = new TextEncoder().encode("tamper-aad");
            const ct = cipher.encrypt(key, nonce, pt, aad);

            for (let i = 0; i < ct.length; i++) {
                assertTamperRejected(cipher, key, nonce, ct, aad, i);
            }
        });

        it(`${cipher.id} rejects a flip in the first ciphertext byte (non-tag region)`, () => {
            // The existing suite flips the *last* (tag) byte; this covers the
            // body, where auth failure surfaces only in final().
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const pt = new TextEncoder().encode("body-tamper test");
            const aad = new Uint8Array(0);
            const ct = cipher.encrypt(key, nonce, pt, aad);
            assertTamperRejected(cipher, key, nonce, ct, aad, 0);
        });

        it(`${cipher.id} rejects a tampered AAD while keeping ciphertext intact`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const pt = new TextEncoder().encode("pt");
            const aad = new TextEncoder().encode("legit-aad");
            const ct = cipher.encrypt(key, nonce, pt, aad);
            expect(() => cipher.decrypt(key, nonce, ct, new TextEncoder().encode("forged-aad"))).toThrow(/authentication/);
        });
    }
});

describe("AEAD nonce reuse: confidentiality degrades deterministically", () => {
    it("reusing a nonce reveals the XOR of two plaintexts via the ciphertext bodies", () => {
        // Under nonce reuse, ChaCha20/AES-CTR produce the same keystream, so
        // ct1 ^ ct2 == pt1 ^ pt2 for the body bytes. This documents the known
        // failure mode (RFC 8439 §4) so a future refactor that added
        // randomization would trip this test.
        const key = randKey(chacha20Poly1305);
        const nonce = randNonce(chacha20Poly1305);
        const aad = new Uint8Array(0);
        const pt1 = new TextEncoder().encode("AAAAAAAAAAAAAAAA");
        const pt2 = new TextEncoder().encode("BBBBBBBBBBBBBBBB");
        const ct1 = chacha20Poly1305.encrypt(key, nonce, pt1, aad);
        const ct2 = chacha20Poly1305.encrypt(key, nonce, pt2, aad);

        // Body XOR equals plaintext XOR (last 16 bytes are the differing tags).
        const bodyLen = pt1.length;
        for (let i = 0; i < bodyLen; i++) {
            const ctXor = ct1[i]! ^ ct2[i]!;
            const ptXor = pt1[i]! ^ pt2[i]!;
            expect(ctXor).toBe(ptXor);
        }
        // Tags differ even under nonce reuse (Poly1305 one-time key is identical,
        // but the authenticated buffer includes the differing ciphertext).
        expect(ct1.subarray(bodyLen)).not.toEqual(ct2.subarray(bodyLen));
    });
});

describe("AEAD randomized round-trips over many sizes", () => {
    for (const cipher of [aes128Gcm, aes256Gcm, chacha20Poly1305]) {
        it(`${cipher.id} recovers plaintext for sizes spanning block boundaries`, () => {
            const key = randKey(cipher);
            const nonce = randNonce(cipher);
            const aad = new Uint8Array(nodeRandomBytes(8));
            // 0, 1, 15, 16, 17, 63, 64, 65, 255, 256, 257, 4096 — exercises
            // empty, sub-block, exact-block, multi-block, and partial-final.
            for (const len of [0, 1, 15, 16, 17, 63, 64, 65, 255, 256, 257, 4096]) {
                const pt = new Uint8Array(nodeRandomBytes(len));
                const ct = cipher.encrypt(key, nonce, pt, aad);
                expect(ct.length).toBe(len + cipher.tagSize);
                expect(cipher.decrypt(key, nonce, ct, aad)).toEqual(pt);
            }
        });
    }
});

describe("AEAD cross-cipher isolation", () => {
    it("decrypting AES-GCM output with the ChaCha20 descriptor fails (algorithm mismatch)", () => {
        const key = randKey(aes256Gcm); // both take 32-byte keys
        const nonce = randNonce(aes256Gcm); // both take 12-byte nonces
        const pt = new TextEncoder().encode("cross-cipher");
        const aesCt = aes256Gcm.encrypt(key, nonce, pt, new Uint8Array(0));
        expect(() => chacha20Poly1305.decrypt(key, nonce, aesCt, new Uint8Array(0))).toThrow();
    });

    it("provider methods agree with the descriptor methods", () => {
        const key = randKey(aes128Gcm);
        const nonce = randNonce(aes128Gcm);
        const aad = new TextEncoder().encode("parity");
        const pt = new TextEncoder().encode("parity pt");
        const viaProvider = provider.aes128GcmEncrypt(key, nonce, pt, aad);
        const viaDescriptor = aes128Gcm.encrypt(key, nonce, pt, aad);
        expect(viaProvider).toEqual(viaDescriptor);
    });
});
