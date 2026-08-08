/**
 * Node.js platform adapter for cryptographic primitives.
 *
 * This folder is the crypto platform boundary: it imports the concrete
 * Node-backed implementation from `@browsercore/crypto` and exposes it as
 * the `@browsercore/contracts` CryptoProvider interface.
 */

export { nodeCryptoProvider } from "./node-crypto-provider.js";
