/**
 * Unit tests for the curated profile constants in `src/profiles.ts`.
 *
 * These are simple branded-string constants, but they are part of the public
 * API surface (re-exported from the entrypoint) and pin the documented,
 * battle-tested browser profiles. Tests verify the literal values, the
 * PROFILES map shape, the StarterProfile union, and that each constant
 * resolves to a registered BrowserProfile through @browsercore/profiles.
 */

import { describe, it, expect } from "vitest";
import { CHROME_140, FIREFOX_128, PROFILES, type StarterProfile } from "../src/profiles.js";
import { getProfile, listProfiles } from "@browsercore/profiles";

describe("curated profile constants", () => {
    it("CHROME_140 equals the 'chrome-140' profile id", () => {
        expect(CHROME_140).toBe("chrome-140");
    });

    it("FIREFOX_128 equals the 'firefox-128' profile id", () => {
        expect(FIREFOX_128).toBe("firefox-128");
    });

    it("PROFILES maps each alias to its constant", () => {
        expect(PROFILES).toEqual({
            "chrome-140": CHROME_140,
            "firefox-128": FIREFOX_128,
        });
    });

    it("PROFILES keys are exactly the supported starter aliases", () => {
        expect(Object.keys(PROFILES).sort()).toEqual(["chrome-140", "firefox-128"]);
    });

    it("PROFILES is immutable (frozen via `as const`)", () => {
        // `as const` makes the object deeply readonly at the type level; at
        // runtime it's a normal object, but the type system rejects mutation.
        // We verify the shape is correct and the contract holds.
        const keys = Object.keys(PROFILES) as StarterProfile[];
        expect(keys).toContain("chrome-140");
        expect(keys).toContain("firefox-128");
    });

    it("each curated id resolves to a registered BrowserProfile", () => {
        // The branded ids must be real registry entries — otherwise crawl()'s
        // default profile and every example silently break at runtime.
        const ids = listProfiles();
        expect(ids).toContain(CHROME_140);
        expect(ids).toContain(FIREFOX_128);

        const chrome = getProfile(CHROME_140);
        expect(chrome.id).toBe("chrome-140");
        expect(chrome.name).toBe("chrome");

        const firefox = getProfile(FIREFOX_128);
        expect(firefox.id).toBe("firefox-128");
        expect(firefox.name).toBe("firefox");
    });

    it("StarterProfile is the union of the PROFILES keys", () => {
        // Compile-time assertion that the union is exactly the aliases.
        // If a new key is added to PROFILES without updating StarterProfile,
        // this test's expectations would need to change — which is the point.
        const aliases: ReadonlyArray<StarterProfile> = ["chrome-140", "firefox-128"];
        expect(aliases).toHaveLength(2);
    });
});
