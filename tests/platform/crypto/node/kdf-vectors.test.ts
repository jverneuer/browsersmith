/**
 * Known-answer and property tests for HKDF (RFC 5869) and HMAC (RFC 4231).
 *
 * RFC 5869 Test Case 1 is already covered in crypto.test.ts; this file adds
 * Test Cases 2 and 3 (longer inputs, and zero-length salt/info) and several
 * RFC 4231 HMAC-SHA-256/384 vectors, plus property assertions: info- and
 * salt-sensitivity, and length respect.
 */

import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";
import { SHA_256, SHA_384, type HashId } from "@browsercore/crypto";

const provider = new NodeCryptoProvider();
const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, "hex"));

/** Incrementing byte sequence 00..ff repeated to `length`. */
function ramp(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = i % 256;
    return out;
}

/** Incrementing sequence starting at `start`, wrapped to a byte. */
function rampFrom(start: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = (start + i) & 0xff;
    return out;
}

describe("HKDF RFC 5869 Test Case 2 (SHA-256, longer inputs/outputs, L=82)", () => {
    // 80-octet ramp inputs: ikm = 00..4f, salt = 60..df, info = b0..2f (mod 256).
    const ikm = ramp(80);
    const salt = rampFrom(0x60, 80);
    const info = rampFrom(0xb0, 80);
    const expectedOkm = fromHex(
        "b11e398dc80327a1c8e7f78c596a4934" +
        "4f012eda2d4efad8a050cc4c19afa97c" +
        "59045a99cac7827271cb41c65e590e09" +
        "da3275600c2f09b8367793a9aca3db71" +
        "cc30c58179ec3e87c14c01d5c1f3434f" +
        "1d87",
    );

    it("derives the 82-byte published OKM", () => {
        const ours = provider.hkdf(SHA_256, salt, ikm, info, 82);
        expect(ours).toHaveLength(82);
        expect(ours).toEqual(expectedOkm);
    });

    it("matches node:crypto.hkdfSync as an independent oracle", () => {
        const node = new Uint8Array(hkdfSync("sha256", ikm as Buffer, salt as Buffer, info as Buffer, 82));
        expect(provider.hkdf(SHA_256, salt, ikm, info, 82)).toEqual(node);
    });
});

describe("HKDF RFC 5869 Test Case 3 (SHA-256, zero-length salt and info, L=42)", () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const expectedOkm = fromHex(
        "8da4e775a563c18f715f802a063c5a31" +
        "b8a11f5c5ee1879ec3454e5f3c738d2d" +
        "9d201395faa4b61a96c8",
    );

    it("derives the 42-byte published OKM with empty salt and info", () => {
        const ours = provider.hkdf(SHA_256, new Uint8Array(0), ikm, new Uint8Array(0), 42);
        expect(ours).toEqual(expectedOkm);
    });

    it("matches node:crypto.hkdfSync as an independent oracle", () => {
        const node = new Uint8Array(hkdfSync("sha256", ikm as Buffer, Buffer.alloc(0), Buffer.alloc(0), 42));
        expect(provider.hkdf(SHA_256, new Uint8Array(0), ikm, new Uint8Array(0), 42)).toEqual(node);
    });
});

describe("HKDF SHA-384 matches node:crypto for longer outputs", () => {
    it("derives 255*48 bytes (the maximum single-hash expand) identically to node", () => {
        // 255 * HashLen is the RFC 5869 expand ceiling; this exercises the
        // counter wrapping from 0x01 to 0xff under SHA-384.
        const salt = ramp(48);
        const ikm = ramp(64);
        const info = new TextEncoder().encode("sha384-max-expand");
        const length = 255 * 48;
        const ours = provider.hkdf(SHA_384, salt, ikm, info, length);
        const node = new Uint8Array(hkdfSync("sha384", ikm as Buffer, salt as Buffer, info as Buffer, length));
        expect(ours).toHaveLength(length);
        expect(ours).toEqual(node);
    });
});

describe("HKDF properties", () => {
    it("output length is exactly the requested length", () => {
        for (const length of [1, 16, 31, 32, 33, 100, 255]) {
            const out = provider.hkdf(SHA_256, ramp(16), ramp(16), new Uint8Array(0), length);
            expect(out).toHaveLength(length);
        }
    });

    it("is sensitive to the info parameter (different info → different output)", () => {
        const salt = ramp(16);
        const ikm = ramp(32);
        const a = provider.hkdf(SHA_256, salt, ikm, new TextEncoder().encode("context-A"), 32);
        const b = provider.hkdf(SHA_256, salt, ikm, new TextEncoder().encode("context-B"), 32);
        expect(a).not.toEqual(b);
    });

    it("is sensitive to the salt parameter (different salt → different output)", () => {
        const ikm = ramp(32);
        const info = new TextEncoder().encode("shared-info");
        const a = provider.hkdf(SHA_256, new Uint8Array(16).fill(0x01), ikm, info, 32);
        const b = provider.hkdf(SHA_256, new Uint8Array(16).fill(0x02), ikm, info, 32);
        expect(a).not.toEqual(b);
    });

    it("is sensitive to the hash (SHA-256 ≠ SHA-384 for the same inputs)", () => {
        const salt = ramp(16);
        const ikm = ramp(32);
        const info = ramp(10);
        const a = provider.hkdf(SHA_256, salt, ikm, info, 48);
        const b = provider.hkdf(SHA_384, salt, ikm, info, 48);
        expect(a).not.toEqual(b);
    });
});

describe("HMAC RFC 4231 known-answer vectors", () => {
    it("SHA-256 Test Case 1: key=0x0b*20, data='Hi There'", () => {
        const key = new Uint8Array(20).fill(0x0b);
        const data = new TextEncoder().encode("Hi There");
        const expected = fromHex("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
        expect(provider.hmac(SHA_256, key, data)).toEqual(expected);
    });

    it("SHA-256 Test Case 2: key='Jefe', data='what do ya want for nothing?'", () => {
        const key = new TextEncoder().encode("Jefe");
        const data = new TextEncoder().encode("what do ya want for nothing?");
        const expected = fromHex("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
        expect(provider.hmac(SHA_256, key, data)).toEqual(expected);
    });

    it("SHA-256 Test Case 4: 25-byte ramp key, 50-byte 0xcd data", () => {
        const key = fromHex("0102030405060708090a0b0c0d0e0f10111213141516171819");
        const data = new Uint8Array(50).fill(0xcd);
        const expected = fromHex("82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b");
        expect(provider.hmac(SHA_256, key, data)).toEqual(expected);
    });

    it("SHA-384 Test Case 2: key='Jefe', data='what do ya want for nothing?'", () => {
        const key = new TextEncoder().encode("Jefe");
        const data = new TextEncoder().encode("what do ya want for nothing?");
        const expected = fromHex("af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649");
        expect(provider.hmac(SHA_384, key, data)).toEqual(expected);
    });
});

describe("HMAC properties and edge cases", () => {
    it("matches node:crypto for both hashes on a fixed input", () => {
        const key = ramp(32);
        const data = ramp(100);
        for (const [hash, algo] of [[SHA_256, "sha256"], [SHA_384, "sha384"]] as [HashId, string][]) {
            const expected = new Uint8Array(createHmac(algo, key as Buffer).update(data as Buffer).digest());
            expect(provider.hmac(hash, key, data)).toEqual(expected);
        }
    });

    it("produces a digest of the hash's output length", () => {
        const key = ramp(16);
        const data = ramp(8);
        expect(provider.hmac(SHA_256, key, data)).toHaveLength(32);
        expect(provider.hmac(SHA_384, key, data)).toHaveLength(48);
    });

    it("accepts an empty key and empty data (HMAC is defined on the empty string)", () => {
        const out = provider.hmac(SHA_256, new Uint8Array(0), new Uint8Array(0));
        const expected = new Uint8Array(createHmac("sha256", Buffer.alloc(0)).update(Buffer.alloc(0)).digest());
        expect(out).toEqual(expected);
        expect(out).toHaveLength(32);
    });

    it("is sensitive to a single-bit change in either key or data", () => {
        const key = ramp(32);
        const data = ramp(64);
        const base = provider.hmac(SHA_256, key, data);
        const keyFlip = key.slice(); keyFlip[0]! ^= 0x01;
        const dataFlip = data.slice(); dataFlip[0]! ^= 0x01;
        expect(provider.hmac(SHA_256, keyFlip, data)).not.toEqual(base);
        expect(provider.hmac(SHA_256, key, dataFlip)).not.toEqual(base);
    });
});
