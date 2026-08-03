/**
 * Example: crawl a list of URLs with a shared client + cookie jar.
 *
 * Demonstrates the `crawl()` helper: one pooled client walks a URL list,
 * cookies flow between requests, and each result is reported as ok/error
 * without aborting the whole crawl. This is the shape of a polite scraper —
 * a real framework adds dedupe/retry/queues on top.
 *
 * Run: `npx tsx examples/crawl-sitemap.ts`
 */

import { crawl, createCookieJar, PROFILES } from "../src/index.js";
import type { CrawlResult } from "../src/index.js";

/** A tiny stand-in for a parsed sitemap. */
const SITEMAP: readonly string[] = [
    "https://example.com/",
    "https://example.com/docs",
    "https://example.com/docs/quickstart",
    "https://example.com/pricing",
];

/** Pretty-print one crawl result. */
function report(r: CrawlResult): void {
    if (r.ok && r.response !== undefined && r.status !== undefined) {
        console.log("OK   %d  %s", r.status, r.url);
    } else {
        console.log("FAIL     %s  (%s)", r.url, r.error ?? "unknown error");
    }
}

async function main(): Promise<void> {
    // One cookie jar shared by every request in the crawl — session cookies
    // (auth, CSRF tokens) persist across URLs automatically.
    const jar = createCookieJar();

    const results = await crawl(SITEMAP, {
        profile: PROFILES["chrome-140"],
        cookieJar: jar,
        delayMs: 200, // be polite between requests
        concurrency: 2, // two in-flight per host
        timeoutMs: 10_000,
        fetchOptions: {
            headers: {
                "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
            },
        },
    });

    let ok = 0;
    for (const r of results) {
        report(r);
        if (r.ok) ok += 1;
    }
    console.log("\n%d/%d succeeded", ok, results.length);

    // The jar now holds every Set-Cookie the crawl collected. Persist it to
    // resume the session later:
    //   const serialized = saveJar(jar);
    //   const resumed = loadJar(serialized);
}

void main();
