/**
 * Lazy-construction proofs for the wiring module (`src/wiring.ts`).
 *
 * The default `platform` is a forwarding view over a memoized instance
 * assembled on FIRST bundle access (replaceability audit 2026-11-16,
 * remediation item #7: module-load side effects defeat Workers/edge
 * tree-shaking). This file pins that contract:
 *
 *   - MECHANISM: every bundle is an accessor property (a getter). An eager
 *     `export const platform = createPlatform()` produces plain data
 *     properties — the presence of `get` accessors is directly observable
 *     and is what lets bundlers drop the assembly when nothing reads it.
 *   - MEMOIZATION: repeated reads return the identical bundle objects.
 *     `createPlatform()` builds FRESH wrapper objects on every call (e.g. a
 *     new `network` bundle per assembly), so identity across accesses is
 *     only possible if exactly ONE assembly ever happened — a per-access
 *     re-assembly would fail these comparisons.
 *   - FORWARDING: the getters resolve to the default Node adapters.
 *
 * (Construction-counting via `vi.mock` of the local platform module is not
 * available here: this vitest setup only applies module mocks to node:
 * builtins and externalized packages, not local source files. Wrapper
 * identity gives the same single-assembly guarantee without it; the
 * event-provider lazy singleton — whose deferred work IS countable via a
 * node:events mock — is proven in event-provider-lazy.test.ts.)
 */

import { describe, expect, it } from "vitest";
import {
    defaultTlsHandshakeEngine,
    nodeCompression,
    nodeCryptoProvider,
    nodeDns,
    nodeEventProvider,
    nodeNet,
    nodeTime,
    nodeUdp,
    noOpTelemetry,
    platform,
} from "../src/wiring.js";

describe("wiring — lazy default platform", () => {
    it("exposes every bundle as a getter (the lazy mechanism, not a data property)", () => {
        for (const bundle of ["network", "crypto", "compression", "events", "telemetry", "time"] as const) {
            const descriptor = Object.getOwnPropertyDescriptor(platform, bundle);
            expect(descriptor, `platform.${bundle} must exist`).toBeDefined();
            expect(typeof descriptor?.get, `platform.${bundle} must be an accessor`).toBe("function");
            expect(descriptor?.set, `platform.${bundle} must stay read-only`).toBeUndefined();
        }
    });

    it("repeated reads return the identical bundle objects (single memoized assembly)", () => {
        expect(platform.network).toBe(platform.network);
        expect(platform.crypto).toBe(platform.crypto);
        expect(platform.compression).toBe(platform.compression);
        expect(platform.events).toBe(platform.events);
        expect(platform.telemetry).toBe(platform.telemetry);
        expect(platform.time).toBe(platform.time);
    });

    it("the getters forward to the default Node adapters", () => {
        expect(platform.network?.tcp).toBe(nodeNet);
        expect(platform.network?.dns).toBe(nodeDns);
        expect(platform.network?.udp).toBe(nodeUdp);
        expect(platform.crypto?.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
        expect(platform.telemetry).toBe(noOpTelemetry);
        expect(platform.time).toBe(nodeTime);
    });

    it("bundle reads are stable across accesses (same object back)", () => {
        expect(platform.time).toBe(platform.time);
    });
});

describe("wiring — default TLS handshake engine", () => {
    it("defaultTlsHandshakeEngine is memoized (single shared instance)", () => {
        expect(defaultTlsHandshakeEngine()).toBe(defaultTlsHandshakeEngine());
    });
});
