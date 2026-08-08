/**
 * Unit tests for {@link NoOpTelemetry}.
 *
 * The no-op implementation silently drops every metric. These tests verify
 * that every method is callable with the documented signature and returns
 * without throwing, regardless of argument shape.
 */

import { describe, it, expect } from "vitest";
import { NoOpTelemetry, noOpTelemetry } from "../../../../src/platform/telemetry/noop/no-op-telemetry.js";

describe("NoOpTelemetry", () => {
    const telemetry = new NoOpTelemetry();

    describe("record", () => {
        it("does not throw when called with name and value", () => {
            expect(() => telemetry.record("http.requests.total", 1)).not.toThrow();
        });

        it("accepts an optional tags object", () => {
            expect(() => telemetry.record("http.requests.total", 5, { status: "200", route: "/" })).not.toThrow();
        });

        it("accepts zero and negative values", () => {
            expect(() => telemetry.record("counter", 0)).not.toThrow();
            expect(() => telemetry.record("counter", -1)).not.toThrow();
        });
    });

    describe("measure", () => {
        it("does not throw when called with name and duration", () => {
            expect(() => telemetry.measure("http.request.duration_ms", 42)).not.toThrow();
        });

        it("accepts an optional tags object", () => {
            expect(() => telemetry.measure("db.query.duration_ms", 120, { table: "users" })).not.toThrow();
        });

        it("accepts zero duration", () => {
            expect(() => telemetry.measure("fast.op", 0)).not.toThrow();
        });
    });

    describe("gauge", () => {
        it("does not throw when called with name and value", () => {
            expect(() => telemetry.gauge("pool.connections.active", 7)).not.toThrow();
        });

        it("accepts an optional tags object", () => {
            expect(() => telemetry.gauge("queue.depth", 3, { queue: "fetch" })).not.toThrow();
        });

        it("accepts floating-point values", () => {
            expect(() => telemetry.gauge("cpu.usage", 0.73)).not.toThrow();
        });
    });

    describe("is a valid Telemetry implementation", () => {
        it("returns void from every method", () => {
            expect(telemetry.record("m", 1)).toBeUndefined();
            expect(telemetry.measure("m", 1)).toBeUndefined();
            expect(telemetry.gauge("m", 1)).toBeUndefined();
        });
    });
});

describe("noOpTelemetry singleton", () => {
    it("is an instance of NoOpTelemetry", () => {
        expect(noOpTelemetry).toBeInstanceOf(NoOpTelemetry);
    });

    it("exposes the same metrics surface", () => {
        expect(typeof noOpTelemetry.record).toBe("function");
        expect(typeof noOpTelemetry.measure).toBe("function");
        expect(typeof noOpTelemetry.gauge).toBe("function");
    });

    it("is safe to call repeatedly", () => {
        expect(() => {
            for (let i = 0; i < 1000; i++) {
                noOpTelemetry.record("counter", i);
                noOpTelemetry.measure("timer", i);
                noOpTelemetry.gauge("gauge", i);
            }
        }).not.toThrow();
    });
});
