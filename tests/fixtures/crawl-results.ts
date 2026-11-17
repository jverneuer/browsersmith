import type { CrawlResult } from "../../src/crawl.js";

/**
 * Narrow crawl()'s first result to defined.
 *
 * crawl() returns exactly one CrawlResult per input URL (a skipped sparse
 * hole is the one exception, and those tests assert on the full results
 * array instead) — so a missing first result is a wiring bug in the test.
 * Fail loudly here instead of optional-chaining through every assertion.
 */
export function firstResult(results: readonly CrawlResult[]): CrawlResult {
    const first = results[0];
    if (first === undefined) {
        throw new Error("crawl() returned no result for the first URL — test wiring bug");
    }
    return first;
}
