/**
 * CompressionProvider — pure compression primitive abstraction.
 *
 * Wraps Node's native zlib APIs so HTTP layers never import `node:zlib`
 * directly. The backend is replaceable (WebCompressionStream, wasm brotli,
 * test double) through this interface.
 *
 * All operations are synchronous and I/O-free, which keeps them unit-testable.
 * Every method takes and returns `Uint8Array` — never Node `Buffer`.
 *
 * @module
 * @since 0.1.0
 */

import {
    gunzipSync,
    gzipSync,
    inflateSync,
    inflateRawSync,
    deflateSync,
    brotliCompressSync,
    brotliDecompressSync,
} from "node:zlib";
import type { CompressionProvider, ContentEncoding } from "@browsercore/contracts";
import { DecompressionError, UnsupportedEncodingError, ensureCompressionError } from "@browsercore/compression";
import { assertNever } from "@browsercore/compression";

/**
 * The native zlib backend's output: a Node `Buffer` (a `Uint8Array` subclass)
 * or a plain `Uint8Array`. Callers outside this package consume plain
 * `Uint8Array`, so we canonicalize at the boundary.
 */
type ZlibOutput = Uint8Array | Buffer;

/**
 * Normalize a zlib backend's output to a fresh `Uint8Array`.
 *
 * Detaches the result from any underlying `Buffer` pool. Canonicalizes here
 * at the boundary so callers never see a Node `Buffer`.
 *
 * @param data The zlib backend's output.
 * @returns A fresh `Uint8Array` copy.
 */
function toUint8Array(data: ZlibOutput): Uint8Array {
    return new Uint8Array(data);
}

/**
 * Parse a free-form `content-encoding` header value into a known
 * {@link ContentEncoding}.
 *
 * Browser-tolerant: case-insensitive, trims whitespace, treats `x-gzip` as
 * gzip and the empty token as identity.
 *
 * @param encoding The raw `Content-Encoding` header value.
 * @returns The matched {@link ContentEncoding}, or `null` for an unrecognized token.
 */
function parseEncoding(encoding: string): ContentEncoding | null {
    switch (encoding.trim().toLowerCase()) {
        case "gzip":
        case "x-gzip":
            return "gzip";
        case "deflate":
            return "deflate";
        case "br":
            return "br";
        case "identity":
        case "":
            return "identity";
        default:
            return null;
    }
}

/**
 * Run a zlib sync decoder and wrap any failure as a typed
 * {@link DecompressionError} for the given encoding.
 *
 * Keeps the backend's opaque error on `cause` without leaking it into the
 * public API.
 *
 * @param fn       The zlib decoder function to run.
 * @param data     Compressed bytes to decode.
 * @param encoding The content-encoding token (for the error wrapper).
 * @returns Decompressed bytes.
 * @throws {@link DecompressionError} on a corrupt or truncated stream.
 */
function decodeWith(
    fn: (b: Uint8Array) => ZlibOutput,
    data: Uint8Array,
    encoding: ContentEncoding,
): Uint8Array {
    try {
        return toUint8Array(fn(data));
    } catch (err) {
        throw ensureCompressionError(err, encoding);
    }
}

/**
 * `node:zlib`-backed implementation of {@link CompressionProvider}.
 *
 * The production HTTP layers call the default singleton (`compression`) — they
 * never construct this class directly. Tests inject a fake provider through
 * the `CompressionProvider` interface.
 *
 * @example
 * ```ts
 * import { compression } from "@browsercore/compression";
 * const decompressed = compression.decompress(responseBytes, "br");
 * ```
 *
 * @since 0.1.0
 */
export class NodeZlibCompressionProvider implements CompressionProvider {
    /** {@inheritDoc CompressionProvider.gzip} */
    public gzip(data: Uint8Array): Uint8Array {
        return toUint8Array(gzipSync(data));
    }

    /** {@inheritDoc CompressionProvider.gunzip} */
    public gunzip(data: Uint8Array): Uint8Array {
        return decodeWith((b) => gunzipSync(b), data, "gzip");
    }

    /** {@inheritDoc CompressionProvider.deflate} */
    public deflate(data: Uint8Array): Uint8Array {
        return toUint8Array(deflateSync(data));
    }

    /** {@inheritDoc CompressionProvider.inflate} */
    public inflate(data: Uint8Array): Uint8Array {
        return decodeWith((b) => inflateSync(b), data, "deflate");
    }

    /** {@inheritDoc CompressionProvider.inflateRaw} */
    public inflateRaw(data: Uint8Array): Uint8Array {
        return decodeWith((b) => inflateRawSync(b), data, "deflate");
    }

    /** {@inheritDoc CompressionProvider.brotliCompress} */
    public brotliCompress(data: Uint8Array): Uint8Array {
        return toUint8Array(brotliCompressSync(data));
    }

    /** {@inheritDoc CompressionProvider.brotliDecompress} */
    public brotliDecompress(data: Uint8Array): Uint8Array {
        return decodeWith((b) => brotliDecompressSync(b), data, "br");
    }

    /** {@inheritDoc CompressionProvider.decompress} */
    public decompress(data: Uint8Array, encoding: string): Uint8Array {
        const parsed = parseEncoding(encoding);
        if (parsed === null) {
            throw new UnsupportedEncodingError(encoding);
        }
        switch (parsed) {
            case "gzip":
                return this.gunzip(data);
            case "deflate": {
                // Servers disagree on framing: some send a zlib-wrapped stream
                // (what the RFC calls for), some send raw deflate. Browsers
                // tolerate both — try zlib first, fall back to raw inflate.
                try {
                    return this.inflate(data);
                } catch (zlibErr) {
                    // Only a decode failure justifies the raw-fallback: anything
                    // else (programming error, OOM) is not a framing problem and
                    // must surface unchanged rather than being masked by a retry.
                    if (zlibErr instanceof DecompressionError) {
                        return this.inflateRaw(data);
                    }
                    throw zlibErr;
                }
            }
            case "br":
                return this.brotliDecompress(data);
            case "identity":
                return data;
            default:
                // `parsed` is a `ContentEncoding`; every variant is handled above.
                // Adding a new member to that union makes this line compile-error
                // until a case is added here.
                return assertNever(parsed);
        }
    }
}

/**
 * Default compression backend HTTP layers call into.
 *
 * Backed by `node:zlib`. Replaceable for tests or alternative runtimes by
 * constructing a different {@link CompressionProvider} implementation.
 *
 * @example
 * ```ts
 * import { compression } from "@browsercore/compression";
 * const compressed = compression.gzip(new TextEncoder().encode("hello"));
 * ```
 *
 * @since 0.1.0
 */
export const nodeCompression = new NodeZlibCompressionProvider();
