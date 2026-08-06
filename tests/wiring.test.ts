/**
 * Tests for the wiring module (`src/wiring.ts`).
 *
 * The wiring module exports the default implementations of the injectable
 * dependencies (CryptoProvider, Logger, Clock). These tests verify that the
 * exports are defined and have the expected shape.
 */

import { describe, it, expect } from "vitest";
import { defaultLogger, defaultClock, devLogger } from "../src/wiring.js";

describe("wiring", () => {
    it("exports a defaultLogger with debug, warn, and error methods", () => {
        expect(defaultLogger).toBeDefined();
        expect(typeof defaultLogger.debug).toBe("function");
        expect(typeof defaultLogger.warn).toBe("function");
        expect(typeof defaultLogger.error).toBe("function");
    });

    it("defaultLogger methods are silent (no-op)", () => {
        // These should not throw
        expect(() => defaultLogger.debug("test")).not.toThrow();
        expect(() => defaultLogger.warn("test")).not.toThrow();
        expect(() => defaultLogger.error("test")).not.toThrow();
    });

    it("exports a devLogger with debug, warn, and error methods", () => {
        expect(devLogger).toBeDefined();
        expect(typeof devLogger.debug).toBe("function");
        expect(typeof devLogger.warn).toBe("function");
        expect(typeof devLogger.error).toBe("function");
    });

    it("exports a defaultClock with now method", () => {
        expect(defaultClock).toBeDefined();
        expect(typeof defaultClock.now).toBe("function");
    });

    it("defaultClock.now returns a number", () => {
        const now = defaultClock.now();
        expect(typeof now).toBe("number");
        expect(now).toBeGreaterThan(0);
    });
});
