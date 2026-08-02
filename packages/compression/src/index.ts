/**
 * @browsercore/compression — public API surface.
 *
 * A clean abstraction wrapping Node's native zlib APIs. HTTP layers — never
 * `node:zlib` directly — call these methods so the backend is replaceable
 * (WebCompressionStream, wasm brotli, test double).
 */

export { NodeZlibCompressionProvider, compression } from "./compression.js";
export type { CompressionProvider } from "./types.js";

export type { ContentEncoding } from "./types.js";
export { SUPPORTED_ENCODINGS } from "./types.js";

export {
    CompressionError,
    DecompressionError,
    UnsupportedEncodingError,
    ensureCompressionError,
} from "./errors.js";

export { assertNever } from "./utils.js";
