/**
 * Unit tests for {@link crawl} and the curated {@link PROFILES} constants.
 *
 * `crawl` builds its own client internally, so to exercise it without the real
 * network we inject a `transportFactory` that points at a plain loopback HTTP
 * server (always 200). This isolates crawl's batching, concurrency, result
 * ordering, and error handling from the bot-detection fixture's header logic.
 *
 * Reuses the battle-tested {@link LoopbackTransport} from the e2e fixtures so
 * HTTP parsing is exercised against a genuine in-process HTTP/1.1 server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { connect as connectNet } from "node:net";
import type { Transport } from "@browsercore/transport";
import { crawl } from "../src/crawl.js";
import { PROFILES, CHROME_140, FIREFOX_128, type StarterProfile } from "../src/profiles.js";
import { LoopbackTransport } from "./fixtures/fake-transport.js";

/** A transportFactory pointing every URL at a fixed loopback server. */
const pointAt = (port: number) => async (): Promise<Transport> => {
    const socket = connectNet({ host: "127.0.0.1", port });
    const transport = new LoopbackTransport(socket, "crawl-host", port);
    if (socket.readyState !== "open") {
        await new Promise<void>((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("error", reject);
        });
    }
    return transport;
};

/** Spin up an always-200 loopback server; return its bound port. */
async function startOkServer(): Promise<{ server: Server; port: number }> {
    const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/plain", connection: "close" });
        res.end("hello");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    return { server, port };
}

describe("crawl", () => {
    let server: Server;
    let port: number;

    beforeAll(async () => {
        ({ server, port } = await startOkServer());
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("fetches every URL and returns results in input order", async () => {
        const urls = Array.from({ length: 5 }, (_, i) => `http://host-${i}/page`);
        const results = await crawl(urls, { transportFactory: pointAt(port) });
        expect(results).toHaveLength(urls.length);
        results.forEach((r, i) => {
            expect(r.url).toBe(urls[i]);
            expect(r.ok).toBe(true);
            expect(r.status).toBe(200);
        });
    });

    it("records a failed fetch as ok:false without aborting the batch", async () => {
        // Good host points at the always-200 loopback server. Bad host points at
        // a server that accepts then immediately closes the socket, so the
        // fetch fails with a clean transport-closed error (not a refused
        // connection) and crawl records it as ok:false without aborting.
        const hangupServer = createServer((req, res) => {
            req.resume();
            res.destroy();
        });
        await new Promise<void>((resolve) => hangupServer.listen(0, "127.0.0.1", resolve));
        const addr = hangupServer.address();
        const badPort = typeof addr === "object" && addr !== null ? addr.port : 0;
        const factory = async (host: string): Promise<Transport> => {
            const usePort = host === "ok-host" ? port : badPort;
            const socket = connectNet({ host: "127.0.0.1", port: usePort });
            const transport = new LoopbackTransport(socket, host, usePort);
            if (socket.readyState !== "open") {
                await new Promise<void>((resolve, reject) => {
                    socket.once("connect", resolve);
                    socket.once("error", reject);
                });
            }
            return transport;
        };
        const urls = ["http://ok-host/", "http://bad-host/"];
        // Short timeout so a dead connection fails fast instead of hanging.
        const results = await crawl(urls, { transportFactory: factory, timeoutMs: 2000 });
        expect(results).toHaveLength(urls.length);
        expect(results[0]?.ok).toBe(true);
        expect(results[1]?.ok).toBe(false);
        expect(typeof results[1]?.error).toBe("string");
        await new Promise<void>((resolve) => hangupServer.close(() => resolve()));
    });

    it("processes requests serially at concurrency 1", async () => {
        // Immediate-responding server that tracks how many requests are in
        // flight at once. With concurrency 1 the issuer never overlaps, so at
        // most one request is in flight at a time.
        let inFlight = 0;
        let maxInFlight = 0;
        const muxServer = createServer((_req, res) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            res.writeHead(200, { connection: "close" });
            res.end("x");
            inFlight -= 1;
        });
        await new Promise<void>((resolve) => muxServer.listen(0, "127.0.0.1", resolve));
        const addr = muxServer.address();
        const mPort = typeof addr === "object" && addr !== null ? addr.port : 0;
        try {
            const urls = Array.from({ length: 4 }, () => `http://seq-${mPort}/`);
            await crawl(urls, { transportFactory: pointAt(mPort), concurrency: 1 });
            expect(maxInFlight).toBeLessThanOrEqual(1);
        } finally {
            await new Promise<void>((resolve) => muxServer.close(() => resolve()));
        }
    });
});

describe("PROFILES", () => {
    it("exports the documented starter profile ids", () => {
        expect(CHROME_140).toBe("chrome-140");
        expect(FIREFOX_128).toBe("firefox-128");
        expect(PROFILES["chrome-140"]).toBe("chrome-140");
        expect(PROFILES["firefox-128"]).toBe("firefox-128");
    });

    it("covers every starter profile alias", () => {
        const aliases: StarterProfile[] = ["chrome-140", "firefox-128"];
        for (const alias of aliases) {
            expect(PROFILES[alias]).toBeDefined();
        }
        expect(Object.keys(PROFILES).sort()).toEqual(aliases.sort());
    });
});
