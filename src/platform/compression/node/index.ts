/**
 * Node.js platform adapter for compression primitives.
 *
 * This folder is the compression platform boundary: it imports the concrete
 * Node-backed implementation from `@browsercore/compression` and exposes it
 * as the `@browsercore/contracts` CompressionProvider interface.
 */

export { nodeCompression } from "./compression.js";
