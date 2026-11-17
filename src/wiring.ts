/**
 * Platform composition root for browsersmith.
 *
 * This module builds the default {@link Platform} instance that threads all
 * runtime dependencies through the stack. browsersmith is the ONLY package
 * allowed to import `node:*` modules — every other package depends on
 * `@browsercore/contracts` interfaces and receives implementations via the
 * Platform.
 *
 * The default {@link platform} is LAZY: nothing is assembled at module load,
 * only on first bundle access (see below). Tests construct their own Platform
 * via {@link createPlatform} with mock adapters.
 */

import { createPlatform, type CompletePlatform, type PlatformOptions } from "./platform/index.js";
import {
    cipherSuiteToAead as tlsCipherSuiteToAead,
    generateKeyShares as tlsGenerateKeyShares,
    runHandshake as tlsRunHandshake,
} from "@browsercore/tls";
import type { TlsHandshakeEngine } from "@browsercore/contracts";

// Re-export createPlatform so consumers can build custom platforms (e.g. tests).
export { createPlatform };
export type { PlatformOptions };

/**
 * Memoized default platform — assembled on first bundle access.
 *
 * Module-scope `let` (not a top-level `const` construction) so that merely
 * importing this module performs zero adapter work.
 */
let defaultPlatform: CompletePlatform | undefined;

function defaultPlatformInstance(): CompletePlatform {
    defaultPlatform ??= createPlatform();
    return defaultPlatform;
}

/**
 * The default platform — a lazy, forwarding view over a memoized Platform.
 *
 * WHY a getter-per-bundle instead of `export const platform = createPlatform()`:
 * the replaceability audit (2026-11-16) flagged the eager construction as a
 * module-load side effect — importing `browsersmith` (or anything re-exporting
 * its wiring) built every Node adapter up front, whether or not the importer
 * ever touched the platform. On Workers/edge targets that cost lands on every
 * cold start, and it defeats tree-shaking: a bundler that could drop the
 * Node adapters for a runtime-free consumer cannot, because the construction
 * happens unconditionally at import. Each getter below forwards to the
 * memoized instance built on FIRST access — `import { platform }` keeps
 * working unchanged, but importing the module alone is free.
 */
export const platform: CompletePlatform = {
    get network() {
        return defaultPlatformInstance().network;
    },
    get crypto() {
        return defaultPlatformInstance().crypto;
    },
    get compression() {
        return defaultPlatformInstance().compression;
    },
    get events() {
        return defaultPlatformInstance().events;
    },
    get telemetry() {
        return defaultPlatformInstance().telemetry;
    },
    get time() {
        return defaultPlatformInstance().time;
    },
};

/** Memoized default TLS handshake engine (see {@link createTlsHandshakeEngine}). */
let defaultTlsEngine: TlsHandshakeEngine | undefined;

/**
 * Wrap `@browsercore/tls`'s exported engine functions into the contracts
 * {@link TlsHandshakeEngine} interface.
 *
 * Completes replaceability-audit remediation item #2: `@browsercore/quic`
 * consumes the contracts interface (never the tls package directly), and the
 * composition root supplies the implementation — exactly like crypto /
 * transport / events. With browsersmith passing this explicitly at every
 * `connectQuic` call site, quic's DEPRECATED dynamic-import default engine is
 * dead code for browsersmith consumers.
 *
 * The three function references are lifted verbatim (the contracts interface
 * was derived from these signatures), so the wrapper adds no behavior — it
 * only expresses the dependency direction: protocol packages depend on the
 * interface, only the composition root knows the implementation.
 *
 * @returns A `TlsHandshakeEngine` backed by `@browsercore/tls`.
 */
export function createTlsHandshakeEngine(): TlsHandshakeEngine {
    return {
        runHandshake: tlsRunHandshake,
        generateKeyShares: tlsGenerateKeyShares,
        cipherSuiteToAead: tlsCipherSuiteToAead,
    };
}

/**
 * The engine browsersmith injects into `connectQuic` — built once, on first
 * use, and memoized (the wrapper is stateless, so a single instance serves
 * every connection).
 */
export function defaultTlsHandshakeEngine(): TlsHandshakeEngine {
    defaultTlsEngine ??= createTlsHandshakeEngine();
    return defaultTlsEngine;
}

// Re-export commonly-used platform members so consumers can pull the Node.js
// adapters from the top-level barrel without knowing the internal layout.
export { nodeNet, nodeDns, nodeUdp } from "./platform/network/node/index.js";
export { nodeCryptoProvider } from "./platform/crypto/node/index.js";
export { nodeCompression } from "./platform/compression/node/index.js";
export { nodeEventProvider } from "./platform/events/node/index.js";
export { noOpTelemetry } from "./platform/telemetry/noop/index.js";
export { nodeTime } from "./platform/time/node/index.js";
