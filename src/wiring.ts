/**
 * Platform default wiring for browsercore.
 *
 * This module is the single seam for platform-specific defaults. It exports
 * the default implementations of the injectable dependencies (CryptoProvider,
 * Clock) so that the rest of the codebase can depend on these abstractions
 * without hard-coding Node.js-specific implementations.
 *
 * The defaults are:
 * - `defaultCryptoProvider`: The Node-backed CryptoProvider from @browsercore/crypto
 * - `defaultClock`: systemClock (Date.now())
 *
 * Callers can override these in tests by passing mock implementations to the
 * connection options.
 */

import { crypto as defaultCryptoProvider } from "@browsercore/crypto";
import { systemClock as defaultClock } from "@browsercore/quic";

export { defaultCryptoProvider, defaultClock };
