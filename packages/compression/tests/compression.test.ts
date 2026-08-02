/**
 * Tests for @browsercore/compression.
 *
 * The TEST file may use node:zlib to compute expected values — that's fine.
 * The production code is what must route through the CompressionProvider
 * abstraction.
 */

import {
    gunzipSync,
    gzipSync,
    inflateSync,
    inflateRawSync,
    deflateSync,
    deflateRawSync,
    brotliCompressSync,
    brotliDecompressSync,
} from "node:zlib";
import { describe, expect, it } from "vitest";

import {
    compression,
    NodeZlibCompressionProvider,
    SUPPORTED_ENCODINGS,
    UnsupportedEncodingError,
    DecompressionError,
    ensureCompressionError,
} from "../src/index.js";

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

/** Byte-level equality. */
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

describe("default singleton", () => {
    it("exports a NodeZlibCompressionProvider instance as the default", () => {
        expect(compression).toBeInstanceOf(NodeZlibCompressionProvider);
    });

    it("is a usable CompressionProvider (gzip round-trip works)", () => {
        const payload = detBuffer(256);
        const roundTrip = compression.gunzip(compression.gzip(payload));
        expect(bytesEqual(roundTrip, payload)).toBe(true);
    });
});

describe("gzip", () => {
    const provider = new NodeZlibCompressionProvider();

    it("round-trips a deterministic payload", () => {
        const payload = detBuffer(1024);
        const compressed = provider.gzip(payload);
        const plain = provider.gunzip(compressed);
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("produces bytes that node:zlib gunzip can decode", () => {
        const payload = detBuffer(512);
        const compressed = provider.gzip(payload);
        const plain = canonicalize(gunzipSync(compressed));
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("matches node:zlib gzip byte-for-byte", () => {
        const payload = detBuffer(256);
        const ours = provider.gzip(payload);
        const theirs = canonicalize(gzipSync(payload));
        expect(bytesEqual(ours, theirs)).toBe(true);
    });

    it("throws DecompressionError on corrupt input", () => {
        const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
        expect(() => provider.gunzip(corrupt)).toThrow(DecompressionError);
    });
});

describe("deflate", () => {
    const provider = new NodeZlibCompressionProvider();

    it("round-trips zlib-wrapped deflate", () => {
        const payload = detBuffer(1024);
        const compressed = provider.deflate(payload);
        const plain = provider.inflate(compressed);
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("round-trips raw deflate", () => {
        const payload = detBuffer(1024);
        // Build a raw deflate stream via node:zlib, then decode with ours.
        const raw = canonicalize(deflateRawSync(payload));
        const plain = provider.inflateRaw(raw);
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("matches node:zlib deflate byte-for-byte", () => {
        const payload = detBuffer(256);
        const ours = provider.deflate(payload);
        const theirs = canonicalize(deflateSync(payload));
        expect(bytesEqual(ours, theirs)).toBe(true);
    });
});

describe("brotli", () => {
    const provider = new NodeZlibCompressionProvider();

    it("round-trips a deterministic payload", () => {
        const payload = detBuffer(1024);
        const compressed = provider.brotliCompress(payload);
        const plain = provider.brotliDecompress(compressed);
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("produces bytes that node:zlib brotli can decode", () => {
        const payload = detBuffer(512);
        const compressed = provider.brotliCompress(payload);
        const plain = canonicalize(brotliDecompressSync(compressed));
        expect(bytesEqual(plain, payload)).toBe(true);
    });

    it("matches node:zlib brotli compress byte-for-byte", () => {
        const payload = detBuffer(256);
        const ours = provider.brotliCompress(payload);
        const theirs = canonicalize(brotliCompressSync(payload));
        expect(bytesEqual(ours, theirs)).toBe(true);
    });

    it("throws DecompressionError on corrupt input", () => {
        const corrupt = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
        expect(() => provider.brotliDecompress(corrupt)).toThrow(DecompressionError);
    });
});

describe("decompress (content-encoding dispatch)", () => {
    const provider = new NodeZlibCompressionProvider();
    const payload = detBuffer(1024);

    it("decodes gzip", () => {
        const compressed = canonicalize(gzipSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "gzip"), payload)).toBe(true);
    });

    it("decodes x-gzip", () => {
        const compressed = canonicalize(gzipSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "x-gzip"), payload)).toBe(true);
    });

    it("decodes zlib-wrapped deflate", () => {
        const compressed = canonicalize(deflateSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "deflate"), payload)).toBe(true);
    });

    it("falls back to raw deflate when zlib framing fails", () => {
        // Raw deflate stream (no zlib header) — inflateSync rejects it, so
        // decompress() must fall back to raw inflate.
        const raw = canonicalize(deflateRawSync(payload));
        expect(bytesEqual(provider.decompress(raw, "deflate"), payload)).toBe(true);
    });

    it("decodes brotli", () => {
        const compressed = canonicalize(brotliCompressSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "br"), payload)).toBe(true);
    });

    it("treats identity as a no-op", () => {
        expect(bytesEqual(provider.decompress(payload, "identity"), payload)).toBe(true);
    });

    it("treats the empty string as a no-op", () => {
        expect(bytesEqual(provider.decompress(payload, ""), payload)).toBe(true);
    });

    it("is case-insensitive and trims whitespace", () => {
        const compressed = canonicalize(gzipSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "  GZIP "), payload)).toBe(true);
    });

    it("throws UnsupportedEncodingError for an unknown token", () => {
        expect(() => provider.decompress(payload, "sdch")).toThrow(UnsupportedEncodingError);
    });

    it("throws DecompressionError when a known encoding gets corrupt data", () => {
        const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
        expect(() => provider.decompress(corrupt, "gzip")).toThrow(DecompressionError);
    });
});

describe("SUPPORTED_ENCODINGS", () => {
    it("lists every content-encoding token the provider decodes", () => {
        expect(SUPPORTED_ENCODINGS).toEqual(["gzip", "deflate", "br", "identity"]);
    });
});

describe("ensureCompressionError", () => {
    it("passes through an existing CompressionError", () => {
        const original = new UnsupportedEncodingError("sdch");
        expect(ensureCompressionError(original, "sdch")).toBe(original);
    });

    it("wraps a plain Error as DecompressionError with cause", () => {
        const cause = new Error("boom");
        const wrapped = ensureCompressionError(cause, "gzip");
        expect(wrapped).toBeInstanceOf(DecompressionError);
        expect(wrapped.encoding).toBe("gzip");
        expect(wrapped.cause).toBe(cause);
    });

    it("wraps a non-error value as DecompressionError", () => {
        const wrapped = ensureCompressionError("boom", "br");
        expect(wrapped).toBeInstanceOf(DecompressionError);
        expect(wrapped.cause).toBeInstanceOf(Error);
    });
});
