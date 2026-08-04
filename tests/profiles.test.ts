/**
 * Unit tests for the curated starter profiles (`src/profiles.ts`).
 *
 * The file is deliberately tiny: it brands two string literals as `ProfileId`
 * and bundles them into the `PROFILES` constant map. These assertions pin the
 * exact values so a regression in the exported aliases fails the build, and
 * importing the module is what registers its coverage in `src/`.
 */

import { describe, it, expect } from "vitest";
import { CHROME_140, FIREFOX_128, PROFILES } from "../src/profiles.js";

describe("starter profiles", () => {
    it("CHROME_140 is the branded chrome-140 literal", () => {
        expect(CHROME_140).toBe("chrome-140");
    });

    it("FIREFOX_128 is the branded firefox-128 literal", () => {
        expect(FIREFOX_128).toBe("firefox-128");
    });

    it("PROFILES maps both documented aliases to their branded ids", () => {
        expect(PROFILES).toEqual({
            "chrome-140": "chrome-140",
            "firefox-128": "firefox-128",
        });
    });

    it("PROFILES values are exactly the named constants (identity, not copy)", () => {
        expect(PROFILES["chrome-140"]).toBe(CHROME_140);
        expect(PROFILES["firefox-128"]).toBe(FIREFOX_128);
    });

    it("PROFILES is frozen-shaped: only the two documented keys exist", () => {
        expect(Object.keys(PROFILES).sort()).toEqual(["chrome-140", "firefox-128"]);
    });
});
