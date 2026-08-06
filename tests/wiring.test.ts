/**
 * Tests for the wiring module (`src/wiring.ts`).
 *
 * The wiring module exports the default implementations of the injectable
 * dependencies (CryptoProvider, Clock). These tests verify that the exports
 * are defined and have the expected shape.
 */

import { describe, it, expect } from "vitest";
import { defaultClock } from "../src/wiring.js";

describe("wiring", () => {
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
