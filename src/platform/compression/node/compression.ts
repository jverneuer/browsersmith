/**
 * Node.js platform adapter for the {@link CompressionProvider} contract.
 *
 * Delegates to the Node-backed implementation from `@browsercore/compression`
 * which wraps `node:zlib`. This adapter lives in the platform layer so that
 * browsersmith is the only package that needs to know about the concrete
 * compression implementation.
 */

import { compression } from "@browsercore/compression";
import type { CompressionProvider } from "@browsercore/compression";

/**
 * Node.js implementation of the {@link CompressionProvider} contract.
 *
 * Wraps Node's native zlib APIs via the `@browsercore/compression` package,
 * which abstracts them behind the platform-agnostic interface.
 *
 * This is the production compression backend. The HTTP/1 and HTTP/2 layers
 * import the CompressionProvider type from `@browsercore/compression` and
 * call `gzip`, `gunzip`, `brotliCompress`, `decompress`, etc.
 */
export const nodeCompression: CompressionProvider = compression;
