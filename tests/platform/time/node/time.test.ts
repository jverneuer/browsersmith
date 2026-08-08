/**
 * Unit tests for the NodeTime platform adapter.
 *
 * Tests the actual implementation against the Time contract:
 * - now() returns epoch milliseconds (number)
 * - monotonicNow() returns a monotonic millisecond timestamp (number)
 * - sleep() resolves after the requested duration
 * - setTimeout() fires its callback and the returned cancel function aborts it
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NodeTime } from "../../../../src/platform/time/node/time.js";

describe("NodeTime", () => {
    let time: NodeTime;

    beforeEach(() => {
        time = new NodeTime();
    });

    describe("now()", () => {
        it("returns a number", () => {
            const result = time.now();
            expect(typeof result).toBe("number");
        });

        it("returns epoch milliseconds (positive, in a reasonable range)", () => {
            const result = time.now();
            expect(result).toBeGreaterThan(0);
            // Should be after 2020-01-01 and before 2100-01-01 in ms
            expect(result).toBeGreaterThan(1_577_836_800_000);
            expect(result).toBeLessThan(4_102_444_800_000);
        });

        it("returns a value that increases over time", () => {
            const a = time.now();
            const b = time.now();
            expect(b).toBeGreaterThanOrEqual(a);
        });
    });

    describe("monotonicNow()", () => {
        it("returns a number", () => {
            const result = time.monotonicNow();
            expect(typeof result).toBe("number");
        });

        it("returns a non-negative value", () => {
            const result = time.monotonicNow();
            expect(result).toBeGreaterThanOrEqual(0);
        });

        it("is monotonic — does not decrease between calls", () => {
            const samples: number[] = [];
            for (let i = 0; i < 10; i++) {
                samples.push(time.monotonicNow());
            }
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
            }
        });
    });

    describe("sleep()", () => {
        it("resolves after the requested duration", async () => {
            const start = Date.now();
            await time.sleep(50);
            const elapsed = Date.now() - start;
            // Allow generous tolerance for CI scheduling jitter
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });

        it("resolves (does not reject) for zero ms", async () => {
            await expect(time.sleep(0)).resolves.toBeUndefined();
        });
    });

    describe("setTimeout()", () => {
        it("fires the callback after the delay", async () => {
            const callback = vi.fn();
            time.setTimeout(callback, 20);

            expect(callback).not.toHaveBeenCalled();
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it("returns a cancel function that aborts the callback", async () => {
            const callback = vi.fn();
            const cancel = time.setTimeout(callback, 20);

            cancel();

            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(callback).not.toHaveBeenCalled();
        });

        it("passes no arguments to the callback", async () => {
            const callback = vi.fn();
            time.setTimeout(callback, 10);

            await new Promise((resolve) => setTimeout(resolve, 40));
            expect(callback).toHaveBeenCalledWith();
        });
    });

    describe("integration: monotonic vs now", () => {
        it("both advance over a short sleep", async () => {
            const monotonicBefore = time.monotonicNow();
            const nowBefore = time.now();

            await time.sleep(50);

            const monotonicAfter = time.monotonicNow();
            const nowAfter = time.now();

            expect(monotonicAfter).toBeGreaterThan(monotonicBefore);
            expect(nowAfter).toBeGreaterThan(nowBefore);
        });
    });
});
