/**
 * Unit tests for the NodeTime platform adapter.
 *
 * Tests the actual implementation against the Time contract:
 - clock.now() returns epoch milliseconds (number)
 * - clock.monotonic() returns a monotonic nanosecond timestamp (bigint)
 * - scheduler.delay() resolves after the requested duration
 * - scheduler.timeout() fires its signal after the delay
 * - scheduler.deadline() returns a composable AbortSignal
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { nodeTime } from "../../../../src/platform/time/node/time.js";
import { Duration } from "@browsercore/contracts";

describe("nodeTime", () => {
    const { clock, scheduler } = nodeTime;

    describe("clock.now()", () => {
        it("returns a number", () => {
            const result = clock.now();
            expect(typeof result).toBe("number");
        });

        it("returns epoch milliseconds (positive, in a reasonable range)", () => {
            const result = clock.now();
            expect(result).toBeGreaterThan(0);
            // Should be after 2020-01-01 and before 2100-01-01 in ms
            expect(result).toBeGreaterThan(1_577_836_800_000);
            expect(result).toBeLessThan(4_102_444_800_000);
        });

        it("returns a value that increases over time", () => {
            const a = clock.now();
            const b = clock.now();
            expect(b).toBeGreaterThanOrEqual(a);
        });
    });

    describe("clock.monotonic()", () => {
        it("returns a bigint", () => {
            const result = clock.monotonic();
            expect(typeof result).toBe("bigint");
        });

        it("returns a non-negative value", () => {
            const result = clock.monotonic();
            expect(result).toBeGreaterThanOrEqual(0n);
        });

        it("is monotonic — does not decrease between calls", () => {
            const samples: bigint[] = [];
            for (let i = 0; i < 10; i++) {
                samples.push(clock.monotonic());
            }
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
            }
        });
    });

    describe("scheduler.delay()", () => {
        it("resolves after the requested duration", async () => {
            const start = Date.now();
            await scheduler.delay(Duration.milliseconds(50));
            const elapsed = Date.now() - start;
            // Allow generous tolerance for CI scheduling jitter
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });

        it("resolves (does not reject) for zero ms", async () => {
            await expect(scheduler.delay(Duration.milliseconds(0))).resolves.toBeUndefined();
        });
    });

    describe("scheduler.timeout()", () => {
        it("returns an AbortSignal that fires after the delay", async () => {
            const signal = scheduler.timeout(Duration.milliseconds(20));
            expect(signal.aborted).toBe(false);

            await new Promise<void>((resolve) => {
                signal.addEventListener("abort", () => resolve(), { once: true });
            });
            expect(signal.aborted).toBe(true);
        });
    });

    describe("scheduler.deadline()", () => {
        it("returns a composable deadline with signal and expiresAt", () => {
            const deadline = scheduler.deadline(Duration.seconds(5));
            expect(deadline.signal).toBeInstanceOf(AbortSignal);
            expect(typeof deadline.expiresAt).toBe("bigint");
            expect(deadline.expiresAt).toBeGreaterThan(0n);
        });
    });

    describe("integration: monotonic vs now", () => {
        it("both advance over a short delay", async () => {
            const monotonicBefore = clock.monotonic();
            const nowBefore = clock.now();

            await scheduler.delay(Duration.milliseconds(50));

            const monotonicAfter = clock.monotonic();
            const nowAfter = clock.now();

            expect(monotonicAfter).toBeGreaterThan(monotonicBefore);
            expect(nowAfter).toBeGreaterThan(nowBefore);
        });
    });
});
