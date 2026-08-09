/**
 * Shared e2e harness — boots the bot-detection fixture and returns a fetch
 * client wired to it via the loopback transport.
 *
 * Every e2e test goes through here so the setup is identical: one fixture
 * server, one client, deterministic teardown. Tests call {@link setupHarness}
 * in `beforeEach` and {@link teardownHarness} in `afterEach`.
 */

import { createClient, type FetchClient, type FetchOptions } from "@browsercore/fetch";
import { createCookieJar, type CookieJar } from "@browsercore/cookies";
import type { ProfileId } from "@browsercore/profiles";
import { NodeEventProvider } from "../../src/platform/events/node/event-provider.js";
import {
    startBotServer,
    stopBotServer,
    createFixtureState,
    type FixtureState,
} from "./bot-server.js";
import { loopbackTransportFactory } from "./fake-transport.js";

/** The Chrome User-Agent the tests impersonate. */
export const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** The canonical browser headers (in browser order) the tests send. */
export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
    "user-agent": CHROME_UA,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
};

/** A non-browser User-Agent — used to prove the fixture rejects bots. */
export const BOT_UA = "node-fetch/1.0 (+https://example.com/bot)";

/** Handle returned by {@link setupHarness}. */
export interface Harness {
    readonly port: number;
    readonly client: FetchClient;
    readonly jar: CookieJar;
    readonly state: FixtureState;
    readonly baseUrl: string;
    /** Close the server + client. */
    close(): Promise<void>;
}

/** Boot the fixture server + a wired fetch client. */
export async function setupHarness(options?: {
    readonly profile?: ProfileId;
}): Promise<Harness> {
    const state = createFixtureState();
    // Ephemeral port (0) so parallel test files never collide.
    const { server, port } = await startBotServer(state, 0);
    const jar = createCookieJar();
    const client = createClient({
        profile: options?.profile ?? ("chrome-140" as ProfileId),
        cookieJar: jar,
        events: new NodeEventProvider(),
        transportFactory: loopbackTransportFactory(port),
    });
    const baseUrl = `http://localhost:${port}`;

    return {
        port,
        client,
        jar,
        state,
        baseUrl,
        async close(): Promise<void> {
            await client.close();
            await stopBotServer(server);
        },
    };
}

/** Fetch a path on the fixture via the harness client. */
export function fetchPath(h: Harness, path: string, options?: FetchOptions): Promise<ReturnType<FetchClient["fetch"]>> {
    return h.client.fetch(`${h.baseUrl}${path}`, options);
}

/** The canonical browser-headers + optional overrides merged into FetchOptions. */
export function withBrowserHeaders(overrides?: Readonly<Record<string, string>>): { headers: Record<string, string> } {
    return { headers: { ...BROWSER_HEADERS, ...overrides } };
}
