/**
 * Tests for the `browsersmith/core` entry (`src/core.ts`).
 *
 * The core entry is the runtime-free surface: fetch re-exports, profiles,
 * cookies, and the contracts types an edge consumer composes against — and
 * NOTHING from the Node composition root. These tests pin the surface: the
 * runtime-free API is present, and every platform adapter / Node-only symbol
 * is absent. (The complementary dist-level proof — zero `node:` strings in
 * the built core entry — lives in CI/gate greps, not runtime assertions.)
 */

import { describe, expect, it } from "vitest";
import * as core from "../src/core.js";

describe("browsersmith/core entry", () => {
    it("exports the runtime-free surface (fetch, profiles, cookies)", () => {
        expect(typeof core.fetch).toBe("function");
        expect(typeof core.createClient).toBe("function");
        expect(typeof core.getProfile).toBe("function");
        expect(typeof core.listProfiles).toBe("function");
        expect(typeof core.registerProfile).toBe("function");
        expect(typeof core.createCookieJar).toBe("function");
        expect(typeof core.serializeJar).toBe("function");
        expect(typeof core.deserializeJar).toBe("function");
        expect(core.PROFILES).toBeDefined();
    });

    it("exports the fetch error hierarchy", () => {
        expect(typeof core.FetchError).toBe("function");
        expect(typeof core.FetchProxyError).toBe("function");
        expect(typeof core.FetchTimeoutError).toBe("function");
        expect(typeof core.ProtocolError).toBe("function");
        expect(typeof core.RedirectError).toBe("function");
    });

    it("does NOT export the Node composition root, adapters, or node-only helpers", () => {
        const surface = core as unknown as Record<string, unknown>;
        const banned = [
            "platform",
            "createPlatform",
            "createTlsHandshakeEngine",
            "defaultTlsHandshakeEngine",
            "nodeNet",
            "nodeDns",
            "nodeUdp",
            "nodeCryptoProvider",
            "nodeCompression",
            "nodeEventProvider",
            "nodeTime",
            "noOpTelemetry",
            "crawl",
            "connectQuic",
            "connectHttp3",
            "connectViaProxy",
            "parseProxyUrl",
        ];
        for (const symbol of banned) {
            expect(surface[symbol], `core must not export ${symbol}`).toBeUndefined();
        }
    });
});
