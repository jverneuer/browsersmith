/**
 * Tests for the platform composition root (`createPlatform`).
 *
 * `createPlatform` is the single seam where all runtime dependencies are
 * assembled into a `Platform` object. These tests verify that the builder
 * wires every default adapter correctly and that partial overrides compose
 * without clobbering untouched fields.
 *
 * The 6 platform surfaces are:
 *   network (tcp, dns, udp), crypto, compression, events, telemetry, time.
 */

import { describe, it, expect } from "vitest";
import { createPlatform } from "../../src/platform/index.js";
import {
    nodeNet,
    nodeDns,
    nodeUdp,
} from "../../src/platform/network/node/index.js";
import { nodeCryptoProvider } from "../../src/platform/crypto/node/index.js";
import { nodeCompression } from "../../src/platform/compression/node/index.js";
import { nodeEventProvider } from "../../src/platform/events/node/index.js";
import { noOpTelemetry } from "../../src/platform/telemetry/noop/index.js";
import { nodeTime } from "../../src/platform/time/node/index.js";
import type { Net, Socket, ConnectOptions } from "@browsercore/contracts";
import type { Time } from "../../src/platform/time/node/index.js";
import type { Telemetry } from "../../src/platform/telemetry/noop/index.js";
import type { EventProvider } from "../../src/platform/events/node/index.js";

// ---------------------------------------------------------------------------
// Mock adapters — explicitly typed so the compiler validates conformance.
// ---------------------------------------------------------------------------

const mockSocket: Socket = {
    write: () => true,
    end: () => {},
    destroy: () => {},
    destroyed: false,
    once: () => {},
    on: () => {},
};

const mockNet: Net = {
    connect: () => mockSocket,
};

const mockTime: Time = {
    now: () => 1_700_000_000_000,
    monotonicNow: () => 0,
    setTimeout: () => () => {},
    sleep: () => Promise.resolve(),
};

const mockTelemetry: Telemetry = {
    record: () => {},
    measure: () => {},
    gauge: () => {},
};

const mockEvents: EventProvider = {
    on: () => {},
    off: () => {},
    emit: () => false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPlatform", () => {
    it("populates all 6 platform surfaces by default", () => {
        const platform = createPlatform();

        expect(platform.network).toBeDefined();
        expect(platform.network.tcp).toBeDefined();
        expect(platform.network.dns).toBeDefined();
        expect(platform.network.udp).toBeDefined();
        expect(platform.crypto).toBeDefined();
        expect(platform.crypto.provider).toBeDefined();
        expect(platform.compression).toBeDefined();
        expect(platform.events).toBeDefined();
        expect(platform.telemetry).toBeDefined();
        expect(platform.time).toBeDefined();
    });

    it("uses the expected singleton for each default adapter", () => {
        const platform = createPlatform();

        expect(platform.network.tcp).toBe(nodeNet);
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
        expect(platform.telemetry).toBe(noOpTelemetry);
        expect(platform.time).toBe(nodeTime);
    });

    it("overrides network.tcp while keeping other network adapters default", () => {
        const platform = createPlatform({ network: { tcp: mockNet } });

        expect(platform.network.tcp).toBe(mockNet);
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        // Other surfaces untouched.
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
        expect(platform.telemetry).toBe(noOpTelemetry);
        expect(platform.time).toBe(nodeTime);
    });

    it("overrides time while keeping every other surface default", () => {
        const platform = createPlatform({ time: mockTime });

        expect(platform.time).toBe(mockTime);
        expect(platform.network.tcp).toBe(nodeNet);
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
        expect(platform.telemetry).toBe(noOpTelemetry);
    });

    it("overrides telemetry while keeping every other surface default", () => {
        const platform = createPlatform({ telemetry: mockTelemetry });

        expect(platform.telemetry).toBe(mockTelemetry);
        expect(platform.network.tcp).toBe(nodeNet);
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
        expect(platform.time).toBe(nodeTime);
    });

    it("composes multiple overrides without clobbering untouched fields", () => {
        const platform = createPlatform({
            network: { tcp: mockNet },
            time: mockTime,
            telemetry: mockTelemetry,
        });

        // Overrides applied.
        expect(platform.network.tcp).toBe(mockNet);
        expect(platform.time).toBe(mockTime);
        expect(platform.telemetry).toBe(mockTelemetry);

        // Untouched fields remain the default singletons.
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.events).toBe(nodeEventProvider);
    });

    it("overrides events while keeping every other surface default", () => {
        const platform = createPlatform({ events: mockEvents });

        expect(platform.events).toBe(mockEvents);
        expect(platform.network.tcp).toBe(nodeNet);
        expect(platform.network.dns).toBe(nodeDns);
        expect(platform.network.udp).toBe(nodeUdp);
        expect(platform.crypto.provider).toBe(nodeCryptoProvider);
        expect(platform.compression).toBe(nodeCompression);
        expect(platform.telemetry).toBe(noOpTelemetry);
        expect(platform.time).toBe(nodeTime);
    });
});
