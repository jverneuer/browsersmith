/**
 * No-op telemetry implementation — the zero-cost default.
 *
 * When no telemetry backend is configured, this drops every call silently.
 * It satisfies the {@link Telemetry} interface (logger + tracer + metrics)
 * so the platform always has a valid telemetry instance, avoiding null
 * checks throughout the stack.
 */

import type { Telemetry, Span } from "./telemetry-types.js";

/**
 * No-op telemetry that silently drops all logging, tracing, and metrics.
 *
 * This is the default production telemetry: zero allocation overhead when
 * no backend is wired up. Replace with a real implementation (e.g. OTel,
 * diagnostics_channel, JSON) by passing a custom `telemetry` to
 * `createPlatform()`.
 */
const noopSpan: Span = {
    setAttribute: () => noopSpan,
    end: () => {},
};

export const noOpTelemetry: Telemetry = {
    logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
    },
    tracer: {
        startSpan: () => noopSpan,
    },
    metrics: {
        add: () => {},
    },
};

/**
 * Default no-op telemetry instance (alias for `noOpTelemetry`).
 * @deprecated Use `noOpTelemetry` directly.
 */
export const NoOpTelemetry = noOpTelemetry;
