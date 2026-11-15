/**
 * Example: minimal static-site crawler — browsersmith instead of a headless
 * browser.
 *
 * When a site renders fully server-side you do not need Chrome: one pooled
 * FetchClient (shared cookie jar, pinned Chrome 140 fingerprint, platform
 * wired) walks the site breadth-first, extracting <title> and <a href> values
 * with plain regex. Zero parsing dependencies, same-origin only, polite delay
 * between fetches, and a single bad page never aborts the crawl.
 *
 * Run: `npm run example examples/simple-crawler.ts <startUrl> [maxDepth=2] [delayMs=250]`
 */

import {
    createClient,
    createCookieJar,
    FetchError,
    FetchTimeoutError,
    platform,
    PROFILES,
} from "../src/index.js";

/** A URL waiting to be fetched, plus its distance from the start URL. */
interface FrontierItem {
    readonly url: string;
    readonly depth: number;
}

/** How one page's fetch ended. */
type Outcome = "ok" | "skipped" | "failed";

/** What we learned about one fetched page (status/title null on failure). */
interface PageResult {
    readonly url: string;
    readonly depth: number;
    readonly status: number | null;
    readonly title: string | null;
    readonly links: number;
    readonly outcome: Outcome;
}

/** Canonical dedupe key: origin + pathname + search, fragments dropped. */
function normalizeUrl(url: URL): string {
    return `${url.origin}${url.pathname}${url.search}`;
}

/** First <title> text on a page, whitespace-collapsed, or null. */
function extractTitle(html: string): string | null {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const raw = match?.[1];
    if (raw === undefined) return null;
    const title = raw.replace(/\s+/g, " ").trim();
    return title.length > 0 ? title : null;
}

/** All <a href> values on a page, single- or double-quoted. */
function extractHrefs(html: string): string[] {
    const hrefs: string[] = [];
    for (const match of html.matchAll(/<a\s[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
        hrefs.push((match[1] ?? match[2] ?? "").trim());
    }
    return hrefs;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** Parse the start URL, rejecting anything that is not http(s). */
function parseStartUrl(raw: string): URL | null {
    try {
        const url = new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    const startArg = process.argv[2];
    if (startArg === undefined) {
        console.error("usage: npm run example examples/simple-crawler.ts <startUrl> [maxDepth=2] [delayMs=250]");
        process.exitCode = 2;
        return;
    }
    const start = parseStartUrl(startArg);
    if (start === null) {
        console.error("invalid start URL (must be absolute http(s)): %s", startArg);
        process.exitCode = 2;
        return;
    }
    const maxDepth = Number.parseInt(process.argv[3] ?? "2", 10);
    const delayMs = Number.parseInt(process.argv[4] ?? "250", 10);
    if (Number.isNaN(maxDepth) || Number.isNaN(delayMs)) {
        console.error("maxDepth and delayMs must be integers");
        process.exitCode = 2;
        return;
    }

    // One client for the whole crawl: connections pool per origin and one
    // cookie jar carries session state across every page.
    const jar = createCookieJar();
    const client = createClient({
        profile: PROFILES["chrome-140"],
        cookieJar: jar,
        platform,
    });

    const startedAt = Date.now();
    const frontier: FrontierItem[] = [{ url: start.href, depth: 0 }];
    const seen = new Set<string>([normalizeUrl(start)]);
    const results: PageResult[] = [];

    while (frontier.length > 0) {
        const item = frontier.shift();
        if (item === undefined) break;

        // Politeness: pause between fetches, never before the first one.
        if (results.length > 0) await sleep(delayMs);

        try {
            const response = await client.fetch(item.url, {
                timeoutMs: 15_000,
                headers: { accept: "text/html,application/xhtml+xml" },
            });

            const contentType = response.headers["content-type"] ?? "";
            if (!contentType.includes("text/html")) {
                // Not HTML — drain the body so the pooled connection stays reusable.
                await response.body();
                results.push({ url: response.url, depth: item.depth, status: response.status, title: null, links: 0, outcome: "skipped" });
                console.log("SKIP d%d  %d  non-html (%s)  %s", item.depth, response.status, contentType || "unknown", response.url);
                continue;
            }

            const html = await response.text();
            const title = extractTitle(html);

            // Resolve every href against the final page URL, drop fragments,
            // keep only http(s) (mailtos and javascript: need no browser either).
            const discovered = new Set<string>();
            for (const href of extractHrefs(html)) {
                let resolved: URL;
                try {
                    resolved = new URL(href, response.url);
                } catch {
                    continue;
                }
                if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
                discovered.add(normalizeUrl(resolved));

                // Same-origin only, and only within the depth budget.
                if (resolved.origin === start.origin && item.depth < maxDepth) {
                    const key = normalizeUrl(resolved);
                    if (!seen.has(key)) {
                        seen.add(key);
                        frontier.push({ url: key, depth: item.depth + 1 });
                    }
                }
            }

            results.push({ url: response.url, depth: item.depth, status: response.status, title, links: discovered.size, outcome: "ok" });
            console.log("OK   d%d  %d  \"%s\"  +%d links  %s", item.depth, response.status, title ?? "(untitled)", discovered.size, response.url);
        } catch (err) {
            // A bad page never aborts the crawl — record it and move on.
            if (err instanceof FetchTimeoutError) {
                results.push({ url: item.url, depth: item.depth, status: null, title: null, links: 0, outcome: "failed" });
                console.error("FAIL d%d  timeout after %dms  %s", item.depth, err.timeoutMs, item.url);
                continue;
            }
            if (err instanceof FetchError) {
                results.push({ url: item.url, depth: item.depth, status: null, title: null, links: 0, outcome: "failed" });
                console.error("FAIL d%d  %s (%s)  %s", item.depth, err.kind, err.url ?? item.url, err.message);
                continue;
            }
            throw err;
        }
    }

    await client.close();

    const okCount = results.filter((r) => r.outcome === "ok").length;
    const failedCount = results.filter((r) => r.outcome === "failed").length;
    const skippedCount = results.filter((r) => r.outcome === "skipped").length;
    const totalLinks = results.reduce((sum, r) => sum + r.links, 0);
    console.log("\ncrawl finished: %d ok, %d failed, %d skipped | %d links found | %dms", okCount, failedCount, skippedCount, totalLinks, Date.now() - startedAt);

    process.exitCode = okCount > 0 ? 0 : 1;
}

void main();
