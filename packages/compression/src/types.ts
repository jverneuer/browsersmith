/**
 * Domain types for @browsercore/compression.
 *
 * A clean abstraction wrapping Node's native zlib APIs. HTTP layers — never
 * `node:zlib` directly — call these methods so the backend is replaceable
 * (WebCompressionStream, a test double, a wasm brotli impl).
 *
 * The `ContentEncoding` union is the set of content-encoding tokens this
 * package knows how to decode. It is intentionally a literal union, never a
 * bare `string`, so exhaustiveness can be checked at compile time.
 */

/** Content-encoding tokens we can decode — literal union, never bare `string`. */
export type ContentEncoding = "gzip" | "deflate" | "br" | "identity";

/**
 * The set of content-encoding tokens we can decode, as a runtime array.
 * `identity` is included for exhaustiveness but is a no-op (no decompression).
 */
export const SUPPORTED_ENCODINGS: readonly ContentEncoding[] = [
    "gzip",
    "deflate",
    "br",
    "identity",
];

/**
 * Pure compression primitive abstraction HTTP layers depend on.
 *
 * Every method takes and returns `Uint8Array` — never Node `Buffer` — so the
 * interface is portable across backends. All operations are synchronous and
 * I/O-free, which keeps them unit-testable.
 */
export interface CompressionProvider {
    /** Compress `data` with gzip. */
    gzip(data: Uint8Array): Uint8Array;
    /** Decompress a gzip-encoded `data`. */
    gunzip(data: Uint8Array): Uint8Array;

    /** Compress `data` with zlib-wrapped deflate. */
    deflate(data: Uint8Array): Uint8Array;
    /** Decompress a zlib-wrapped deflate `data`. */
    inflate(data: Uint8Array): Uint8Array;

    /** Decompress a raw (headerless) deflate `data`. */
    inflateRaw(data: Uint8Array): Uint8Array;

    /** Compress `data` with brotli. */
    brotliCompress(data: Uint8Array): Uint8Array;
    /** Decompress a brotli-encoded `data`. */
    brotliDecompress(data: Uint8Array): Uint8Array;

    /**
     * Decompress a body according to a `content-encoding` header value.
     *
     * Implements browser-tolerant decoding:
     *   - `gzip` / `x-gzip` → gunzip
     *   - `deflate` → try zlib-wrapped inflate first, fall back to raw inflate
     *     (servers disagree on framing; browsers tolerate both)
     *   - `br` → brotli decompress
     *   - `identity` (or empty) → no-op
     *
     * @throws {UnsupportedEncodingError} on an unrecognized encoding token.
     * @throws {DecompressionError} on a corrupt or truncated stream.
     */
    decompress(data: Uint8Array, encoding: string): Uint8Array;
}
