import { connect } from "@browsercore/transport";
import { crypto } from "@browsercore/crypto";

export const defaultTransportFactory = (host: string, port: number) =>
    connect({ host, port });

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
    debug: (message, ...meta) => console.debug(message, ...meta),
    warn: (message, ...meta) => console.warn(message, ...meta),
    error: (message, ...meta) => console.error(message, ...meta),
};
