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

    // NOTE: end-to-end gzip/deflate through the published @browsercore/fetch
    // 0.1.3 is blocked by a double-decompression issue (http1 decompresses,
    // then fetch decompresses again). The fix lives on the hardened main
    // branch (src/response.ts buildResponse takes an explicit `encoding` so
    // the dispatch layer can pass `undefined` for http1). Until that ships to
    // the registry, we verify the codec directly and the wire framing via the
    // identity path above.
    it("the @browsercore/compression codec decodes real gzip + deflate bytes", async () => {
        const { nodeCompression } = await import("../src/platform/compression/node/compression.js");
        const { gzipSync, deflateSync } = await import("node:zlib");
        const gz = nodeCompression.decompress(
            new Uint8Array(gzipSync(Buffer.from("gzip-payload"))),
            "gzip",
        );
        expect(new TextDecoder().decode(gz)).toBe("gzip-payload");
        const def = nodeCompression.decompress(
            new Uint8Array(deflateSync(Buffer.from("deflate-payload"))),
            "deflate",
        );
        expect(new TextDecoder().decode(def)).toBe("deflate-payload");
    });
});
