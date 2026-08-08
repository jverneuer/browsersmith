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
import { nodeEventProvider, type EventProvider } from "./events/node/index.js";
import { noOpTelemetry, type Telemetry } from "./telemetry/noop/index.js";
import { nodeTime, type Time } from "./time/node/index.js";
import type { Net, DnsResolver, DatagramTransport, CryptoProvider } from "@browsercore/contracts";
import type { CompressionProvider } from "@browsercore/compression";

/**
 * The Platform object — the complete set of runtime dependencies.
 *
 * Every field is an implementation of a `@browsercore/contracts` interface
 * (or a browsersmith-local platform interface). Protocol packages consume
 * these via options injection, never importing `node:*` directly.
 */
export interface Platform {
    /** Network adapters: TCP, DNS, UDP. */
    readonly network: {
        /** TCP connection factory (wraps `node:net.connect`). */
        readonly tcp: Net;
        /** DNS resolver (wraps `node:dns.lookup`). */
        readonly dns: DnsResolver;
        /** UDP datagram transport (wraps `node:dgram`). */
        readonly udp: DatagramTransport;
    };
    /** Cryptographic primitives. */
    readonly crypto: {
        /** Crypto provider (wraps `node:crypto` via @browsercore/crypto). */
        readonly provider: CryptoProvider;
    };
    /** Compression/decompression (wraps `node:zlib`). */
    readonly compression: CompressionProvider;
    /** Inter-protocol event pub/sub. */
    readonly events: EventProvider;
    /** Metrics/observability backend. */
    readonly telemetry: Telemetry;
    /** Time source and scheduler. */
    readonly time: Time;
}

/**
 * Options for overriding individual platform adapters.
 *
 * Every field is optional — omit a field to use the default Node.js
 * implementation. Use this in tests to inject mocks, or in production
 * to swap in a custom telemetry backend, DoH resolver, etc.
 */
export interface PlatformOptions {
    /** Override network adapters. */
    readonly network?: {
        /** Override the TCP connection factory. */
        readonly tcp?: Net;
        /** Override the DNS resolver. */
        readonly dns?: DnsResolver;
        /** Override the UDP datagram transport. */
        readonly udp?: DatagramTransport;
    };
    /** Override crypto. */
    readonly crypto?: {
        /** Override the crypto provider. */
        readonly provider?: CryptoProvider;
    };
    /** Override compression. */
    readonly compression?: CompressionProvider;
    /** Override the event provider. */
    readonly events?: EventProvider;
    /** Override telemetry. */
    readonly telemetry?: Telemetry;
    /** Override the time source. */
    readonly time?: Time;
}

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
