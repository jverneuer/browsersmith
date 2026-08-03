/**
 * E2E: timeout and abort.
 *
 * Proves the fetch client's timeoutMs and AbortSignal paths fire correctly and
 * raise the typed errors, against the slow endpoint of the behavior fixture.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupBehavior, fetchBehavior, type BehaviorHarness } from "./fixtures/behavior-harness.js";
import { FetchTimeoutError, FetchError } from "@browsercore/fetch";

describe("e2e: timeout + abort", () => {
    let bh: BehaviorHarness;
    beforeEach(async () => {
        bh = await setupBehavior();
    });
    afterEach(async () => {
        await bh.close();
    });

    it("raises FetchTimeoutError when the server is slower than timeoutMs", async () => {
        // /slow?ms=500 waits 500ms; ask for a 100ms timeout.
        await expect(
            fetchBehavior(bh, "/slow?ms=500", { timeoutMs: 100 }),
        ).rejects.toBeInstanceOf(FetchTimeoutError);
    });

    it("succeeds when the server responds within timeoutMs", async () => {
        const res = await fetchBehavior(bh, "/slow?ms=50", { timeoutMs: 2_000 });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ waited: 50 });
    });

    it("cancels an in-flight request when the AbortSignal fires", async () => {
        const controller = new AbortController();
        const promise = fetchBehavior(bh, "/slow?ms=500", { signal: controller.signal });
        // Abort shortly after dispatch.
        setTimeout(() => {
            controller.abort();
        }, 30);
        await expect(promise).rejects.toBeInstanceOf(FetchError);
    });

    it("rejects immediately when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            fetchBehavior(bh, "/slow?ms=10", { signal: controller.signal }),
        ).rejects.toBeInstanceOf(FetchError);
    });
});
