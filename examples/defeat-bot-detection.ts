/**
 * Example: defeat crawler / bot detection.
 *
 * Boots a LOCAL fixture server that simulates a bot detector: it inspects the
 * incoming request for browser-fingerprint signals (User-Agent, header order,
 * a fake JA3/JA4 stand-in, and a challenge page) and 403s anything that does
 * not look like a real browser. We then hit it with `browsercore` using the
 * Chrome profile and show it passes.
 *
 * This is fully offline and deterministic — the fixture server is a plain
 * Node http.Server in the same process. The same fixture backs the e2e suite
 * in tests/.
 *
 * Run: `npx tsx examples/defeat-bot-detection.ts`
 */

import { createClient, PROFILES, nodeEventProvider } from "../src/index.js";
import { startBotServer, stopBotServer, createFixtureState } from "../tests/fixtures/bot-server.js";
import { loopbackTransportFactory } from "../tests/fixtures/fake-transport.js";

/**
 * A self-contained run: start the fixture, hit it with browsercore, stop it.
 * Uses the same fixture the e2e suite drives. Exported so a caller can run it
 * programmatically.
 */
export async function runAgainstBotFixture(): Promise<void> {
    // Ephemeral port so multiple runs never collide.
    const state = createFixtureState();
    const { server, port } = await startBotServer(state, 0);

    try {
        // With the chrome-140 profile, the wire fingerprint matches a real
        // browser → the fixture's detector accepts the request.
        const client = createClient({
            profile: PROFILES["chrome-140"],
            events: nodeEventProvider,
            transportFactory: loopbackTransportFactory(port),
        });
        // First hit /protected → challenge issued (sets bc_challenge cookie).
        const first = await client.fetch(`http://localhost:${port}/protected`, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
                "accept-encoding": "gzip, deflate, br",
            },
        });
        await first.text();
        // Second hit clears the challenge (cookie replayed from the jar).
        const res = await client.fetch(`http://localhost:${port}/protected`, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
                "accept-encoding": "gzip, deflate, br",
            },
        });
        const body = await res.text();
        await client.close();

        if (res.status === 200 && body.includes("challenge cleared")) {
            console.log("PASS: fingerprint accepted (status %d)", res.status);
        } else {
            console.error("FAIL: status=%d body=%s", res.status, body.slice(0, 200));
            process.exitCode = 1;
        }
    } finally {
        await stopBotServer(server);
    }
}

async function main(): Promise<void> {
    await runAgainstBotFixture();
}

void main();
