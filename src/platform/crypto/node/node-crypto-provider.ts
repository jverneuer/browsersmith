/**
 * Node.js platform adapter for the {@link CryptoProvider} contract.
 *
 * Delegates to the Node-backed implementation from `@browsercore/crypto`.
 * This adapter lives in the platform layer so that browsersmith is the only
 * package that needs to know about the concrete crypto implementation.
 */

import { crypto } from "@browsercore/crypto";
import type { CryptoProvider } from "@browsercore/contracts";

/**
 * Node.js implementation of the {@link CryptoProvider} contract.
 *
 * Wraps Node's native crypto APIs via the `@browsercore/crypto` package,
 * which abstracts them behind the platform-agnostic interface.
 */
export const nodeCryptoProvider: CryptoProvider = crypto;
