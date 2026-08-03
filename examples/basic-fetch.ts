/**
 * Example: basic fetch with a browser profile.
 *
 * The simplest use of browsercore — one request that mimics Chrome 140 at the
 * TLS + HTTP layer. Demonstrates the top-level `fetch()` convenience, reading
 * the body as text and JSON, and the typed error surface.
 *
 * Run: `npx tsx examples/basic-fetch.ts`
 */

import { fetch, FetchError, FetchTimeoutError, PROFILES } from "../src/index.js";

async function main(): Promise<void> {
    const url = process.argv[2] ?? "https://example.com";

    // fetch() creates a one-shot client. Pass a profile to impersonate that
    // browser at the wire level. PROFILES.chrome-140 pins the profile id so
    // crawls stay reproducible.
    try {
        const response = await fetch(url, {
            profile: PROFILES["chrome-140"],
            timeoutMs: 15_000,
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
            },
        });

        console.log("status:    ", response.status, response.statusText);
        console.log("final url: ", response.url);
        console.log("headers:");
        for (const [name, value] of Object.entries(response.headers)) {
            console.log(`  ${name}: ${value}`);
        }

        // Consume the body once. text()/json()/body() are mutually exclusive
        // (call clone() first to read multiple ways).
        const body = await response.text();
        console.log("body (%d chars): %s", body.length, body.slice(0, 120));

        // JSON example (guarded by a content-type check in real code):
        //   const data = await response.json();
    } catch (err) {
        // Typed errors carry the context you need to recover.
        if (err instanceof FetchTimeoutError) {
            console.error("timed out after %dms", err.timeoutMs);
            process.exit(124);
        }
        if (err instanceof FetchError) {
            console.error("fetch failed: %s (url=%s)", err.message, err.url);
            process.exit(1);
        }
        throw err;
    }
}

void main();
