/**
 * Unit tests for {@link NoOpTelemetry}.
 *
 * The no-op implementation silently drops every log, trace, and metric call.
 * These tests verify that every method is callable with the documented
 * signature and returns without throwing, regardless of argument shape.
 */

import { describe, it, expect } from "vitest";
import { noOpTelemetry } from "../../../../src/platform/telemetry/noop/no-op-telemetry.js";

describe("noOpTelemetry", () => {
    describe("logger", () => {
        it("does not throw on debug/info/warn/error", () => {
            expect(() => {
                noOpTelemetry.logger.debug("msg", { key: "value" });
                noOpTelemetry.logger.info("msg", { key: "value" });
                noOpTelemetry.logger.warn("msg", { key: "value" });
                noOpTelemetry.logger.error("msg", { key: "value" });
            }).not.toThrow();
        });

        it("accepts messages without attributes", () => {
            expect(() => noOpTelemetry.logger.info("plain message")).not.toThrow();
        });
    });

    describe("tracer", () => {
        it("returns a span from startSpan", () => {
            const span = noOpTelemetry.tracer.startSpan("test.span");
            expect(span).toBeDefined();
            expect(typeof span.setAttribute).toBe("function");
            expect(typeof span.end).toBe("function");
        });

        it("span setAttribute and end do not throw", () => {
            expect(() => {
                const span = noOpTelemetry.tracer.startSpan("test", { key: "value" });
                span.setAttribute("extra", 42);
                span.end();
            }).not.toThrow();
        });
    });

    describe("metrics", () => {
        it("does not throw when called with name and value", () => {
            expect(() => noOpTelemetry.metrics.add("http.requests.total", 1)).not.toThrow();
        });

        it("accepts optional attributes", () => {
            expect(() => noOpTelemetry.metrics.add("http.requests.total", 5, { status: "200" })).not.toThrow();
        });

        it("accepts zero and negative values", () => {
            expect(() => noOpTelemetry.metrics.add("counter", 0)).not.toThrow();
            expect(() => noOpTelemetry.metrics.add("counter", -1)).not.toThrow();
        });
    });

    describe("is a valid Telemetry implementation", () => {
        it("returns void from every method", () => {
            expect(noOpTelemetry.logger.info("m")).toBeUndefined();
            expect(noOpTelemetry.tracer.startSpan("m").end()).toBeUndefined();
            expect(noOpTelemetry.metrics.add("m", 1)).toBeUndefined();
        });

        it("is safe to call repeatedly", () => {
            expect(() => {
                for (let i = 0; i < 1000; i++) {
                    noOpTelemetry.logger.info("log", { i });
                    noOpTelemetry.tracer.startSpan("span").end();
                    noOpTelemetry.metrics.add("counter", i);
                }
            }).not.toThrow();
        });
    });
});
