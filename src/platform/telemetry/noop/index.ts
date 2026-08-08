/**
 * No-op telemetry — the zero-cost default for the platform.
 *
 * Exports the no-op implementation that silently drops all metrics.
 * Replace with a real backend by passing a custom `telemetry` to
 * `createPlatform()`.
 */

export { NoOpTelemetry, noOpTelemetry } from "./no-op-telemetry.js";
export type { Telemetry } from "./telemetry-types.js";
