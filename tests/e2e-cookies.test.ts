/**
 * E2E: cookie jar round-trip.
 *
 * Proves Set-Cookie headers from a response land in the shared jar and are
 * replayed on subsequent requests to the same origin — the session-continuity
 * primitive every crawler relies on. Drives the real fetch client against the
 * fixture server over loopback.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupHarness, fetchPath, withBrowserHeaders, type Harness } from "./fixtures/harness.js";

describe("e2e: cookie jar", () => {
    let h: Harness;
    beforeEach(async () => {
        h = await setupHarness();
    });
    afterEach(async () => {
        await h.close();
    });

    it("stores a Set-Cookie from the server and replays it", async () => {
        // The fixture's challenge flow sets bc_challenge via Set-Cookie. After
        // the first /protected hit, the jar must hold it.
        await fetchPath(h, "/protected", withBrowserHeaders());
        const cookies = h.jar.getCookies({
            hostname: "localhost",
            pathname: "/protected",
            protocol: "http:",
        });
        const names = cookies.map((c) => c.name);
        expect(names).toContain("bc_challenge");
    });

    it("reuses the jar across requests to the same origin", async () => {
        // First request sets the cookie; second request to /protected should
        // carry it automatically and clear the challenge.
        await fetchPath(h, "/protected", withBrowserHeaders());
        const second = await fetchPath(h, "/protected", withBrowserHeaders());
        expect(second.status).toBe(200);
    });

    it("a fresh jar does not carry cookies from a previous session", async () => {
        await fetchPath(h, "/protected", withBrowserHeaders());
        // After closing, a new harness has a fresh jar — challenge must reissue.
        await h.close();
        h = await setupHarness();
        const first = await fetchPath(h, "/protected", withBrowserHeaders());
        expect(first.status).toBe(403);
    });
});
