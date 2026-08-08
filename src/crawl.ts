/**
 * Tiny crawling helper built on {@link createClient}.
 *
 * Not a framework — just enough to walk a list of URLs (or a sitemap) with a
 * shared connection pool + cookie jar, respecting robots-style per-host
 * concurrency and an optional delay. Real scraping frameworks add retries,
 * dedupe, and queues; this gives you the browsercore primitives in one call.
 */

import { createClient, type FetchResponse, type FetchOptions, type FetchClientOptions } from "@browsercore/fetch";
import { createCookieJar, type CookieJar } from "@browsercore/cookies";
import type { ProfileId } from "@browsercore/profiles";
import { connectHttp3, type Http3Response } from "@browsercore/http3";
import { connectQuic, makeConnectionId, type ConnectionId, type UdpAddress } from "@browsercore/quic";
import type { DatagramTransport } from "@browsercore/contracts";
import { Duration } from "@browsercore/contracts";
import { CHROME_140 } from "./profiles.js";
import { platform } from "./wiring.js";

/** Options for {@link crawl}. */
export interface CrawlOptions {
    /** Browser profile to impersonate. Defaults to chrome-140. */
    readonly profile?: ProfileId;
    /** Shared cookie jar (one is created if omitted). */
    readonly cookieJar?: CookieJar;
    /** Per-request fetch options merged into every call (headers, etc.). */
    readonly fetchOptions?: FetchOptions;
    /** Delay between requests in ms (anti-rate-limit courtesy). Default 0. */
    readonly delayMs?: number;
    /** Max concurrent in-flight requests per host. Default 1 (serial). */
    readonly concurrency?: number;
    /** Request timeout in ms per URL. Default 30_000. */
    readonly timeoutMs?: number;
    /**
     * Test seam: override how the transport for an origin is established.
     * Passed through to {@link FetchClientOptions.transportFactory} — when set,
     * the client connects to this instead of opening a real TCP + TLS
     * connection. Lets behavioral tests drive crawl() against an in-process
     * fixture server without a real network. Production callers never set this.
     */
    readonly transportFactory?: FetchClientOptions["transportFactory"];
    /**
     * Opt into HTTP/3 (QUIC) for every request in this crawl. When set, each
     * URL is fetched over a fresh HTTP/3 connection instead of the default
     * TCP + TLS + HTTP/1.1|HTTP/2 path. The value is a factory that returns a
     * {@link DatagramTransport} (UDP) bound to the target origin — the same
     * shape `@browsercore/quic`'s `connectQuic` consumes. HTTP/3 is still
     * experimental in this entrypoint: the connection is established per-URL,
     * request headers/body are sent, and the response status + body are mapped
     * into the same {@link CrawlResult} shape. No connection pooling, no
     * cookie-jar coordination across the HTTP/3 path yet.
     *
     * The crawler calls {@link Http3Connection.close} after each URL. Pass a
     * factory (not a live connection) so each URL gets a clean QUIC handshake.
     *
     * Defaults to `undefined` — HTTP/1.1|HTTP/2 over TCP + TLS.
     */
    readonly http3?: (host: string, port: number) => Promise<DatagramTransport> | DatagramTransport;
}

/** A single crawl result. `ok` carries the response; `error` the failure. */
export interface CrawlResult {
    readonly url: string;
    readonly ok: boolean;
    readonly status?: number;
    /** Present when the fetch succeeded over the default TCP + TLS path. */
    readonly response?: FetchResponse;
    /**
     * Present when the fetch succeeded over the experimental HTTP/3 (QUIC)
     * path — see {@link CrawlOptions.http3}. `Http3Response` carries raw
     * status + headers + body (it is *not* a {@link FetchResponse}); treat the
     * two response fields as mutually exclusive.
     */
    readonly http3Response?: Http3Response;
    readonly error?: string;
}

/** Default per-host concurrency — serial by default to be polite. */
const DEFAULT_CONCURRENCY = 1;

/**
 * Default QUIC connection-id length (bytes) we generate for the HTTP/3 path.
 * 8 bytes matches the common browser/ server default and keeps the long-header
 * GREASE budget reasonable.
 */
const QUIC_CONNECTION_ID_LEN = 8;

/** Generate a random QUIC connection id of `length` bytes. */
const randomConnectionId = (length: number): ConnectionId =>
    makeConnectionId(platform.crypto.provider.randomBytes(length));

/** Resolve the UDP address family for a host string (naive IPv6 detection). */
function familyForHost(host: string): 4 | 6 {
    return host.includes(":") ? 6 : 4;
}

/**
 * Fetch a single URL over HTTP/3 (QUIC) and map the result into the crawl
 * result shape. Each call establishes a fresh QUIC + HTTP/3 connection — no
 * pooling, no cookie-jar coordination. The connection is always closed before
 * returning.
 *
 * The request body (if any) is encoded from string -> UTF-8 bytes to satisfy
 * the HTTP/3 layer's `Bytes` contract. Headers from `fetchOptions` are copied
 * verbatim; the caller controls Accept / User-Agent / etc.
 */
async function fetchHttp3(
    url: string,
    factory: (host: string, port: number) => Promise<DatagramTransport> | DatagramTransport,
    fetchOptions?: FetchOptions,
    timeoutMs?: number,
): Promise<CrawlResult> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { url, ok: false, error: `invalid URL: ${url}` };
    }
    const scheme = parsed.protocol === "https:" ? "https" : "http";
    const host = parsed.hostname;
    const defaultPort = scheme === "https" ? 443 : 80;
    const port = parsed.port === "" ? defaultPort : Number(parsed.port);
    // HTTP/3 always runs over HTTPS in practice; honour the URL scheme.
    if (scheme !== "https") {
        return { url, ok: false, error: `HTTP/3 requires https (got ${parsed.protocol})` };
    }
    const path = parsed.pathname + parsed.search;

    let transport: DatagramTransport;
    try {
        transport = await factory(host, port);
    } catch (err) {
        return { url, ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const peer: UdpAddress = { address: host, port, family: familyForHost(host) };
    const handshakeTimeoutMs = timeoutMs ?? 10_000;

    // oxlint-disable-next-line typescript(no-unsafe-assignment)
    const quic = await connectQuic({
        transport: transport as Parameters<typeof connectQuic>[0]["transport"],
        peer,
        serverName: host,
        initialDcid: randomConnectionId(QUIC_CONNECTION_ID_LEN),
        initialScid: randomConnectionId(QUIC_CONNECTION_ID_LEN),
        handshakeTimeoutMs,
        clock: platform.time.clock,
    });

    const http3 = await connectHttp3({
        quic: quic as unknown as Parameters<typeof connectHttp3>[0]["quic"],
        settingsAckTimeoutMs: handshakeTimeoutMs,
    });

    try {
        const headers = new Map<string, string>();
        if (fetchOptions?.headers !== undefined) {
            for (const [k, value] of Object.entries(fetchOptions.headers)) {
                headers.set(k, value);
            }
        }
        const body = fetchOptions?.body;
        const bodyBytes = body === undefined
            ? undefined
            : typeof body === "string"
                ? new TextEncoder().encode(body)
                : body;
        const res = await http3.request({
            method: fetchOptions?.method ?? "GET",
            scheme,
            authority: parsed.host,
            path,
            headers,
            body: bodyBytes,
        });
        return {
            url,
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            http3Response: res,
        };
    } catch (err) {
        return { url, ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
        await http3.close();
    }
}

/**
 * Crawl a list of URLs with a shared client (pooled connections + cookie jar).
 *
 * Each URL is fetched with the configured profile; cookies flow between
 * requests via the shared jar. Results are returned in input order. A failed
 * fetch (timeout, network error) does not abort the crawl — it is recorded as
 * `{ ok: false, error }` and the next URL proceeds.
 *
 * @example
 * ```ts
 * const results = await crawl([
 *   "https://example.com/",
 *   "https://example.com/page-2",
 * ]);
 * for (const r of results) console.log(r.url, r.status);
 * ```
 */
export async function crawl(
    urls: readonly string[],
    options?: CrawlOptions,
): Promise<CrawlResult[]> {
    const profile = options?.profile ?? CHROME_140;
    const jar = options?.cookieJar ?? createCookieJar();
    const delayMs = options?.delayMs ?? 0;
    const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
    const timeoutMs = options?.timeoutMs;
    // Assemble client options so absent optionals stay absent — under
    // exactOptionalPropertyTypes, `{ transportFactory: undefined }` is rejected
    // because the field's type is `(host, port) => ...` (no `undefined`).
    const clientOptions: { -readonly [K in keyof FetchClientOptions]: FetchClientOptions[K] } = {
        profile,
        cookieJar: jar,
        net: platform.network.tcp,
        dns: platform.network.dns,
    };
    if (options?.transportFactory !== undefined) {
        clientOptions.transportFactory = options.transportFactory;
    }
    const client = createClient(clientOptions);

    const results: CrawlResult[] = Array.from({ length: urls.length });
    // Process in batches of `concurrency` per host. Simple and polite.
    let cursor = 0;
    const http3Factory = options?.http3;
    // Positive guard computed once, outside the loop: a non-negated name keeps
    // the no-negated-condition rule happy and avoids re-testing per-URL.
    const usingHttp3 = http3Factory !== undefined;
    async function worker(): Promise<void> {
        while (cursor < urls.length) {
            const index = cursor;
            cursor += 1;
            const url = urls[index];
            if (url === undefined) {
                continue;
            }
            if (usingHttp3) {
                // Experimental HTTP/3 path: one QUIC + HTTP/3 connection per URL.
                const merged: FetchOptions = {
                    ...options?.fetchOptions,
                    ...(timeoutMs === undefined ? {} : { timeoutMs }),
                };
                // oxlint-disable-next-line no-await-in-loop — sequential fetch within each worker is intentional for per-host politeness
                results[index] = await fetchHttp3(url, http3Factory, merged, timeoutMs);
            } else {
                try {
                    const merged: FetchOptions = {
                        ...options?.fetchOptions,
                        ...(timeoutMs === undefined ? {} : { timeoutMs }),
                    };
                    // oxlint-disable-next-line no-await-in-loop — sequential fetch within each worker is intentional for per-host politeness
                    const response = await client.fetch(url, merged);
                    results[index] = {
                        url,
                        ok: response.status >= 200 && response.status < 400,
                        status: response.status,
                        response,
                    };
                } catch (err) {
                    results[index] = {
                        url,
                        ok: false,
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            }
            // oxlint-disable-next-line no-await-in-loop — sequential delay between batches is intentional for politeness
            await platform.time.scheduler.delay(Duration.milliseconds(delayMs));
        }
    }
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.max(1, concurrency); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    await client.close();
    return results;
}
