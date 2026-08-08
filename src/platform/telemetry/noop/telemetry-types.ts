/**
 * Platform-agnostic telemetry interface.
 *
 * Defines the minimal metrics surface that BrowserCore needs for observability.
 * Implemented by NoOpTelemetry (default) or a real backend (e.g. OpenTelemetry,
 * StatsD) when configured.
 */

export interface Telemetry {
    /**
     * Record a point-in-time metric value (counter, histogram, etc.).
     * @param name - Metric name (e.g. "http.requests.total").
     * @param value - Numeric value to record.
     * @param tags - Optional dimensional labels (e.g. { status: "200" }).
     */
    record(name: string, value: number, tags?: Record<string, string>): void;

    /**
     * Record a duration measurement (timer).
     * @param name - Metric name (e.g. "http.request.duration_ms").
     * @param durationMs - Duration in milliseconds.
     * @param tags - Optional dimensional labels.
     */
    measure(name: string, durationMs: number, tags?: Record<string, string>): void;

    /**
     * Record a gauge value (can go up or down).
     * @param name - Metric name (e.g. "pool.connections.active").
     * @param value - Current gauge value.
     * @param tags - Optional dimensional labels.
     */
    gauge(name: string, value: number, tags?: Record<string, string>): void;
}
