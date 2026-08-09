/**
 * Node.js platform adapter for the {@link Time} contract.
 *
 * Wraps `Date.now()`, `process.hrtime.bigint()`, and `AbortSignal.timeout`
 * to satisfy the platform-agnostic Time interface. This is the canonical
 * time source for the entire stack; tests inject a fake clock for determinism.
 *
 * Structure matches `@browsercore/contracts` `Time { clock, scheduler }`:
 *   - `clock`     : wall time (Date.now) + monotonic (process.hrtime.bigint)
 *   - `scheduler` : delay, timeout, composable deadline via AbortSignal
 */

import { setTimeout as nodeDelay } from "node:timers/promises";
import type { Time, Duration } from "./time-types.js";

/**
 * Node.js implementation of the {@link Time} contract.
 *
 * `clock.now()` returns epoch ms (Date.now). `clock.monotonic()` returns
 * nanosecond monotonic time (process.hrtime.bigint) — for deltas only.
 * `scheduler` uses AbortSignal.timeout for composable cancellation.
 */
export const nodeTime: Time = {
    clock: {
        now: () => Date.now(),
        monotonic: () => process.hrtime.bigint(),
    },
    scheduler: {
        delay: (d: Duration, signal?: AbortSignal) =>
            nodeDelay(d.milliseconds, undefined, { signal, ref: false }),
        timeout: (d: Duration) => AbortSignal.timeout(d.milliseconds),
        deadline: (d: Duration) => ({
            signal: AbortSignal.timeout(d.milliseconds),
            expiresAt: process.hrtime.bigint() + BigInt(d.milliseconds) * 1_000_000n,
        }),
    },
};


