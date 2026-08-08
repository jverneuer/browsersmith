/**
 * Node.js platform adapter for the {@link Time} contract.
 *
 * Wraps `Date.now()` and `setTimeout`/`clearTimeout` to satisfy the
 * platform-agnostic Time interface. This is the canonical time source for
 * the entire stack; tests inject a fake clock for determinism.
 */

import type { Time } from "./time-types.js";

/**
 * Node.js implementation of the {@link Time} contract.
 *
 * `now()` returns milliseconds since the Unix epoch (via `Date.now()`).
 * `setTimeout()` wraps Node's global `setTimeout` and returns a cancel
 * function. Both methods match the `@browsercore/contracts` Clock interface
 * so they can be used interchangeably.
 */
export class NodeTime implements Time {
    now(): number {
        return Date.now();
    }

    monotonicNow(): number {
        return performance.now();
    }

    setTimeout(callback: () => void, delayMs: number): () => void {
        const handle = setTimeout(callback, delayMs);
        return () => { clearTimeout(handle); };
    }

    sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}

/**
 * Default Node.js time instance.
 */
export const nodeTime = new NodeTime();
