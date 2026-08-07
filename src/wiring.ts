/**
 * Platform default wiring for browsercore.
 *
 * This module is the single seam for platform-specific defaults. It exports
 * the default implementations of the injectable dependencies (CryptoProvider,
 * Clock, Net, DnsResolver) so that the rest of the codebase can depend on
 * these abstractions without hard-coding Node.js-specific implementations.
 *
 * The defaults are:
 * - `defaultCryptoProvider`: The Node-backed CryptoProvider from @browsercore/crypto
 * - `defaultClock`: systemClock (Date.now())
 * - `nodeNet`: Node.js TCP adapter (wraps `node:net.connect`)
 * - `nodeDns`: Node.js DNS adapter (wraps `node:dns.lookup`)
 *
 * Callers can override these in tests by passing mock implementations to the
 * connection options.
 */

import { crypto as defaultCryptoProvider } from "@browsercore/crypto";
import { systemClock as defaultClock } from "@browsercore/quic";
import { setConnectorDeps } from "@browsercore/transport";
import { nodeNet, nodeDns } from "./net/index.js";

// Initialize the transport package's platform dependencies.
// This is the one place where the Node adapters are wired into the stack.
setConnectorDeps({ net: nodeNet, dns: nodeDns });

export { defaultCryptoProvider, defaultClock };
