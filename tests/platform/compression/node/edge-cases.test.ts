/**
 * Edge-case + contract tests for @browsercore/compression.
 *
 * Covers stream corruption (truncation, byte-flip), wrong-algorithm decoding,
 * content-encoding dispatch corner cases (casing/whitespace, multi-token,
 * unrecognized tokens), the identity no-op contract, and the Uint8Array return
 * boundary (no Node Buffer leaks to callers).
 */

import {
    brotliCompressSync,
    deflateRawSync,
    deflateSync,
    gzipSync,
} from "node:zlib";
import { describe, expect, it } from "vitest";

import { NodeZlibCompressionProvider } from "../../../../src/platform/compression/node/compression.js";
import { DecompressionError, UnsupportedEncodingError } from "@browsercore/compression";

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

const provider = new NodeZlibCompressionProvider();

describe("truncated streams surface as DecompressionError", () => {
    it("gzip with the trailer stripped off throws DecompressionError", () => {
        const compressed = canonicalize(gzipSync(detBuffer(2048)));
        // Drop the last 8 bytes (CRC32 + ISIZE trailer). zlib detects the
        // premature EOF and rejects — must surface as DecompressionError.
        const truncated = compressed.slice(0, compressed.length - 8);
        expect(() => provider.gunzip(truncated)).toThrow(DecompressionError);
    });

    it("gzip truncated to just the header throws DecompressionError", () => {
        const compressed = canonicalize(gzipSync(detBuffer(2048)));
        // Keep only the 10-byte gzip header — no deflate blocks at all.
        const truncated = compressed.slice(0, 10);
        expect(() => provider.gunzip(truncated)).toThrow(DecompressionError);
    });

    it("gzip truncated by a single byte throws DecompressionError", () => {
        const compressed = canonicalize(gzipSync(detBuffer(512)));
        const truncated = compressed.slice(0, compressed.length - 1);
        expect(() => provider.gunzip(truncated)).toThrow(DecompressionError);
    });

    it("brotli truncated to the header throws DecompressionError", () => {
        const compressed = canonicalize(brotliCompressSync(detBuffer(2048)));
        // Keep the first few bytes only — brotli will detect truncation.
        const truncated = compressed.slice(0, 4);
        expect(() => provider.brotliDecompress(truncated)).toThrow(DecompressionError);
    });

    it("zlib-wrapped deflate truncated throws DecompressionError", () => {
        const compressed = canonicalize(deflateSync(detBuffer(1024)));
        const truncated = compressed.slice(0, compressed.length - 4);
        expect(() => provider.inflate(truncated)).toThrow(DecompressionError);
    });
});

describe("byte-flipped corruption surfaces as DecompressionError", () => {
    it("a flipped middle byte breaks gzip decompression", () => {
        const compressed = canonicalize(gzipSync(detBuffer(2048)));
        // Flip a byte in the middle of the deflate body (past the 10-byte
        // header) — this corrupts an LZ77 reference / Huffman symbol.
        const mid = Math.floor(compressed.length / 2);
        const corrupted = new Uint8Array(compressed);
        corrupted[mid] = corrupted[mid]! ^ 0xff;
        expect(() => provider.gunzip(corrupted)).toThrow(DecompressionError);
    });

    it("a flipped header byte breaks brotli decompression", () => {
        // Brotli's leading bits encode the window size and first metablock
        // header — corrupting byte 0 reliably breaks the parse.
        const compressed = canonicalize(brotliCompressSync(detBuffer(2048)));
        const corrupted = new Uint8Array(compressed);
        corrupted[0] = corrupted[0]! ^ 0xff;
        expect(() => provider.brotliDecompress(corrupted)).toThrow(DecompressionError);
    });

    it("a flipped tail byte breaks brotli decompression (final metablock / EOF)", () => {
        const compressed = canonicalize(brotliCompressSync(detBuffer(2048)));
        const corrupted = new Uint8Array(compressed);
        corrupted[compressed.length - 1] = corrupted[compressed.length - 1]! ^ 0xff;
        expect(() => provider.brotliDecompress(corrupted)).toThrow(DecompressionError);
    });

    it("a flipped middle byte breaks zlib-wrapped inflate", () => {
        const compressed = canonicalize(deflateSync(detBuffer(2048)));
        const mid = Math.floor(compressed.length / 2);
        const corrupted = new Uint8Array(compressed);
        corrupted[mid] = corrupted[mid]! ^ 0xff;
        expect(() => provider.inflate(corrupted)).toThrow(DecompressionError);
    });
});

describe("codec integrity-check differences", () => {
    // gzip carries a CRC32 trailer and zlib-wrapped deflate carries an Adler-32
    // trailer, so ANY single flipped byte — even mid-stream — is detected and
    // throws. Brotli has NO integrity check: a single mid-stream flip can parse
    // to silently-wrong output instead of throwing. This documents that real,
    // security-relevant difference so callers don't assume "no throw == intact".
    const payload = detBuffer(4096);

    it("gzip detects a single mid-stream byte flip (CRC32)", () => {
        const compressed = canonicalize(gzipSync(payload));
        const mid = Math.floor(compressed.length / 2);
        const corrupted = new Uint8Array(compressed);
        corrupted[mid] = corrupted[mid]! ^ 0xff;
        expect(() => provider.gunzip(corrupted)).toThrow(DecompressionError);
    });

    it("zlib-wrapped deflate detects a single mid-stream byte flip (Adler-32)", () => {
        const compressed = canonicalize(deflateSync(payload));
        const mid = Math.floor(compressed.length / 2);
        const corrupted = new Uint8Array(compressed);
        corrupted[mid] = corrupted[mid]! ^ 0xff;
        expect(() => provider.inflate(corrupted)).toThrow(DecompressionError);
    });

    it("brotli does NOT reliably detect a single mid-stream byte flip (no checksum)", () => {
        // Empirically, a 16-byte flip in the middle of a brotli stream still
        // decodes without error (producing silently-different output). This is
        // inherent to the format — only header/tail corruption reliably throws.
        const compressed = canonicalize(brotliCompressSync(payload));
        const mid = Math.floor(compressed.length / 2);
        const corrupted = new Uint8Array(compressed);
        for (let i = mid; i < mid + 16; i++) {
            corrupted[i] = corrupted[i]! ^ 0xff;
        }
        // Assert the negative: this does not throw. (If a future zlib build
        // starts detecting it, flip this to .toThrow — the point of the test
        // is to pin the current integrity-check contract.)
        expect(() => provider.brotliDecompress(corrupted)).not.toThrow();
    });
});

describe("wrong-algorithm decoding fails cleanly", () => {
    // Feeding codec A's output to codec B's decoder must fail with a typed
    // DecompressionError — never silently return garbage or hang.
    it("gzip data fed to brotliDecompress throws DecompressionError", () => {
        const gzipData = canonicalize(gzipSync(detBuffer(512)));
        expect(() => provider.brotliDecompress(gzipData)).toThrow(DecompressionError);
    });

    it("brotli data fed to gunzip throws DecompressionError", () => {
        const brotliData = canonicalize(brotliCompressSync(detBuffer(512)));
        expect(() => provider.gunzip(brotliData)).toThrow(DecompressionError);
    });

    it("brotli data fed to inflate throws DecompressionError", () => {
        const brotliData = canonicalize(brotliCompressSync(detBuffer(512)));
        expect(() => provider.inflate(brotliData)).toThrow(DecompressionError);
    });

    it("zlib-wrapped deflate data fed to gunzip throws DecompressionError", () => {
        const deflateData = canonicalize(deflateSync(detBuffer(512)));
        expect(() => provider.gunzip(deflateData)).toThrow(DecompressionError);
    });

    it("gzip data fed to inflate throws DecompressionError", () => {
        const gzipData = canonicalize(gzipSync(detBuffer(512)));
        expect(() => provider.inflate(gzipData)).toThrow(DecompressionError);
    });

    it("empty input fed to gunzip throws DecompressionError", () => {
        // Not a valid gzip stream — no magic bytes.
        expect(() => provider.gunzip(new Uint8Array(0))).toThrow(DecompressionError);
    });

    it("empty input fed to brotliDecompress throws DecompressionError", () => {
        expect(() => provider.brotliDecompress(new Uint8Array(0))).toThrow(DecompressionError);
    });

    it("empty input fed to inflate throws DecompressionError", () => {
        expect(() => provider.inflate(new Uint8Array(0))).toThrow(DecompressionError);
    });
});

describe("content-encoding dispatch corner cases", () => {
    const payload = detBuffer(1024);

    it("x-gzip is case-insensitive and trims like gzip", () => {
        const compressed = canonicalize(gzipSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "  X-GZIP "), payload)).toBe(true);
    });

    it("'BR' (uppercase) decodes brotli", () => {
        const compressed = canonicalize(brotliCompressSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "BR"), payload)).toBe(true);
    });

    it("'  Deflate ' (mixed case + whitespace) decodes zlib-wrapped deflate", () => {
        const compressed = canonicalize(deflateSync(payload));
        expect(bytesEqual(provider.decompress(compressed, "  Deflate "), payload)).toBe(true);
    });

    it("'IDENTITY' is a no-op regardless of case", () => {
        expect(bytesEqual(provider.decompress(payload, "IDENTITY"), payload)).toBe(true);
    });

    it("tab/whitespace-only encoding string is treated as identity (empty after trim)", () => {
        expect(bytesEqual(provider.decompress(payload, "   \t  "), payload)).toBe(true);
    });

    it("throws UnsupportedEncodingError for 'compress' (historical token)", () => {
        expect(() => provider.decompress(payload, "compress")).toThrow(UnsupportedEncodingError);
    });

    it("throws UnsupportedEncodingError for '8bit' / '7bit' / 'base64' transfer encodings", () => {
        for (const tok of ["8bit", "7bit", "base64"]) {
            expect(() => provider.decompress(payload, tok)).toThrow(UnsupportedEncodingError);
        }
    });

    it("throws UnsupportedEncodingError for a multi-token list (only single tokens are supported)", () => {
        // Real HTTP allows "gzip, deflate" — this library deliberately handles
        // a single token only; the whole string is treated as unrecognized.
        expect(() => provider.decompress(payload, "gzip, deflate")).toThrow(UnsupportedEncodingError);
    });

    it("preserves the raw (untrimmed, original-case) token on UnsupportedEncodingError", () => {
        // The .encoding field carries exactly what the caller passed in, so the
        // higher layer can log / branch on the original header value.
        try {
            provider.decompress(payload, "  SDCH ");
            throw new Error("expected decompress to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(UnsupportedEncodingError);
            expect((e as UnsupportedEncodingError).encoding).toBe("  SDCH ");
        }
    });
});

describe("identity / empty no-op contract", () => {
    const payload = detBuffer(256);

    it("identity returns the SAME reference (no copy, true no-op)", () => {
        // The implementation returns `data` directly — callers that rely on the
        // no-op not allocating depend on reference identity here.
        expect(provider.decompress(payload, "identity")).toBe(payload);
    });

    it("empty-string encoding returns the SAME reference", () => {
        expect(provider.decompress(payload, "")).toBe(payload);
    });

    it("whitespace-only encoding returns the SAME reference", () => {
        expect(provider.decompress(payload, "  ")).toBe(payload);
    });

    it("identity is a no-op even for an empty body", () => {
        const empty = new Uint8Array(0);
        expect(provider.decompress(empty, "identity")).toBe(empty);
    });
});

describe("Uint8Array return contract (no Node Buffer leaks)", () => {
    // The boundary canonicalization (`toUint8Array`) exists so callers never
    // receive a Node Buffer pulled from zlib's internal pool. Every public
    // method must return a plain Uint8Array that is independent of any Buffer.
    const payload = detBuffer(512);

    it("gzip returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.gzip(payload);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("gunzip returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.gunzip(provider.gzip(payload));
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("deflate returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.deflate(payload);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("inflate returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.inflate(provider.deflate(payload));
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("inflateRaw returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.inflateRaw(canonicalize(deflateRawSync(payload)));
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("brotliCompress returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.brotliCompress(payload);
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("brotliDecompress returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.brotliDecompress(provider.brotliCompress(payload));
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("decompress (gzip) returns a plain Uint8Array, not a Node Buffer", () => {
        const out = provider.decompress(provider.gzip(payload), "gzip");
        expect(Buffer.isBuffer(out)).toBe(false);
    });

    it("returned Uint8Array is a copy: mutating it does not affect a second decode", () => {
        // `new Uint8Array(typedArray)` copies elements into a fresh buffer —
        // prove independence by mutating one result and re-decoding.
        const compressed = provider.gzip(payload);
        const first = provider.gunzip(compressed);
        const snapshot = new Uint8Array(first);
        first[0] = (first[0]! + 1) % 256;
        const second = provider.gunzip(compressed);
        expect(bytesEqual(second, snapshot)).toBe(true);
        expect(bytesEqual(first, second)).toBe(false);
    });
});

describe("compression actually compresses (sanity on ratios)", () => {
    it("gzip shrinks highly repetitive input", () => {
        const repetitive = new Uint8Array(10_000).fill(0x41);
        const out = provider.gzip(repetitive);
        expect(out.length).toBeLessThan(repetitive.length / 10);
    });

    it("brotli shrinks highly repetitive input", () => {
        const repetitive = new Uint8Array(10_000).fill(0x41);
        const out = provider.brotliCompress(repetitive);
        expect(out.length).toBeLessThan(repetitive.length / 10);
    });

    it("deflate shrinks highly repetitive input", () => {
        const repetitive = new Uint8Array(10_000).fill(0x41);
        const out = provider.deflate(repetitive);
        expect(out.length).toBeLessThan(repetitive.length / 10);
    });
});
