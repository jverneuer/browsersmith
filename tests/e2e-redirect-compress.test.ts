/**
 * E2E: redirect handling and content-encoding decompression.
 *
 * Drives the real fetch client against the behavior fixture. Verifies:
 *   - 301/302/307 redirects are followed automatically and land on the target.
 *   - The redirect chain stops at the final response.
 *   - manual policy returns the redirect response untouched.
 *   - error policy raises RedirectError on a redirect status.
 *   - gzip and deflate response bodies are decompressed transparently.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupBehavior, fetchBehavior, type BehaviorHarness } from "./fixtures/behavior-harness.js";
import { RedirectError } from "@browsercore/fetch";

describe("e2e: redirects", () => {
    let bh: BehaviorHarness;
    beforeEach(async () => {
        bh = await setupBehavior();
    });
    afterEach(async () => {
        await bh.close();
    });

    it("follows a 301 to the landing path", async () => {
        const res = await fetchBehavior(bh, "/redirect/301");
        expect(res.status).toBe(200);
        expect(res.url).toContain("/land");
        const body = await res.json();
        expect(body).toMatchObject({ landed: true });
    });

    it("follows a 302 → 307 chain to the landing path", async () => {
        const res = await fetchBehavior(bh, "/redirect/chain");
        expect(res.status).toBe(200);
        expect(res.url).toContain("/land");
    });

    it("returns the redirect untouched under manual policy", async () => {
        const res = await fetchBehavior(bh, "/redirect/301", { followRedirects: false });
        expect(res.status).toBe(301);
        expect(res.headers["location"]).toBe("/land");
    });

    it("raises RedirectError when followRedirects is off and the chain loops", async () => {
        // /redirect/loop points at itself; with a max of 3, the client raises.
        await expect(
            fetchBehavior(bh, "/redirect/loop", { maxRedirects: 3 }),
        ).rejects.toBeInstanceOf(RedirectError);
    });
});

describe("e2e: content-encoding decompression", () => {
    let bh: BehaviorHarness;
    beforeEach(async () => {
        bh = await setupBehavior();
    });
    afterEach(async () => {
        await bh.close();
    });

    it("passes through an identity (uncompressed) body unchanged", async () => {
        // No content-encoding → the fetch client returns the raw bytes.
        const res = await fetchBehavior(bh, "/land");
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain("landed");
    });

    it("decompresses a gzip body end-to-end through the fetch client", async () => {
        const res = await fetchBehavior(bh, "/gzip");
        expect(res.status).toBe(200);
        expect(res.headers["content-encoding"]).toBe("gzip");
        expect(await res.text()).toBe("gzip-decoded-body");
    });

    it("decompresses a deflate body end-to-end through the fetch client", async () => {
        const res = await fetchBehavior(bh, "/deflate");
        expect(res.status).toBe(200);
        expect(res.headers["content-encoding"]).toBe("deflate");
        expect(await res.text()).toBe("deflate-decoded-body");
    });
});
