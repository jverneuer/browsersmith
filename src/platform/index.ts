/**
 * Platform composition root for browsersmith.
 *
 * This module is the single seam where all runtime dependencies are assembled
 * into a `Platform` object. browsersmith is the ONLY package in the stack
 * allowed to import `node:*` modules — every other package depends on the
 * `@browsercore/contracts` interfaces and receives implementations via
 * dependency injection through the Platform.
 *
 * Architecture:
 *
 *   browsersmith (composition root)
 *     └── createPlatform() assembles adapters
 *         ├── network:  node:net, node:dns, node:dgram
 *         ├── crypto:   @browsercore/crypto (Node-backed)
 *         ├── compression: @browsercore/compression (node:zlib-backed)
 *         ├── events:   node:events (EventEmitter)
 *         ├── telemetry: no-op (zero-cost default)
 *         └── time:     Date.now() + setTimeout
 *
 *   Protocol packages (tls, http1, http2, http3, quic, fetch)
 *     └── receive Platform via options — never import node:*
 *
 * The default `platform` singleton is built once in `wiring.ts` and threaded
 * down through options objects. Tests construct a Platform with mock adapters.
 */

import { nodeNet, nodeDns, nodeUdp } from "./network/node/index.js";
import { nodeCryptoProvider } from "./crypto/node/index.js";
import { nodeCompression } from "./compression/node/index.js";
import { nodeEventProvider } from "./events/node/index.js";
import { noOpTelemetry } from "./telemetry/noop/index.js";
import { nodeTime } from "./time/node/index.js";
import type {
    Platform as ContractPlatform,
    PlatformOptions as ContractPlatformOptions,
} from "@browsercore/contracts";

/** The Platform type — re-exported from @browsercore/contracts (single source of truth). */
export type Platform = ContractPlatform;

/** Platform override options — re-exported from @browsercore/contracts. */
export type PlatformOptions = ContractPlatformOptions;

/**
 * Build a Platform from the given options.
 *
 * Any option omitted falls back to the default Node.js implementation.
 * Call once at application startup (see `wiring.ts`) and thread the result
 * down through options objects.
 *
 * @param options - Override individual adapters. All fields optional.
 * @returns A fully-assembled Platform.
 *
 * @example
 * ```ts
 * // Production: all defaults.
 * const platform = createPlatform();
 *
 * // Test: inject a fake clock.
 * const platform = createPlatform({ time: fakeClock });
 * ```
 */
export function createPlatform(options?: PlatformOptions): Platform {
    return {
        network: {
            tcp: options?.network?.tcp ?? nodeNet,
            dns: options?.network?.dns ?? nodeDns,
            udp: options?.network?.udp ?? nodeUdp,
        },
        crypto: {
            provider: options?.crypto?.provider ?? nodeCryptoProvider,
        },
        compression: options?.compression ?? nodeCompression,
        events: options?.events ?? nodeEventProvider,
        telemetry: options?.telemetry ?? noOpTelemetry,
        time: options?.time ?? nodeTime,
    };
}
