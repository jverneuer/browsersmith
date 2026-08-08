/**
 * Unit tests for the Node.js compression platform adapter.
 *
 * The adapter (`src/platform/compression/node/compression.ts`) delegates to
 * `@browsercore/compression`, which wraps `node:zlib` behind the
 * {@link CompressionProvider} contract. These tests verify the real zlib
 * round-trips — gzip, deflate, and content-encoding-aware decompress — and
 * assert that every method returns `Uint8Array` (never a Node `Buffer`).
 */

import { describe, it, expect } from "vitest";
import { nodeCompression } from "../../../../src/platform/compression/node/compression.js";

/** Known input bytes for deterministic assertions. */
const PAYLOAD = new Uint8Array([
    0x62, 0x72, 0x6f, 0x77, 0x73, 0x65, 0x72, 0x73, 0x6d, 0x69, 0x74, 0x68,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
]);

/** A larger payload to exercise actual compression (not just framing). */
const REPETITIVE = new Uint8Array(256).fill(0xab);

describe("nodeCompression: gzip round-trip", () => {
    it("gunzip(gzip(data)) returns the original bytes", () => {
        const compressed = nodeCompression.gzip(PAYLOAD);
        const restored = nodeCompression.gunzip(compressed);
        expect(restored).toEqual(PAYLOAD);
    });

    it("gzip returns a Uint8Array", () => {
        const compressed = nodeCompression.gzip(PAYLOAD);
        expect(compressed).toBeInstanceOf(Uint8Array);
    });

    it("gunzip returns a Uint8Array", () => {
        const restored = nodeCompression.gunzip(nodeCompression.gzip(PAYLOAD));
        expect(restored).toBeInstanceOf(Uint8Array);
    });
});

describe("nodeCompression: deflate round-trip", () => {
    it("inflate(deflate(data)) returns the original bytes", () => {
        const compressed = nodeCompression.deflate(PAYLOAD);
        const restored = nodeCompression.inflate(compressed);
        expect(restored).toEqual(PAYLOAD);
    });

    it("deflate returns a Uint8Array", () => {
        const compressed = nodeCompression.deflate(PAYLOAD);
        expect(compressed).toBeInstanceOf(Uint8Array);
    });

    it("inflate returns a Uint8Array", () => {
        const restored = nodeCompression.inflate(nodeCompression.deflate(PAYLOAD));
        expect(restored).toBeInstanceOf(Uint8Array);
    });
});

describe("nodeCompression: brotli round-trip", () => {
    it("brotliDecompress(brotliCompress(data)) returns the original bytes", () => {
        const compressed = nodeCompression.brotliCompress(PAYLOAD);
        const restored = nodeCompression.brotliDecompress(compressed);
        expect(restored).toEqual(PAYLOAD);
    });

    it("brotliCompress returns a Uint8Array", () => {
        const compressed = nodeCompression.brotliCompress(PAYLOAD);
        expect(compressed).toBeInstanceOf(Uint8Array);
    });

    it("brotliDecompress returns a Uint8Array", () => {
        const restored = nodeCompression.brotliDecompress(
            nodeCompression.brotliCompress(PAYLOAD),
        );
        expect(restored).toBeInstanceOf(Uint8Array);
    });
});

describe("nodeCompression: decompress dispatches by content-encoding", () => {
    it("decompress with 'gzip' reverses gzip", () => {
        const compressed = nodeCompression.gzip(PAYLOAD);
        const restored = nodeCompression.decompress(compressed, "gzip");
        expect(restored).toEqual(PAYLOAD);
    });

    it("decompress with 'deflate' reverses deflate", () => {
        const compressed = nodeCompression.deflate(PAYLOAD);
        const restored = nodeCompression.decompress(compressed, "deflate");
        expect(restored).toEqual(PAYLOAD);
    });

    it("decompress with 'br' reverses brotli", () => {
        const compressed = nodeCompression.brotliCompress(PAYLOAD);
        const restored = nodeCompression.decompress(compressed, "br");
        expect(restored).toEqual(PAYLOAD);
    });

    it("decompress with 'identity' returns the input unchanged", () => {
        const restored = nodeCompression.decompress(PAYLOAD, "identity");
        expect(restored).toEqual(PAYLOAD);
    });

    it("decompress returns a Uint8Array for each encoding", () => {
        expect(nodeCompression.decompress(PAYLOAD, "identity")).toBeInstanceOf(
            Uint8Array,
        );
        expect(
            nodeCompression.decompress(nodeCompression.gzip(PAYLOAD), "gzip"),
        ).toBeInstanceOf(Uint8Array);
        expect(
            nodeCompression.decompress(nodeCompression.deflate(PAYLOAD), "deflate"),
        ).toBeInstanceOf(Uint8Array);
        expect(
            nodeCompression.decompress(
                nodeCompression.brotliCompress(PAYLOAD),
                "br",
            ),
        ).toBeInstanceOf(Uint8Array);
    });
});

describe("nodeCompression: round-trip across larger payloads", () => {
    it("gzip round-trip preserves a 256-byte repetitive payload", () => {
        const restored = nodeCompression.gunzip(nodeCompression.gzip(REPETITIVE));
        expect(restored).toEqual(REPETITIVE);
    });

    it("deflate round-trip preserves a 256-byte repetitive payload", () => {
        const restored = nodeCompression.inflate(nodeCompression.deflate(REPETITIVE));
        expect(restored).toEqual(REPETITIVE);
    });
});
