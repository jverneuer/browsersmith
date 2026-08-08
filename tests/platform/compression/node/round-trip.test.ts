/**
 * Round-trip + zlib-parity tests for @browsercore/compression.
 *
 * These exercise every algorithm (gzip, deflate/zlib, raw deflate, brotli)
 * across a matrix of input shapes — empty, tiny, all-byte-values, large,
 * repetitive, incompressible-random, UTF-8 text, and already-compressed.
 *
 * The TEST file may use node:zlib to compute expected values — that's fine.
 * The production code is what must route through the CompressionProvider
 * abstraction.
 */

import { randomBytes } from "node:crypto";
import {
    brotliCompressSync,
    brotliDecompressSync,
    deflateRawSync,
    deflateSync,
    gunzipSync,
    gzipSync,
    inflateRawSync,
    inflateSync,
} from "node:zlib";
import { describe, expect, it } from "vitest";

import { NodeZlibCompressionProvider } from "../../../../src/platform/compression/node/compression.js";

/** Deterministic payload: byte[i] = i % 256 (reproducible, never random). */
function detBuffer(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = i % 256;
    }
    return bytes;
}

/** Normalize a Node Buffer / Uint8Array to a standalone Uint8Array. */
function canonicalize(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

/** Byte-level equality (avoids Buffer === semantics). */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/** UTF-8 encode a string to a fresh Uint8Array (Buffer.from -> Buffer copy). */
function utf8(text: string): Uint8Array {
    return new Uint8Array(Buffer.from(text, "utf8"));
}

/**
 * The matrix of input shapes every algorithm must handle. Each entry covers a
 * distinct class of input that stresses a different aspect of the codec:
 *   - empty / tiny: boundary lengths (0, 1, 2)
 *   - all-bytes: every byte value 0..255 (exercises binary payloads)
 *   - repetitive: highly compressible (max compression ratio)
 *   - random: incompressible (compressed >= original; stresses raw byte path)
 *   - large: exercises multi-chunk internal buffering
 *   - text: realistic UTF-8 HTTP body
 *   - already-compressed: codec must still round-trip (no data loss), just poor ratio
 */
type Shape = readonly [name: string, bytes: () => Uint8Array];

const SHAPES: readonly Shape[] = [
    ["empty (0 bytes)", () => new Uint8Array(0)],
    ["single byte", () => new Uint8Array([0x42])],
    ["two bytes", () => new Uint8Array([0x00, 0xff])],
    ["all byte values 0..255", () => detBuffer(256)],
    ["1 KiB deterministic", () => detBuffer(1024)],
    ["highly repetitive (all 0x41)", () => {
        const b = new Uint8Array(4096);
        b.fill(0x41);
        return b;
    }],
    ["repeating 'ab' pattern", () => {
        const b = new Uint8Array(4000);
        for (let i = 0; i < b.length; i++) {
            b[i] = i % 2 === 0 ? 0x61 : 0x62;
        }
        return b;
    }],
    ["8 KiB incompressible random", () => canonicalize(randomBytes(8192))],
    ["100 KiB large deterministic", () => detBuffer(100_000)],
    ["UTF-8 text body", () => utf8("Hello, 世界! 🚀 — " + "the quick brown fox. ".repeat(200))],
    ["already-compressed (gzip of text)", () => canonicalize(gzipSync(utf8("compress me ".repeat(500))))],
] as const;

const provider = new NodeZlibCompressionProvider();

describe("gzip round-trip across input shapes", () => {
    it.each(SHAPES)("round-trips %s through gzip → gunzip", (_name, make) => {
        const payload = make();
        const plain = provider.gunzip(provider.gzip(payload));
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our gzip output decodes with node:zlib gunzipSync", (_name, make) => {
        const payload = make();
        const compressed = provider.gzip(payload);
        expect(bytesEqual(canonicalize(gunzipSync(compressed)), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our gzip output matches gzipSync byte-for-byte", (_name, make) => {
        const payload = make();
        expect(bytesEqual(provider.gzip(payload), canonicalize(gzipSync(payload)))).toBe(true);
    });
});

describe("deflate (zlib-wrapped) round-trip across input shapes", () => {
    it.each(SHAPES)("round-trips %s through deflate → inflate", (_name, make) => {
        const payload = make();
        const plain = provider.inflate(provider.deflate(payload));
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our deflate output decodes with node:zlib inflateSync", (_name, make) => {
        const payload = make();
        const compressed = provider.deflate(payload);
        expect(bytesEqual(canonicalize(inflateSync(compressed)), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our deflate output matches deflateSync byte-for-byte", (_name, make) => {
        const payload = make();
        expect(bytesEqual(provider.deflate(payload), canonicalize(deflateSync(payload)))).toBe(true);
    });
});

describe("raw deflate round-trip across input shapes", () => {
    it.each(SHAPES)("%s: decodes a raw (headerless) deflate stream", (_name, make) => {
        const payload = make();
        // Build a raw deflate stream via node:zlib, then decode with ours.
        const raw = canonicalize(deflateRawSync(payload));
        expect(bytesEqual(provider.inflateRaw(raw), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our inflateRaw output matches inflateRawSync byte-for-byte", (_name, make) => {
        const payload = make();
        const raw = canonicalize(deflateRawSync(payload));
        expect(bytesEqual(provider.inflateRaw(raw), canonicalize(inflateRawSync(raw)))).toBe(true);
    });
});

describe("brotli round-trip across input shapes", () => {
    it.each(SHAPES)("round-trips %s through brotliCompress → brotliDecompress", (_name, make) => {
        const payload = make();
        const plain = provider.brotliDecompress(provider.brotliCompress(payload));
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our brotli output decodes with node:zlib brotliDecompressSync", (_name, make) => {
        const payload = make();
        const compressed = provider.brotliCompress(payload);
        expect(bytesEqual(canonicalize(brotliDecompressSync(compressed)), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: our brotliCompress output matches brotliCompressSync byte-for-byte", (_name, make) => {
        const payload = make();
        expect(bytesEqual(provider.brotliCompress(payload), canonicalize(brotliCompressSync(payload)))).toBe(true);
    });
});

describe("cross-backend parity (node:zlib compresses → ours decodes)", () => {
    it.each(SHAPES)("%s: node:zlib gzip → our gunzip", (_name, make) => {
        const payload = make();
        const compressed = canonicalize(gzipSync(payload));
        expect(bytesEqual(provider.gunzip(compressed), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: node:zlib zlib-deflate → our inflate", (_name, make) => {
        const payload = make();
        const compressed = canonicalize(deflateSync(payload));
        expect(bytesEqual(provider.inflate(compressed), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: node:zlib raw deflate → our inflateRaw", (_name, make) => {
        const payload = make();
        const compressed = canonicalize(deflateRawSync(payload));
        expect(bytesEqual(provider.inflateRaw(compressed), payload)).toBe(true);
    });

    it.each(SHAPES)("%s: node:zlib brotli → our brotliDecompress", (_name, make) => {
        const payload = make();
        const compressed = canonicalize(brotliCompressSync(payload));
        expect(bytesEqual(provider.brotliDecompress(compressed), payload)).toBe(true);
    });
});

describe("round-trip invariants", () => {
    it("gzip then gunzip is the identity for a second pass (no accumulation)", () => {
        const payload = detBuffer(2048);
        const once = provider.gunzip(provider.gzip(payload));
        const twice = provider.gunzip(provider.gzip(once));
        expect(bytesEqual(twice, payload)).toBe(true);
    });

    it("compressing already-compressed data still round-trips (no data loss)", () => {
        const payload = utf8("aaaaaaaaaa".repeat(1000));
        const once = provider.gzip(payload);
        const twice = provider.gzip(once);
        // Decompress twice and recover the original.
        expect(bytesEqual(provider.gunzip(provider.gunzip(twice)), payload)).toBe(true);
        // Sanity: the second pass genuinely added framing overhead, not a no-op.
        expect(twice.length).toBeGreaterThan(once.length);
    });

    it("brotli of brotli round-trips", () => {
        const payload = detBuffer(2048);
        const once = provider.brotliCompress(payload);
        const twice = provider.brotliCompress(once);
        expect(bytesEqual(provider.brotliDecompress(provider.brotliDecompress(twice)), payload)).toBe(true);
    });
});
