/**
 * No-op telemetry implementation — the zero-cost default.
 *
 * When no telemetry backend is configured, this drops every metric silently.
 * It satisfies the {@link Telemetry} interface so the platform always has
 * a valid telemetry instance, avoiding null checks throughout the stack.
 */

import type { Telemetry } from "./telemetry-types.js";

/**
 * No-op telemetry that silently drops all metrics.
 *
 * This is the default production telemetry: zero allocation overhead when
 * no backend is wired up. Replace with a real implementation (e.g. OpenTelemetry)
 * by passing a custom `telemetry` to `createPlatform()`.
 */
export class NoOpTelemetry implements Telemetry {
    record(_name: string, _value: number, _tags?: Record<string, string>): void {
        // Intentionally empty — no metrics backend configured.
    }

    measure(_name: string, _durationMs: number, _tags?: Record<string, string>): void {
        // Intentionally empty — no metrics backend configured.
    }

    gauge(_name: string, _value: number, _tags?: Record<string, string>): void {
        // Intentionally empty — no metrics backend configured.
    }
}

/**
 * Default no-op telemetry instance.
 */
export const noOpTelemetry = new NoOpTelemetry();
