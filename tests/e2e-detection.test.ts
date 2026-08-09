/**
 * E2E: crawler-detection defeat.
 *
 * The headline test. Proves that when browsercore fetches with the Chrome
 * profile, the bot-detection fixture (a) accepts the request and (b) the
 * recorded wire signals match a real browser — correct UA, correct header
 * order, all required headers present. Conversely, a non-browser UA / header
 * set is rejected with 403. That is the entire premise of the stack.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "@browsercore/fetch";
import { setupHarness, fetchPath, withBrowserHeaders, BOT_UA, type Harness } from "./fixtures/harness.js";
import { loopbackTransportFactory } from "./fixtures/fake-transport.js";
import { ACCEPTED_USER_AGENTS } from "./fixtures/bot-server.js";
import { NodeEventProvider } from "../src/platform/events/node/event-provider.js";

describe("e2e: crawler-detection defeat", () => {
    let h: Harness;
    beforeEach(async () => {
        h = await setupHarness();
    });
    afterEach(async () => {
        await h.close();
    });

    it("a real-browser profile is accepted on a non-protected path", async () => {
        const res = await fetchPath(h, "/", withBrowserHeaders());
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain("ok");
    });

    it("records a browser-correct UA in the signal log", async () => {
        await fetchPath(h, "/", withBrowserHeaders());
        const last = h.state.log.last();
        expect(last).toBeDefined();
        expect(last?.userAgentAccepted).toBe(true);
        // The recorded UA must be one of the accepted browser UAs.
        expect(ACCEPTED_USER_AGENTS).toContain(last?.userAgent);
    });

    it("records browser-correct header order", async () => {
        await fetchPath(h, "/", withBrowserHeaders());
        const last = h.state.log.last();
        expect(last?.headerOrderAccepted).toBe(true);
        // The canonical browser headers appear in the expected relative order.
        const names = last?.headerOrder.map((n) => n.toLowerCase()) ?? [];
        const uaIdx = names.indexOf("user-agent");
        const acceptIdx = names.indexOf("accept");
        const langIdx = names.indexOf("accept-language");
        const encIdx = names.indexOf("accept-encoding");
        expect(uaIdx).toBeGreaterThanOrEqual(0);
        expect(acceptIdx).toBeGreaterThan(uaIdx);
        expect(langIdx).toBeGreaterThan(acceptIdx);
        expect(encIdx).toBeGreaterThan(langIdx);
    });

    it("rejects a non-browser User-Agent with 403", async () => {
        const res = await fetchPath(
            h,
            "/",
            withBrowserHeaders({ "user-agent": BOT_UA }),
        );
        expect(res.status).toBe(403);
        const last = h.state.log.last();
        expect(last?.userAgentAccepted).toBe(false);
        expect(last?.status).toBe(403);
    });

    it("requires all browser headers — a sparse bot request is rejected", async () => {
        // A client that sends only a UA (no accept/accept-language/accept-encoding)
        // looks like a sparse bot client → the fixture rejects it. We omit the
        // profile here so its defaults don't backfill the missing headers.
        const botClient = createClient({
            events: new NodeEventProvider(),
            transportFactory: loopbackTransportFactory(h.port),
        });
        const res = await botClient.fetch(`${h.baseUrl}/`, {
            headers: { "user-agent": BOT_UA },
        });
        expect(res.status).toBe(403);
        expect(h.state.log.last()?.hasRequiredHeaders).toBe(false);
        await botClient.close();
    });

    it("the protected path clears the challenge on the second request", async () => {
        // First hit /protected → 403 challenge page (sets bc_challenge cookie).
        const first = await fetchPath(h, "/protected", withBrowserHeaders());
        expect(first.status).toBe(403);
        const firstBody = await first.text();
        expect(firstBody).toContain("challenge issued");

        // The cookie jar stored the challenge cookie → second request clears it.
        const second = await fetchPath(h, "/protected", withBrowserHeaders());
        expect(second.status).toBe(200);
        const secondBody = await second.text();
        expect(secondBody).toContain("challenge cleared");
    });
});
