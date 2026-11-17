/**
 * Unit tests for the NodeTime platform adapter (the canonical Clock).
 *
 * Tests the actual implementation against the Time contract (contracts 0.2.6:
 * `Time = Clock` — the former `{ clock, scheduler }` bundle shape is gone):
 * - now() returns epoch milliseconds (number)
 * - monotonic() returns a monotonic MILLISECOND timestamp (number)
 * - sleep(ms) resolves after the requested duration
 * - setTimeout/clearTimeout provide the timer surface
 */

import { describe, it, expect } from "vitest";
import { nodeTime } from "../../../../src/platform/time/node/time.js";

describe("nodeTime", () => {
    describe("now()", () => {
        it("returns a number", () => {
            const result = nodeTime.now();
            expect(typeof result).toBe("number");
        });

        it("returns epoch milliseconds (positive, in a reasonable range)", () => {
            const result = nodeTime.now();
            expect(result).toBeGreaterThan(0);
            // Should be after 2020-01-01 and before 2100-01-01 in ms
            expect(result).toBeGreaterThan(1_577_836_800_000);
            expect(result).toBeLessThan(4_102_444_800_000);
        });

        it("returns a value that increases over time", () => {
            const a = nodeTime.now();
            const b = nodeTime.now();
            expect(b).toBeGreaterThanOrEqual(a);
        });
    });

    describe("monotonic()", () => {
        it("returns a number (milliseconds, per the canonical Clock unit contract)", () => {
            const result = nodeTime.monotonic();
            expect(typeof result).toBe("number");
        });

        it("returns a non-negative value", () => {
            expect(nodeTime.monotonic()).toBeGreaterThanOrEqual(0);
        });

        it("is monotonic — does not decrease between calls", () => {
            const samples: number[] = [];
            for (let i = 0; i < 10; i++) {
                samples.push(nodeTime.monotonic());
            }
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
            }
        });
    });

    describe("sleep()", () => {
        it("resolves after the requested duration", async () => {
            const start = Date.now();
            await nodeTime.sleep(50);
            const elapsed = Date.now() - start;
            // Allow generous tolerance for CI scheduling jitter
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });

        it("resolves (does not reject) for zero ms", async () => {
            await expect(nodeTime.sleep(0)).resolves.toBeUndefined();
        });
    });

    describe("setTimeout() / clearTimeout()", () => {
        it("runs fn once after the requested duration", async () => {
            let fired = 0;
            nodeTime.setTimeout(20, () => fired++);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 80);
            });
            expect(fired).toBe(1);
        });

        it("clearTimeout prevents fn from running", async () => {
            let fired = 0;
            const handle = nodeTime.setTimeout(20, () => fired++);
            nodeTime.clearTimeout(handle);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 80);
            });
            expect(fired).toBe(0);
        });
    });

    describe("integration: monotonic vs now", () => {
        it("both advance over a short delay", async () => {
            const monotonicBefore = nodeTime.monotonic();
            const nowBefore = nodeTime.now();

            await nodeTime.sleep(50);

            const monotonicAfter = nodeTime.monotonic();
            const nowAfter = nodeTime.now();

            expect(monotonicAfter).toBeGreaterThan(monotonicBefore);
            expect(nowAfter).toBeGreaterThan(nowBefore);
        });
    });
});
