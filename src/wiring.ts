import { crypto } from "@browsercore/crypto";

export const defaultCryptoProvider = crypto;

/**
 * Logging abstraction for protocol diagnostics. Mirrors the `Logger` shape in
 * `@browsercore/http3` so a logger defined here plugs straight into
 * {@link Http3Options.logger} without a cast.
 *
 * Defined locally in the entrypoint (rather than imported from a sibling
 * package) so the customer-facing surface owns the diagnostic contract — the
 * protocol packages remain free to evolve their own logger shape independently
 * of the curated entrypoint.
 *
 * All methods are synchronous and MUST NOT throw — logging failures must never
 * disrupt protocol operation.
 */
export interface Logger {
    /** Verbose diagnostics — disabled by default in production. */
    debug(message: string, ...meta: readonly unknown[]): void;
    /** Recoverable anomaly (e.g. a peer SETTINGS violation we tolerated). */
    warn(message: string, ...meta: readonly unknown[]): void;
    /** Non-recoverable failure (e.g. GOAWAY received, handshake timeout). */
    error(message: string, ...meta: readonly unknown[]): void;
}

/** A silent logger — drops every call. This is the default. */
export const silentLogger: Logger = {
    debug: () => {},
    warn: () => {},
    error: () => {},
};

/**
 * A development logger — forwards to the platform `console`. Opt-in; the
 * default is {@link silentLogger} so production callers must explicitly enable
 * noise.
 */
export const devLogger: Logger = {
    // oxlint-disable-next-line no-console, no-confusing-void-expression -- devLogger IS the sanctioned console fallback
    debug: (message, ...meta) => { console.debug(message, ...meta); },
    // oxlint-disable-next-line no-console, no-confusing-void-expression -- devLogger IS the sanctioned console fallback
    warn: (message, ...meta) => { console.warn(message, ...meta); },
    // oxlint-disable-next-line no-console, no-confusing-void-expression -- devLogger IS the sanctioned console fallback
    error: (message, ...meta) => { console.error(message, ...meta); },
};

// ---------------------------------------------------------------------------
// Clock abstraction (injected — makes time-dependent logic testable)
// ---------------------------------------------------------------------------

/**
 * A source of the current time. Injected so connection id generation and any
 * future time-driven logic can be tested deterministically. {@link systemClock}
 * is the production default; tests supply a fake.
 */
export interface Clock {
    /** Current time in milliseconds since the Unix epoch (same unit as Date.now()). */
    now(): number;
}

/** Production clock backed by the global Date. */
export const systemClock: Clock = { now: () => Date.now() };
