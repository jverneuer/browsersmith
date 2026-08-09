/**
 * Tests for the wiring module (`src/wiring.ts`).
 *
 * The wiring module exports the singleton Platform. These tests verify that
 * the platform's time clock is defined and has the expected shape.
 */

import { describe, it, expect } from "vitest";
import { platform } from "../src/wiring.js";

describe("wiring", () => {
    it("exposes a platform.time.clock with now method", () => {
        expect(platform.time.clock).toBeDefined();
        expect(typeof platform.time.clock.now).toBe("function");
    });

    it("platform.time.clock.now returns a number", () => {
        const now = platform.time.clock.now();
        expect(typeof now).toBe("number");
        expect(now).toBeGreaterThan(0);
    });
});
