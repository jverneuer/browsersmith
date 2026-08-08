/**
 * Platform-agnostic telemetry interface — re-exported from @browsercore/contracts.
 *
 * Defines the minimal observability surface: structured logging, distributed
 * tracing, and metrics. Implemented by NoOpTelemetry (default — zero-cost)
 * or a real backend (OTel, diagnostics_channel, JSON) when configured.
 * This is the single source of truth — re-exported so all packages share
 * the exact same type.
 */

export type { Telemetry, Logger, Tracer, Span, Metrics } from "@browsercore/contracts";
