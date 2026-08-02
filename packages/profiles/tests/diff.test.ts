import { describe, expect, it } from "vitest";
import { getProfile } from "../src/index.js";
import type { BrowserProfile, ProfileId } from "../src/types.js";
import { diffProfiles } from "../src/diff.js";

/**
 * Build a structurally-equal clone of a profile (same values, new references) so
 * the diff exercises value comparison rather than reference equality short-circuit.
 */
function clone(profile: BrowserProfile): BrowserProfile {
    return JSON.parse(JSON.stringify(profile)) as BrowserProfile;
}

describe("diffProfiles", () => {
    it("returns an empty diff for two structurally-identical profiles", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const b = clone(a);

        expect(diffProfiles(a, b)).toEqual([]);
    });

    it("reports exactly one diff when a single tls field (grease) differs", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const b: BrowserProfile = {
            ...a,
            tls: { ...a.tls, grease: false },
        };

        const diffs = diffProfiles(a, b);

        expect(diffs).toHaveLength(1);
        expect(diffs[0]?.path).toBe("tls.grease");
        expect(diffs[0]?.a).toBe(true);
        expect(diffs[0]?.b).toBe(false);
    });

    it("reports a diff when cipher suites are reordered", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const reordered = [...a.tls.cipherSuites].reverse();
        const b: BrowserProfile = {
            ...a,
            tls: { ...a.tls, cipherSuites: reordered },
        };

        const diffs = diffProfiles(a, b);

        // Reordering changes at least the first element.
        expect(diffs.some((d) => d.path === "tls.cipherSuites[0]")).toBe(true);
        expect(diffs.length).toBeGreaterThan(0);
    });

    it("reports a diff at the nested path when http2 settings differ", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const b: BrowserProfile = {
            ...a,
            http2: {
                ...a.http2,
                settings: {
                    ...a.http2.settings,
                    maxConcurrentStreams: 1,
                },
            },
        };

        const diffs = diffProfiles(a, b);

        expect(diffs).toContainEqual({
            path: "http2.settings.maxConcurrentStreams",
            a: 100,
            b: 1,
        });
    });

    it("ignores array order when compareArrayOrder is false", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const reordered = [...a.tls.cipherSuites].reverse();
        const b: BrowserProfile = {
            ...a,
            tls: { ...a.tls, cipherSuites: reordered },
        };

        const diffs = diffProfiles(a, b, { compareArrayOrder: false });

        expect(diffs).toEqual([]);
    });

    it("reports a top-level name/version diff", () => {
        const a = getProfile("chrome-140" as ProfileId);
        const b: BrowserProfile = { ...a, name: "firefox", version: "135.0" };

        const diffs = diffProfiles(a, b);

        expect(diffs).toContainEqual({ path: "name", a: "chrome", b: "firefox" });
        expect(diffs).toContainEqual({ path: "version", a: "140.0.7339.18", b: "135.0" });
    });
});
