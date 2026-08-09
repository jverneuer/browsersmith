/**
 * Clamp-correctness regression tests for X25519 (RFC 7748 §5).
 *
 * X25519 mandates a "clamping" step on the private scalar before scalar
 * multiplication (RFC 7748 §5, decodeScalar25519):
 *
 *     k[0] &= 248  (clear the lowest 3 bits)
 *     k[31] &= 127 (clear the highest bit)
 *     k[31] |= 64  (set the second-highest bit)
 *
 * A backend that skips clamping — or applies it to the wrong bytes — produces
 * wrong shared secrets: a silent, catastrophic key-exchange failure. These
 * tests lock in the RFC 7748 §5.2 known-answer vector and exercise every
 * clamp bit so this bug class cannot ship again.
 *
 * Both the pure-TypeScript noble-curves backend and the node:crypto backend
 * are covered, since both clamp internally and either could regress independently.
 */

import { describe, expect, it } from "vitest";

import { NobleX25519Backend } from "@browsercore/crypto";
import { NodeCryptoProvider } from "../../../../src/platform/crypto/node/node-crypto-provider.js";

/** Hex string -> Uint8Array. */
const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, "hex"));

// ---------------------------------------------------------------------------
// Test vectors
// ---------------------------------------------------------------------------

/**
 * RFC 7748 §5.2 known-answer vector. This scalar already exercises two of the
 * three clamp operations: byte 0 low 3 bits are non-zero (0xa5 -> 0xa0) and
 * byte 31 bit 7 is set (0xc4 -> 0x44 after clearing bit 7 and setting bit 6).
 */
const RFC7748_SCALAR = fromHex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
const RFC7748_PUB = fromHex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c");
const RFC7748_EXPECTED = fromHex("c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552");

/** The all-zero (degenerate / small-order) u-coordinate. */
const ZERO = new Uint8Array(32);

/**
 * Canonical scalar with byte 31 bit 7 pre-cleared (0xc4 -> 0x44). Clamping
 * clears bit 7 regardless of its input state, so this MUST yield the identical
 * shared secret as the unmodified scalar — proving the clamp is applied.
 */
const BIT7_CLEARED = (() => {
    const s = RFC7748_SCALAR.slice();
    s[31] &= 0x7f;
    return s;
})();

/**
 * A scalar that differs from the canonical one in every bit the clamp step
 * touches, yet clamps to the same value — so it must produce the same secret:
 *
 *   byte 0:  0xa7 (low 3 bits set)     -> clamp clears them -> 0xa0 (same as 0xa5 -> 0xa0)
 *   byte 31: 0x84 (bit 7 set, bit 6 clear) -> clamp clears bit 7, sets bit 6 -> 0x44
 *            (same as the canonical 0xc4 -> 0x44)
 *
 * This exercises all three clamp operations in a single assertion.
 */
const ALL_CLAMP_BITS_EXERCISED = (() => {
    const s = RFC7748_SCALAR.slice();
    s[0] |= 0x07; // set the low 3 bits of byte 0
    s[31] = 0x84; // bit 7 set, bit 6 clear
    return s;
})();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("X25519 clamp correctness (RFC 7748 §5)", () => {
    describe("NobleX25519Backend", () => {
        const backend = new NobleX25519Backend();

        it("matches the RFC 7748 §5.2 known-answer vector", () => {
            expect(backend.sharedSecret(RFC7748_SCALAR, RFC7748_PUB)).toEqual(RFC7748_EXPECTED);
        });

        it("clears bit 7 of byte 31: a scalar with bit 7 pre-cleared yields the same secret", () => {
            expect(backend.sharedSecret(BIT7_CLEARED, RFC7748_PUB)).toEqual(RFC7748_EXPECTED);
            expect(backend.sharedSecret(BIT7_CLEARED, RFC7748_PUB)).toEqual(
                backend.sharedSecret(RFC7748_SCALAR, RFC7748_PUB),
            );
        });

        it("exercises all three clamp operations at once and still matches the vector", () => {
            expect(backend.sharedSecret(ALL_CLAMP_BITS_EXERCISED, RFC7748_PUB)).toEqual(
                RFC7748_EXPECTED,
            );
        });

        it("returns 32 zero bytes for the all-zero (degenerate) public key", () => {
            expect(backend.sharedSecret(RFC7748_SCALAR, ZERO)).toEqual(ZERO);
        });
    });

    describe("NodeCryptoProvider", () => {
        const provider = new NodeCryptoProvider();

        it("matches the RFC 7748 §5.2 known-answer vector", () => {
            expect(provider.x25519SharedSecret(RFC7748_SCALAR, RFC7748_PUB)).toEqual(
                RFC7748_EXPECTED,
            );
        });

        it("clears bit 7 of byte 31: a scalar with bit 7 pre-cleared yields the same secret", () => {
            expect(provider.x25519SharedSecret(BIT7_CLEARED, RFC7748_PUB)).toEqual(RFC7748_EXPECTED);
            expect(provider.x25519SharedSecret(BIT7_CLEARED, RFC7748_PUB)).toEqual(
                provider.x25519SharedSecret(RFC7748_SCALAR, RFC7748_PUB),
            );
        });

        it("exercises all three clamp operations at once and still matches the vector", () => {
            expect(provider.x25519SharedSecret(ALL_CLAMP_BITS_EXERCISED, RFC7748_PUB)).toEqual(
                RFC7748_EXPECTED,
            );
        });

        it("returns 32 zero bytes for the all-zero (degenerate) public key", () => {
            expect(provider.x25519SharedSecret(RFC7748_SCALAR, ZERO)).toEqual(ZERO);
        });
    });
});
