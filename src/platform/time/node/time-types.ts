/**
 * Platform-agnostic time interface.
 *
 * Extends the Clock contract with a monotonic timer and a sleep helper.
 * Injected for deterministic tests (e.g. QUIC handshake timeouts).
 */

export interface Time {
    /**
     * Current time in milliseconds since the Unix epoch.
     * Same unit as `Date.now()`.
     */
    now(): number;

    /**
     * Monotonic clock in milliseconds (arbitrary origin).
     * Not affected by system clock adjustments. Suitable for measuring
     * durations and intervals.
     */
    monotonicNow(): number;

    /**
     * Schedule a callback to run after a delay.
     * @param callback - Function to invoke after the delay.
     * @param delayMs - Delay in milliseconds.
     * @returns A cancel function that aborts the scheduled callback.
     */
    setTimeout(callback: () => void, delayMs: number): () => void;

    /**
     * Return a promise that resolves after the given delay.
     * @param ms - Sleep duration in milliseconds.
     */
    sleep(ms: number): Promise<void>;
}
