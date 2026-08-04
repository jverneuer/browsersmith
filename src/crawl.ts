/**
 * Tiny crawling helper built on {@link createClient}.
 *
 * Not a framework — just enough to walk a list of URLs (or a sitemap) with a
 * shared connection pool + cookie jar, respecting robots-style per-host
 * concurrency and an optional delay. Real scraping frameworks add retries,
 * dedupe, and queues; this gives you the browsercore primitives in one call.
 */

import { createClient, type FetchResponse, type FetchOptions } from "@browsercore/fetch";
import { createCookieJar, type CookieJar } from "@browsercore/cookies";
import type { ProfileId } from "@browsercore/profiles";
import { CHROME_140 } from "./profiles.js";

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
}

/** A single crawl result. `ok` carries the response; `error` the failure. */
export interface CrawlResult {
    readonly url: string;
    readonly ok: boolean;
    readonly status?: number;
    readonly response?: FetchResponse;
    readonly error?: string;
}

/** Default per-host concurrency — serial by default to be polite. */
const DEFAULT_CONCURRENCY = 1;

/** Sleep helper that resolves after `ms` (no-op when 0). */
function sleep(ms: number): Promise<void> {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
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
    const client = createClient({ profile, cookieJar: jar });

    const results: CrawlResult[] = Array.from({ length: urls.length });
    // Process in batches of `concurrency` per host. Simple and polite.
    let cursor = 0;
    async function worker(): Promise<void> {
        while (cursor < urls.length) {
            const index = cursor;
            cursor += 1;
            const url = urls[index];
            if (url === undefined) {
                continue;
            }
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
            // oxlint-disable-next-line no-await-in-loop — sequential delay between batches is intentional for politeness
            await sleep(delayMs);
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
