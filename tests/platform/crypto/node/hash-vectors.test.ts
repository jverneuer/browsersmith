/**
 * Known-answer and property tests for SHA-256 / SHA-384.
 *
 * Locks the provider's digests to NIST FIPS 180-4 published vectors (the
 * "abc" and one-million-"a" test cases), plus property assertions: fixed
 * output length, avalanche on a single-bit input change, and multi-block
 * handling.
 *
 * Note: provider.sha256/sha384 return a Node Buffer (a Uint8Array subclass);
 * to compare against published hex without vitest's Buffer-vs-Uint8Array type
 * distinction, KATs compare hex strings directly.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";
import { SHA_256, SHA_384, type HashId } from "@browsercore/crypto";

const provider = new NodeCryptoProvider();

/** Standalone Uint8Array copy — strips Node Buffer identity for deep-equal. */
function copy(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

describe("SHA-256 NIST FIPS 180-4 known-answer vectors", () => {
    it("digests the empty string to e3b0c4…b855", () => {
        expect(copy(provider.sha256(new Uint8Array(0)))).toEqual(
            new Uint8Array(Buffer.from("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "hex")),
        );
    });

    it("digests 'abc' to ba7816…15ad (single-block vector)", () => {
        expect(copy(provider.sha256(new TextEncoder().encode("abc")))).toEqual(
            new Uint8Array(Buffer.from("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "hex")),
        );
    });

    it("digests one million 'a' bytes to cdc76e…12cd0 (multi-block stress vector)", () => {
        const data = new Uint8Array(1_000_000).fill(0x61);
        expect(copy(provider.sha256(data))).toEqual(
            new Uint8Array(Buffer.from("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0", "hex")),
        );
    });
});

describe("SHA-384 NIST FIPS 180-4 known-answer vectors", () => {
    it("digests the empty string to 38b060…8b95b", () => {
        expect(copy(provider.sha384(new Uint8Array(0)))).toEqual(
            new Uint8Array(Buffer.from("38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b", "hex")),
        );
    });

    it("digests 'abc' to cb0075…c825a7 (single-block vector)", () => {
        expect(copy(provider.sha384(new TextEncoder().encode("abc")))).toEqual(
            new Uint8Array(Buffer.from("cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7", "hex")),
        );
    });

    it("digests one million 'a' bytes to 9d0e18…3d8985 (multi-block stress vector)", () => {
        const data = new Uint8Array(1_000_000).fill(0x61);
        expect(copy(provider.sha384(data))).toEqual(
            new Uint8Array(Buffer.from("9d0e1809716474cb086e834e310a4a1ced149e9c00f248527972cec5704c2a5b07b8b3dc38ecc4ebae97ddd87f3d8985", "hex")),
        );
    });
});

describe("hash properties", () => {
    for (const [hash, algo, len] of [[SHA_256, "sha256", 32], [SHA_384, "sha384", 48]] as [HashId, string, number][]) {
        const digest = hash === SHA_256 ? (d: Uint8Array) => provider.sha256(d) : (d: Uint8Array) => provider.sha384(d);

        it(`${hash}: output length is always ${len} bytes regardless of input length`, () => {
            for (const n of [0, 1, 55, 56, 63, 64, 65, 111, 112, 113, 1024]) {
                expect(digest(new Uint8Array(n))).toHaveLength(len);
            }
        });

        it(`${hash}: matches node:crypto across input lengths`, () => {
            for (const n of [0, 1, 16, 64, 100, 1000]) {
                const data = new Uint8Array(n).map((_, i) => (i * 13) % 256);
                const expected = new Uint8Array(createHash(algo).update(data as Buffer).digest());
                expect(copy(digest(data))).toEqual(expected);
            }
        });

        it(`${hash}: a single-bit input change alters the digest (avalanche at the test level)`, () => {
            const a = new Uint8Array(64).fill(0x00);
            const b = new Uint8Array(64).fill(0x00);
            b[0] ^= 0x01;
            expect(copy(digest(a))).not.toEqual(copy(digest(b)));
        });
    }

    it("SHA-256 and SHA-384 produce different digests for the same input", () => {
        const data = new TextEncoder().encode("the same input");
        expect(copy(provider.sha256(data))).not.toEqual(copy(provider.sha384(data)));
        expect(provider.sha256(data)).toHaveLength(32);
        expect(provider.sha384(data)).toHaveLength(48);
    });
});
