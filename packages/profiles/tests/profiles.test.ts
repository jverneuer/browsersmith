import { describe, expect, it } from "vitest";
import {
    getProfile,
    listProfiles,
    registerProfile,
    UnknownProfileError,
} from "../src/index.js";
import type { BrowserProfile, ProfileId } from "../src/types.js";

describe("profiles registry", () => {
    it("returns a known Chrome profile by id", () => {
        const profile = getProfile("chrome-140" as ProfileId);

        expect(profile.id).toBe("chrome-140");
        expect(profile.name).toBe("chrome");
        expect(profile.tls.grease).toBe(true);
        expect(profile.http2.initialWindowSize).toBeGreaterThan(0);
        expect(profile.http1.defaultHeaders["user-agent"]).toContain("Chrome/140");
    });

    it("returns a known Firefox profile by id", () => {
        const profile = getProfile("firefox-135" as ProfileId);

        expect(profile.name).toBe("firefox");
        expect(profile.tls.grease).toBe(false);
    });

    it("returns a known Safari profile by id", () => {
        const profile = getProfile("safari-18" as ProfileId);

        expect(profile.name).toBe("safari");
        expect(profile.http1.defaultHeaders["user-agent"]).toContain("Version/18.1");
    });

    it("returns a known Edge profile by id", () => {
        const profile = getProfile("edge-128" as ProfileId);

        expect(profile.name).toBe("edge");
        expect(profile.http1.defaultHeaders["user-agent"]).toContain("Edg/128");
    });

    it("throws UnknownProfileError for an unknown id", () => {
        expect(() => getProfile("opera-1" as ProfileId)).toThrow(UnknownProfileError);
    });

    it("listProfiles is non-empty and contains known ids", () => {
        const ids = listProfiles();

        expect(ids.length).toBeGreaterThan(0);
        expect(ids).toContain("chrome-140");
        expect(ids).toContain("firefox-120");
        expect(ids).toContain("safari-17");
        expect(ids).toContain("edge-128");
    });

    it("registerProfile adds a custom profile", () => {
        const custom: BrowserProfile = {
            id: "custom-1" as ProfileId,
            name: "chrome",
            version: "999.0",
            tls: {
                cipherSuites: ["TLS_AES_128_GCM_SHA256"],
                extensionOrder: [0, 51],
                supportedVersions: ["TLS 1.3"],
                keyShareGroups: ["x25519"],
                signatureAlgorithms: ["ecdsa_secp256r1_sha256"],
                grease: false,
            },
            http2: {
                settings: {},
                initialWindowSize: 65535,
                maxFrameSize: 16384,
                headerTableSize: 4096,
                weight: 16,
            },
            http1: {
                defaultHeaders: {},
                headerOrder: ["host"],
                connection: "keep-alive",
                acceptEncoding: "gzip",
            },
        };

        registerProfile(custom);

        expect(getProfile("custom-1" as ProfileId)).toBe(custom);
        expect(listProfiles()).toContain("custom-1");
    });
});
