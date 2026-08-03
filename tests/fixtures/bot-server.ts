/**
 * Local bot-detection fixture server.
 *
 * A plain Node http.Server that simulates what a real bot detector checks:
 *   - User-Agent must be a current Chrome/Firefox.
 *   - Header order must match a real browser (accept before accept-language
 *     before accept-encoding — the WAF-style ordering rule).
 *   - Required browser headers present (accept, accept-language, accept-encoding).
 *   - A challenge/turnstile-style interstitial page that the client must clear
 *     by replaying the challenge token on a second request.
 *   - Rate-limiting: more than N requests/sec from one "client" gets a 429.
 *
 * Everything is in-process and deterministic — no network, no real TLS. The
 * fetch client's `transportFactory` test seam wires the HTTP/1.1 client
 * directly to this server's socket bytes (see tests/fixtures/fake-transport.ts).
 *
 * The server also records every signal it observed into a {@link SignalLog} so
 * tests can assert the EXACT wire behavior (not just the HTTP status). That is
 * how the e2e suite proves crawler-detection defeat: the fixture accepted the
 * request AND the recorded signals match a browser fingerprint.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse, type RequestListener } from "node:http";

/** Port the fixture listens on by default in examples and tests. */
export const BOT_PORT = 48171;

/** The browser User-Agents this fixture accepts (current Chrome + Firefox). */
export const ACCEPTED_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
] as const;

/**
 * The relative header order a real Chrome client emits (the subset the fixture
 * checks). `host` is intentionally omitted: browsers send it early, but the
 * fetch client appends it last (it's a forced header). A bot detector keys on
 * the relative order of the *browser* headers (user-agent → accept →
 * accept-language → accept-encoding), not on host placement.
 */
export const EXPECTED_HEADER_ORDER = [
    "user-agent",
    "accept",
    "accept-language",
    "accept-encoding",
] as const;

/** A recorded signal — what the fixture observed about one request. */
export interface RecordedSignal {
    readonly method: string;
    readonly path: string;
    readonly userAgent: string | undefined;
    /** Header names in the order they arrived on the wire. */
    readonly headerOrder: readonly string[];
    /** Whether each required header was present. */
    readonly hasRequiredHeaders: boolean;
    /** Whether the UA passed the browser check. */
    readonly userAgentAccepted: boolean;
    /** Whether the header order matched the browser rule. */
    readonly headerOrderAccepted: boolean;
    /** The status the fixture returned. */
    readonly status: number;
    /** The timestamp (ms) for rate-limit windowing. */
    readonly receivedAt: number;
}

/**
 * A log the fixture writes to and tests read from. Reset between cases with
 * {@link SignalLog.clear}.
 */
export class SignalLog {
    private readonly entries: RecordedSignal[] = [];

    /** Record one observed request. */
    record(signal: RecordedSignal): void {
        this.entries.push(signal);
    }

    /** All recorded signals, in arrival order. */
    all(): readonly RecordedSignal[] {
        return this.entries;
    }

    /** Count of signals with a given status. */
    countByStatus(status: number): number {
        return this.entries.filter((s) => s.status === status).length;
    }

    /** The last recorded signal, or undefined. */
    last(): RecordedSignal | undefined {
        return this.entries.at(-1);
    }

    /** Clear the log (call between test cases). */
    clear(): void {
        this.entries.length = 0;
    }
}

/** A challenge token the fixture issues and expects replayed to clear. */
const CHALLENGE_TOKEN = "bc-core-challenge-verified";

/** State carried between requests for the challenge + rate-limit flows. */
export interface FixtureState {
    /** Map of client-IP → issued challenge token (challenge flow). */
    readonly challenges: Map<string, string>;
    /** Map of client-IP → array of request timestamps (rate limit). */
    readonly hits: Map<string, number[]>;
    /** The shared signal log. */
    readonly log: SignalLog;
}

/** Create a fresh fixture state (one per server instance / test suite). */
export function createFixtureState(): FixtureState {
    return {
        challenges: new Map(),
        hits: new Map(),
        log: new SignalLog(),
    };
}

/** Max requests per second per client before the fixture returns 429. */
const RATE_LIMIT_PER_SEC = 20;

/** Whether a User-Agent string matches an accepted browser. */
function isAcceptedUserAgent(ua: string | undefined): boolean {
    if (ua === undefined) {
        return false;
    }
    return (ACCEPTED_USER_AGENTS as readonly string[]).some((accepted) =>
        ua.startsWith(accepted.slice(0, 40)),
    );
}

/** Whether the header order matches the browser rule (the checked subset). */
function headerOrderMatches(received: readonly string[]): boolean {
    // The fixture checks that the expected headers appear in the expected
    // relative order. Other headers interspersed are fine — detectors usually
    // key on the relative ordering of the canonical browser headers.
    let searchFrom = 0;
    for (const expected of EXPECTED_HEADER_ORDER) {
        const from = searchFrom;
        const idx = received.findIndex(
            (h, i) => i >= from && h.toLowerCase() === expected,
        );
        if (idx === -1) {
            return false;
        }
        searchFrom = idx + 1;
    }
    return true;
}

/** Extract a stable client id from the request (the remote socket address). */
function clientIdOf(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? "unknown";
}

/** Read the raw header names in arrival order from the underlying socket. */
function rawHeaderNames(req: IncomingMessage): string[] {
    // Node exposes the raw header names on req.rawHeaders (a flat
    // [name, value, name, value, …] array). Pull just the names in order.
    const names: string[] = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        if (name !== undefined) {
            names.push(name);
        }
    }
    return names;
}

/** Whether the request presents the challenge-clear cookie/header. */
function challengeCleared(req: IncomingMessage): boolean {
    const cookie = req.headers["cookie"];
    if (typeof cookie === "string" && cookie.includes(CHALLENGE_TOKEN)) {
        return true;
    }
    return req.headers["x-challenge-token"] === CHALLENGE_TOKEN;
}

/** The JSON body the fixture writes for a given status + message. */
function jsonBody(status: number, message: string): string {
    return JSON.stringify({ status, message, at: Date.now() });
}

/**
 * Build a request listener backed by the given fixture state. Exported so the
 * example and the e2e suite share one implementation.
 */
export function botDetectionFixture(state: FixtureState): RequestListener {
    return (req: IncomingMessage, res: ServerResponse): void => {
        const method = req.method ?? "GET";
        const path = req.url ?? "/";
        const ua = req.headers["user-agent"];
        const headerOrder = rawHeaderNames(req);
        const client = clientIdOf(req);

        // Rate-limit window: keep the last second of hits per client.
        const now = Date.now();
        const hits = state.hits.get(client) ?? [];
        const recent = hits.filter((t) => now - t < 1000);
        recent.push(now);
        state.hits.set(client, recent);
        if (recent.length > RATE_LIMIT_PER_SEC) {
            const status = 429;
            state.log.record({
                method,
                path,
                userAgent: ua,
                headerOrder,
                hasRequiredHeaders: false,
                userAgentAccepted: isAcceptedUserAgent(ua),
                headerOrderAccepted: headerOrderMatches(headerOrder),
                status,
                receivedAt: now,
            });
            res.writeHead(status, { "content-type": "application/json" });
            res.end(jsonBody(status, "rate limited"));
            return;
        }

        const required = ["accept", "accept-language", "accept-encoding"];
        const hasRequiredHeaders = required.every((h) => req.headers[h] !== undefined);
        const uaAccepted = isAcceptedUserAgent(ua);
        const orderAccepted = headerOrderMatches(headerOrder);

        // /protected requires the full browser fingerprint.
        if (path === "/protected") {
            // First contact: issue a challenge page. The client must replay the
            // token (via cookie or header) to clear it.
            if (!challengeCleared(req)) {
                state.challenges.set(client, CHALLENGE_TOKEN);
                res.writeHead(403, {
                    "content-type": "text/html; charset=utf-8",
                    "set-cookie": `bc_challenge=${CHALLENGE_TOKEN}; Path=/`,
                });
                res.end(
                    `<!doctype html><h1>Checking your browser…</h1>` +
                        `<p>challenge issued</p>`,
                );
                return;
            }
            if (!uaAccepted || !orderAccepted || !hasRequiredHeaders) {
                const status = 403;
                state.log.record({
                    method,
                    path,
                    userAgent: ua,
                    headerOrder,
                    hasRequiredHeaders,
                    userAgentAccepted: uaAccepted,
                    headerOrderAccepted: orderAccepted,
                    status,
                    receivedAt: now,
                });
                res.writeHead(status, { "content-type": "application/json" });
                res.end(jsonBody(status, "bot detected"));
                return;
            }
            const status = 200;
            state.log.record({
                method,
                path,
                userAgent: ua,
                headerOrder,
                hasRequiredHeaders,
                userAgentAccepted: uaAccepted,
                headerOrderAccepted: orderAccepted,
                status,
                receivedAt: now,
            });
            res.writeHead(status, { "content-type": "application/json" });
            res.end(jsonBody(status, "challenge cleared"));
            return;
        }

        // Other paths just reflect the fingerprint verdict.
        const status = uaAccepted && hasRequiredHeaders ? 200 : 403;
        state.log.record({
            method,
            path,
            userAgent: ua,
            headerOrder,
            hasRequiredHeaders,
            userAgentAccepted: uaAccepted,
            headerOrderAccepted: orderAccepted,
            status,
            receivedAt: now,
        });
        res.writeHead(status, { "content-type": "application/json" });
        res.end(
            jsonBody(
                status,
                status === 200 ? "ok" : "rejected",
            ),
        );
    };
}

/**
 * Start a bot-detection fixture server. When `port` is omitted (or 0) the OS
 * assigns an ephemeral port — this is what tests should use so parallel test
 * files never collide on `EADDRINUSE`. Returns the bound port in `address`.
 */
export async function startBotServer(
    state: FixtureState = createFixtureState(),
    port: number = 0,
): Promise<{ server: Server; state: FixtureState; port: number }> {
    const server = createServer(botDetectionFixture(state));
    await new Promise<void>((resolve) => {
        server.listen(port, "127.0.0.1", () => {
            resolve();
        });
    });
    const addr = server.address();
    const bound = typeof addr === "object" && addr !== null ? addr.port : port;
    return { server, state, port: bound };
}

/** Stop a server returned by {@link startBotServer}. */
export async function stopBotServer(server: Server): Promise<void> {
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
}
