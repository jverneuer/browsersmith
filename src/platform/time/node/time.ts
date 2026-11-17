/**
 * Node.js implementation of the {@link Time} contract (the canonical Clock).
 *
 * `now()` returns epoch ms (Date.now). `monotonic()` returns monotonic time
 * in MILLISECONDS (process.hrtime.bigint scaled down) — for deltas only, per
 * the canonical Clock's unit contract. `sleep`/`setTimeout`/`clearTimeout`
 * route onto `node:timers` with unref'd sleeps: politeness delays must not
 * pin the process open.
 */

import type { Time } from "@browsercore/contracts";

export const nodeTime: Time = {
    now: () => Date.now(),
    monotonic: () => Number(process.hrtime.bigint() / 1_000_000n),
    sleep: (ms) =>
        new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms);
            timer.unref();
        }),
    setTimeout: (ms, fn) => setTimeout(fn, ms),
    clearTimeout: (handle) => {
        clearTimeout(handle as NodeJS.Timeout);
    },
};
