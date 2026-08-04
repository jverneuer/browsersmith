/**
 * Unit tests for the {@link crawl()} helper.
 *
 * Self-contained: boots its own behavior fixture server and wires a loopback
 * transport to it, so this file does not depend on the shared behavior harness
 * (which is being modified concurrently by PR #13). Covers: the success path,
 * non-2xx statuses (ok: false), timeouts (error path), result ordering,
 * concurrency, delay, custom fetchOptions merging, an externally-supplied
 * cookie jar, default-option behavior, and the experimental HTTP/3 error paths.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { connect as connectNet } from "node:net";
import { EventEmitter } from "node:events";
import { crawl } from "../src/crawl.js";
import { createCookieJar } from "@browsercore/cookies";
import type { Transport } from "@browsercore/transport";
import type { TransportId, TransportState, CloseReason } from "@browsercore/transport";
import type { DatagramTransport, UdpAddress } from "@browsercore/quic";
import type { Http3Connection, Http3Response } from "@browsercore/http3";

// ---------------------------------------------------------------------------
// Loopback transport — a simplified version of tests/fixtures/fake-transport.ts
// (reproduced here so this file is self-contained). Wires the fetch client to a
// real Node http.Server over a loopback TCP socket, with no TLS.
// ---------------------------------------------------------------------------
class LoopbackTransport extends EventEmitter implements Transport {
    readonly id: TransportId;
    private readonly socket: ReturnType<typeof connectNet>;
    private stateValue: TransportState;
    private readonly readQueue: Uint8Array[] = [];
    private readonly waiters: Array<(chunk: Uint8Array) => void> = [];
    private static counter = 0;

    constructor(socket: ReturnType<typeof connectNet>) {
        super();
        LoopbackTransport.counter += 1;
        this.id = `loopback-${LoopbackTransport.counter}` as TransportId;
        this.socket = socket;
        this.stateValue = { state: "connecting" };

        socket.on("connect", () => {
            this.stateValue = { state: "open" };
            this.emit("open");
        });
        socket.on("data", (data: Buffer) => {
            const waiter = this.waiters.shift();
            if (waiter === undefined) {
                this.readQueue.push(new Uint8Array(data));
                this.emit("data", new Uint8Array(data));
            } else {
                waiter(new Uint8Array(data));
            }
        });
        socket.on("close", () => {
            this.stateValue = { state: "closed", reason: { kind: "remote_close" } satisfies CloseReason };
            for (const reject of this.waiters.splice(0)) {
                reject(new Error("transport closed"));
            }
            this.emit("close", false);
        });
        socket.on("error", (err: Error) => {
            this.emit("error", err);
        });
    }

    get state(): TransportState {
        return this.stateValue;
    }

    write(data: Uint8Array): Promise<void> {
        if (this.socket.destroyed) {
            return Promise.reject(new Error("transport not open"));
        }
        return new Promise<void>((resolve, reject) => {
            this.socket.write(Buffer.from(data), (err) => {
                if (err !== null && err !== undefined) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    read(): Promise<Uint8Array> {
        const queued = this.readQueue.shift();
        if (queued !== undefined) {
            return Promise.resolve(queued);
        }
        return new Promise<Uint8Array>((resolve, reject) => {
            this.waiters.push(resolve);
        });
    }

    close(reason?: CloseReason): Promise<void> {
        this.stateValue = { state: "closing" };
        if (!this.socket.destroyed) {
            this.socket.destroy();
        }
        this.stateValue = { state: "closed", reason: reason ?? { kind: "client_close" } };
        this.emit("close", true);
        return Promise.resolve();
    }
}

function loopbackTransportFactory(port: number): (host: string, p: number) => Promise<Transport> {
    return async (_host: string, _p: number): Promise<Transport> => {
        void _host;
        void _p;
        const socket = connectNet({ host: "127.0.0.1", port });
        const transport = new LoopbackTransport(socket);
        if (socket.readyState !== "open") {
            await new Promise<void>((resolve, reject) => {
                socket.once("connect", resolve);
                socket.once("error", reject);
            });
        }
        return transport;
    };
}

// ---------------------------------------------------------------------------
// Minimal behavior fixture server (mirrors tests/fixtures/behavior-server.ts).
// Endpoints: /land (200), /slow?ms=N, /echo-headers, /does-not-exist → 404.
// ---------------------------------------------------------------------------
async function startBehaviorServer(): Promise<{ server: Server; baseUrl: string; port: number }> {
    const server = createServer((req, res) => {
        const url = req.url ?? "/";
        if (url === "/land") {
            const body = JSON.stringify({ landed: true });
            res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        if (url.startsWith("/slow")) {
            const parsed = new URL(url, "http://x");
            const ms = Number(parsed.searchParams.get("ms") ?? "100");
            setTimeout(() => {
                const body = JSON.stringify({ waited: ms });
                res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
                res.end(body);
            }, ms);
            return;
        }
        if (url === "/echo-headers") {
            const raw: Array<[string, string]> = [];
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const name = req.rawHeaders[i];
                const value = req.rawHeaders[i + 1];
                if (name !== undefined && value !== undefined) {
                    raw.push([name, value]);
                }
            }
            const body = JSON.stringify({ headers: raw });
            res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        const body = JSON.stringify({ error: "not found", url });
        res.writeHead(404, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
        res.end(body);
    });
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    return { server, baseUrl: `http://localhost:${port}`, port };
}

interface Fixture {
    baseUrl: string;
    transportFactory: (host: string, p: number) => Promise<Transport>;
    close(): Promise<void>;
}

async function setupFixture(): Promise<Fixture> {
    const { server, baseUrl, port } = await startBehaviorServer();
    return {
        baseUrl,
        transportFactory: loopbackTransportFactory(port),
        async close() {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}

// ---------------------------------------------------------------------------
// Mock @browsercore/http3's connectHttp3: it is currently a stub that throws
// "TODO: implement connectHttp3 (Step 6)". We replace it with a configurable
// fake so the HTTP/3 success path in fetchHttp3() is testable without a real
// QUIC+HTTP/3 server. vi.hoisted creates a mock fn we can reconfigure per-test.
// ---------------------------------------------------------------------------
const { connectHttp3Mock } = vi.hoisted(() => ({
    connectHttp3Mock: vi.fn(),
}));

vi.mock("@browsercore/http3", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@browsercore/http3")>();
    return {
        ...actual,
        connectHttp3: connectHttp3Mock,
    };
});

/**
 * A fake {@link DatagramTransport} for the HTTP/3 path. The success path
 * needs a real QUIC+HTTP/3 server (a large fixture); the error paths only
 * need a transport that fails in a controlled way. `behavior` selects how
 * recv() resolves.
 */
class FakeDatagramTransport implements DatagramTransport {
    readonly id = "fake-http3";
    constructor(
        readonly behavior:
            | "recv-rejects"
            | "recv-never"
            | "send-rejects" = "recv-rejects",
    ) {}
    async send(_data: Uint8Array, _address: UdpAddress): Promise<void> {
        if (this.behavior === "send-rejects") {
            throw new Error("fake send failure");
        }
    }
    async recv(): Promise<{ readonly data: Uint8Array; readonly from: UdpAddress }> {
        if (this.behavior === "recv-rejects") {
            throw new Error("fake recv failure");
        }
        // recv-never: hang forever (caller should time out).
        return new Promise(() => {});
    }
    async close(): Promise<void> {}
}

/** A fake Http3Connection whose request() returns a canned response. */
function makeFakeHttp3Connection(response: Http3Response): Http3Connection {
    return {
        id: "fake-http3-conn",
        settings: {},
        async request(): Promise<Http3Response> {
            return response;
        },
        async goaway(): Promise<void> {},
        async close(): Promise<void> {},
    };
}

describe("crawl()", () => {
    let fixture: Fixture;
    beforeEach(async () => {
        fixture = await setupFixture();
    });
    afterEach(async () => {
        await fixture.close();
    });

    it("returns an empty array for an empty URL list", async () => {
        const results = await crawl([]);
        expect(results).toEqual([]);
    });

    it("fetches a single URL and reports ok: true on a 200", async () => {
        const results = await crawl([`${fixture.baseUrl}/land`], {
            transportFactory: fixture.transportFactory,
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first).toBeDefined();
        expect(first?.url).toBe(`${fixture.baseUrl}/land`);
        expect(first?.ok).toBe(true);
        expect(first?.status).toBe(200);
        expect(first?.response).toBeDefined();
        expect(first?.error).toBeUndefined();
    });

    it("records ok: false with the status on a 404", async () => {
        const results = await crawl([`${fixture.baseUrl}/does-not-exist`], {
            transportFactory: fixture.transportFactory,
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(false);
        expect(first?.status).toBe(404);
        expect(first?.response).toBeDefined();
        expect(first?.error).toBeUndefined();
    });

    it("returns results in input order despite varying latency", async () => {
        const urls = [
            `${fixture.baseUrl}/slow?ms=30`,
            `${fixture.baseUrl}/land`,
        ];
        const results = await crawl(urls, {
            transportFactory: fixture.transportFactory,
            timeoutMs: 5_000,
        });
        expect(results.map((r) => r.url)).toEqual(urls);
        expect(results.every((r) => r.ok)).toBe(true);
    });

    it("runs more than one request in parallel when concurrency > 1", async () => {
        const urls = [
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
        ];
        const results = await crawl(urls, {
            transportFactory: fixture.transportFactory,
            concurrency: 3,
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(3);
        expect(results.every((r) => r.ok && r.status === 200)).toBe(true);
    });

    it("honors delayMs between requests (serial, sleeps between batches)", async () => {
        const urls = [
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
        ];
        const delayMs = 50;
        const start = Date.now();
        const results = await crawl(urls, {
            transportFactory: fixture.transportFactory,
            delayMs,
            concurrency: 1,
            timeoutMs: 5_000,
        });
        const elapsed = Date.now() - start;
        // Serial (concurrency 1) with delayMs between 3 URLs → at least 2 delays.
        expect(elapsed).toBeGreaterThanOrEqual(delayMs * 2 - 10);
        expect(results.every((r) => r.ok)).toBe(true);
    });

    it("records ok: false + an error string on timeout", async () => {
        const results = await crawl([`${fixture.baseUrl}/slow?ms=500`], {
            transportFactory: fixture.transportFactory,
            timeoutMs: 50,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(false);
        expect(first?.error).toBeDefined();
        expect(typeof first?.error).toBe("string");
    });

    it("merges custom fetchOptions (headers) into every request", async () => {
        const results = await crawl([`${fixture.baseUrl}/echo-headers`], {
            transportFactory: fixture.transportFactory,
            fetchOptions: { headers: { "x-test": "crawl-merge" } },
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const body = await results[0]?.response?.json() as { headers: Array<[string, string]> } | undefined;
        const headerNames = body?.headers.map(([n]) => n.toLowerCase()) ?? [];
        expect(headerNames).toContain("x-test");
    });

    it("uses an externally-supplied cookie jar when provided", async () => {
        const externalJar = createCookieJar();
        // setCookie parses a raw Set-Cookie header against a request URL.
        externalJar.setCookie("preset=carried-over", {
            hostname: "localhost",
            pathname: "/",
            protocol: "http:",
        });
        const results = await crawl([`${fixture.baseUrl}/echo-headers`], {
            transportFactory: fixture.transportFactory,
            cookieJar: externalJar,
            timeoutMs: 5_000,
        });
        const body = await results[0]?.response?.json() as { headers: Array<[string, string]> } | undefined;
        const cookieHeader = body?.headers.find(([n]) => n.toLowerCase() === "cookie");
        expect(cookieHeader?.[1]).toContain("preset=carried-over");
    });

    it("defaults concurrency to 1 when concurrency is omitted", async () => {
        const results = await crawl([`${fixture.baseUrl}/land`], {
            transportFactory: fixture.transportFactory,
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        expect(results[0]?.ok).toBe(true);
    });

    it("clamps concurrency < 1 to 1 via Math.max(1, concurrency)", async () => {
        const results = await crawl([`${fixture.baseUrl}/land`], {
            transportFactory: fixture.transportFactory,
            concurrency: 0,
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        expect(results[0]?.ok).toBe(true);
    });

    it("defaults delayMs to 0 (sleep no-op path) when delayMs is omitted", async () => {
        const start = Date.now();
        const results = await crawl([
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
            `${fixture.baseUrl}/land`,
        ], {
            transportFactory: fixture.transportFactory,
            concurrency: 3,
            timeoutMs: 5_000,
        });
        const elapsed = Date.now() - start;
        // With no delay and concurrency 3, all 3 fire near-simultaneously.
        expect(elapsed).toBeLessThan(1_000);
        expect(results.every((r) => r.ok)).toBe(true);
    });

    it("omits timeoutMs from merged fetch options when timeoutMs is not provided", async () => {
        // Drives the `timeoutMs === undefined ? {} : { timeoutMs }` branch where
        // the empty object is spread (i.e. timeoutMs is NOT forwarded). We assert
        // the request still succeeds within the client's default timeout.
        const results = await crawl([`${fixture.baseUrl}/land`], {
            transportFactory: fixture.transportFactory,
        });
        expect(results).toHaveLength(1);
        expect(results[0]?.ok).toBe(true);
        expect(results[0]?.status).toBe(200);
    });
});

describe("crawl() — experimental HTTP/3 path", () => {
    // The HTTP/3 success path requires a real QUIC + HTTP/3 server fixture —
    // a large undertaking. These tests cover the error branches of fetchHttp3()
    // that are reachable without one (malformed URL, non-https scheme, a
    // factory that throws, a transport that fails the QUIC handshake), plus
    // the success path via the hoisted connectHttp3Mock above.

    const successResponse: Http3Response = {
        statusCode: 200,
        headers: new Map([["content-type", "text/plain"]]),
        body: new TextEncoder().encode("http3-body"),
    };

    beforeEach(() => {
        // Default mock behavior: connectHttp3 throws the same TODO the real
        // stub throws, so error-path tests that reach connectHttp3 still see
        // the documented failure. The success test overrides this.
        connectHttp3Mock.mockImplementation(async (): Promise<Http3Connection> => {
            throw new Error("TODO: implement connectHttp3 (Step 6)");
        });
    });

    afterEach(() => {
        connectHttp3Mock.mockReset();
    });

    it("records ok: false + error when the http3 URL is malformed", async () => {
        const results = await crawl(["not-a-url"], {
            http3: () => new FakeDatagramTransport(),
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(false);
        expect(first?.error).toContain("invalid URL");
    });

    it("records ok: false + error when the http3 URL is not https", async () => {
        const results = await crawl(["http://localhost/land"], {
            http3: () => new FakeDatagramTransport(),
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(false);
        expect(first?.error).toContain("HTTP/3 requires https");
    });

    it("records ok: false + error when the http3 factory throws", async () => {
        const results = await crawl(["https://localhost/land"], {
            http3: (): DatagramTransport => {
                throw new Error("factory exploded");
            },
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(false);
        expect(first?.error).toContain("factory exploded");
    });

    it("rejects when the QUIC transport fails and connectHttp3 throws (stub)", async () => {
        // The fake transport makes the QUIC handshake fail; connectHttp3 is a
        // stub that throws "TODO". That throw escapes fetchHttp3 (connectHttp3
        // is called outside its try block) and surfaces as a rejected promise.
        await expect(
            crawl(["https://localhost/land"], {
                http3: () => new FakeDatagramTransport("recv-rejects"),
                timeoutMs: 5_000,
            }),
        ).rejects.toThrow();
    });

    it("covers the familyForHost IPv6 branch via an IPv6 https URL", async () => {
        // An IPv6 host triggers family: 6 inside fetchHttp3(). The QUIC
        // handshake or connectHttp3 then errors (fake transport / stub), but
        // the familyForHost() branch is exercised first. The stub's throw
        // surfaces as a rejected promise.
        await expect(
            crawl(["https://[::1]/land"], {
                http3: () => new FakeDatagramTransport("recv-rejects"),
                timeoutMs: 5_000,
            }),
        ).rejects.toThrow();
    });

    it("returns ok: true + http3Response when the HTTP/3 request succeeds", async () => {
        // Override the default throwing mock: connectHttp3 now returns a fake
        // connection whose request() answers with a canned 200. This exercises
        // the success branch of fetchHttp3() (status/headers/body mapping,
        // http3Response field, ok: true).
        connectHttp3Mock.mockImplementation(async () => makeFakeHttp3Connection(successResponse));

        const results = await crawl(["https://localhost/land"], {
            http3: () => new FakeDatagramTransport(),
            timeoutMs: 5_000,
        });
        expect(results).toHaveLength(1);
        const first = results[0];
        expect(first?.ok).toBe(true);
        expect(first?.status).toBe(200);
        expect(first?.http3Response).toBeDefined();
        expect(first?.http3Response?.statusCode).toBe(200);
        // The TCP-path response field and the http3 response field are mutually
        // exclusive by design.
        expect(first?.response).toBeUndefined();
    });
});
