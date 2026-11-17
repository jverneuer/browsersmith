/**
 * Tests for the wiring module (`src/wiring.ts`).
 *
 * The wiring module exports the singleton Platform. These tests verify that
 * the platform's time bundle (the canonical Clock) is defined and has the expected shape.
 */

import { describe, it, expect } from "vitest";
import { platform } from "../src/wiring.js";

describe("wiring", () => {
    it("exposes platform.time (the canonical Clock) with now method", () => {
        expect(platform.time).toBeDefined();
        expect(typeof platform.time.now).toBe("function");
    });

    it("platform.time.now returns a number", () => {
        const now = platform.time.now();
        expect(typeof now).toBe("number");
        expect(now).toBeGreaterThan(0);
    });
});
