/**
 * Example: HTTP/1.1 vs HTTP/2 protocol selection.
 *
 * browsercore negotiates the protocol via TLS ALPN (offering "h2" then
 * "http/1.1"). Most modern sites negotiate h2. This example shows how to tell
 * which protocol was used and how to force a fallback to HTTP/1.1 when a
 * target misbehaves over h2 (some legacy WAFs choke on HTTP/2 SETTINGS).
 *
 * The e2e suite asserts the ALPN branch; this example prints the outcome.
 *
 * Run: `npx tsx examples/http1-vs-http2.ts`
 */

import { createClient, createCookieJar, PROFILES } from "../src/index.js";

async function probe(url: string): Promise<void> {
    // A shared client pools connections per origin. The profile drives both the
    // TLS fingerprint and the HTTP/2 SETTINGS we advertise.
    const jar = createCookieJar();
    const client = createClient({
        profile: PROFILES["chrome-140"],
        cookieJar: jar,
    });

    try {
        const res = await client.fetch(url, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            },
        });
        // The response carries the negotiated protocol hint in headers where the
        // server echoes it (httpbin / many debug endpoints do). Over a plain
        // origin that doesn't echo it, the ALPN result lives on the pooled
        // connection — see tests/e2e.test.ts for how the suite asserts it.
        const echoed = res.headers["x-protocol"] ?? res.headers["protocol"];
        console.log("%s → %d  (server saw: %s)", url, res.status, echoed ?? "n/a");
        await res.text();
    } finally {
        await client.close();
    }
}

async function main(): Promise<void> {
    const url = process.argv[2] ?? "https://example.com";

    // Default: ALPN offers h2 first → HTTP/2 when the server supports it.
    console.log("default (h2 preferred):");
    await probe(url);

    // To force HTTP/1.1, register a profile whose TLS config offers only
    // "http/1.1" in ALPN — see @browsercore/profiles registerProfile(). In
    // practice most crawls leave h2 on; this example documents the knob.
    console.log("\n(forcing HTTP/1.1 is a profile-level ALPN override; see docs)");
}

void main();
