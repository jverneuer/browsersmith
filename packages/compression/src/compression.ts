/**
 * CompressionProvider — pure compression primitive abstraction.
 *
 * Wraps Node's native zlib APIs so HTTP layers never import `node:zlib`
 * directly. The backend is replaceable (WebCompressionStream, wasm brotli,
 * test double) through this interface.
 *
 * All operations are synchronous and I/O-free, which keeps them unit-testable.
 * Every method takes and returns `Uint8Array` — never Node `Buffer`.
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
import type { CompressionProvider } from "./types.js";
import { DecompressionError, UnsupportedEncodingError, ensureCompressionError } from "./errors.js";

/**
 * Normalize a zlib decoder's output to a fresh `Uint8Array`. The sync zlib
 * APIs return a Node `Buffer` (a `Uint8Array` subclass); callers outside this
 * package consume plain `Uint8Array`, so we canonicalize here at the boundary.
 */
function toUint8Array(data: Uint8Array | Buffer): Uint8Array {
    return new Uint8Array(data);
}

/**
 * Run a zlib sync decoder and wrap any failure as a typed
 * {@link DecompressionError} for the given encoding. Keeps the backend's
 * opaque error on `cause` without leaking it into the public API.
 */
function decodeWith(
    fn: (b: Uint8Array) => Uint8Array | Buffer,
    data: Uint8Array,
    encoding: string,
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
 */
export class NodeZlibCompressionProvider implements CompressionProvider {
    public gzip(data: Uint8Array): Uint8Array {
        return toUint8Array(gzipSync(data));
    }

    public gunzip(data: Uint8Array): Uint8Array {
        return decodeWith((b) => gunzipSync(b), data, "gzip");
    }

    public deflate(data: Uint8Array): Uint8Array {
        return toUint8Array(deflateSync(data));
    }

    public inflate(data: Uint8Array): Uint8Array {
        return decodeWith((b) => inflateSync(b), data, "deflate");
    }

    public inflateRaw(data: Uint8Array): Uint8Array {
        return decodeWith((b) => inflateRawSync(b), data, "deflate");
    }

    public brotliCompress(data: Uint8Array): Uint8Array {
        return toUint8Array(brotliCompressSync(data));
    }

    public brotliDecompress(data: Uint8Array): Uint8Array {
        return decodeWith((b) => brotliDecompressSync(b), data, "br");
    }

    public decompress(data: Uint8Array, encoding: string): Uint8Array {
        // Normalize the token once; content-encoding is case-insensitive and
        // may carry surrounding whitespace or parameters (e.g. "gzip ").
        const token = encoding.trim().toLowerCase();
        switch (token) {
            case "gzip":
            case "x-gzip":
                return this.gunzip(data);
            case "deflate": {
                // Servers disagree on framing: some send a zlib-wrapped stream
                // (what the RFC calls for), some send raw deflate. Browsers
                // tolerate both — try zlib first, fall back to raw inflate.
                try {
                    return this.inflate(data);
                } catch (zlibErr) {
                    if (zlibErr instanceof DecompressionError) {
                        return this.inflateRaw(data);
                    }
                    throw zlibErr;
                }
            }
            case "br":
                return this.brotliDecompress(data);
            case "identity":
            case "":
                return data;
            default:
                throw new UnsupportedEncodingError(encoding);
        }
    }
}

/**
 * Default compression backend HTTP layers call into. Backed by `node:zlib`.
 * Replaceable for tests or alternative runtimes.
 */
export const compression = new NodeZlibCompressionProvider();
