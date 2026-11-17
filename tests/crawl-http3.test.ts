/**
 * Tests for the experimental HTTP/3 (QUIC) path in `crawl()` (`src/crawl.ts`).
 *
 * The HTTP/3 path is gated behind the `http3` option — when set, `crawl()`
 * routes every URL through `fetchHttp3()`, which establishes a fresh QUIC +
 * HTTP/3 connection per URL. We can't (and shouldn't) hit a real QUIC server
 * in unit tests, so we mock `@browsercore/quic` and `@browsercore/http3` with
 * fake connections that return canned responses. This exercises every branch
 * of the HTTP/3 code path without real I/O:
 *   - `fetchHttp3()`'s URL parsing + scheme validation
 *   - the worker's `usingHttp3` branch
 *   - the `connectQuic` + `connectHttp3` wiring
 *   - header/body mapping into the HTTP/3 request
 *   - response mapping into `CrawlResult.http3Response`
 *   - the http-scheme rejection path
 *   - factory-failure handling
 *   - request-error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crawl } from "../src/crawl.js";

// Mock the @browsercore/quic module: `connectQuic` returns a stub QUIC
// connection whose only job is to be passed through to `connectHttp3`.
// Use importOriginal so the real `makeConnectionId` (used by crawl.ts to mint
// branded ConnectionIds) stays available to the code under test.
vi.mock(import("@browsercore/quic"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        connectQuic: vi.fn(),
    };
});

// Mock the @browsercore/http3 module: `connectHttp3` returns a stub HTTP/3
// connection that records the request and returns a canned response.
vi.mock("@browsercore/http3", () => ({
    connectHttp3: vi.fn(),
}));

import { connectQuic } from "@browsercore/quic";
import { connectHttp3 } from "@browsercore/http3";
import type { ConnectionId, Http3Request, Http3Response } from "@browsercore/http3";
import type {
    DatagramCloseReason,
    DatagramTransport,
    QuicConnection,
    QuicStream,
    UdpAddress,
} from "@browsercore/quic";
import { firstResult } from "./fixtures/crawl-results.js";

const mockedConnectQuic = vi.mocked(connectQuic);
const mockedConnectHttp3 = vi.mocked(connectHttp3);

/** Loopback peer address the fake transport reports datagrams from. */
const fakeFrom: UdpAddress = { address: "127.0.0.1", port: 443, family: 4 };

/** A minimal fake DatagramTransport — only `id` is read by crawl.ts. */
function fakeDatagramTransport(): DatagramTransport {
    return {
        id: "fake-dg",
        send: vi.fn(async (_data: Uint8Array, _address: UdpAddress): Promise<void> => {}),
        recv: vi.fn(async (): Promise<{ readonly data: Uint8Array; readonly from: UdpAddress }> => ({
            data: new Uint8Array(),
            from: fakeFrom,
        })),
        close: vi.fn(async (_reason?: DatagramCloseReason): Promise<void> => {}),
    };
}

/**
 * Full fake QuicConnection. crawl() hands it straight to the (also mocked)
 * connectHttp3, so no method is ever driven — but the fake must satisfy the
 * CURRENT canonical interface surface, not a stale subset.
 */
function fakeQuicConnection(): QuicConnection {
    const unusedStream = async (): Promise<QuicStream> => {
        throw new Error("fake quic stream is never used in this suite");
    };
    return {
        id: "fake-quic",
        handshake: vi.fn(async (): Promise<void> => {}),
        openBidirectionalStream: vi.fn(unusedStream),
        acceptBidirectionalStream: vi.fn(unusedStream),
        openUnidirectionalStream: vi.fn(unusedStream),
        acceptUnidirectionalStream: vi.fn(unusedStream),
        close: vi.fn(async (_errorCode: bigint, _reason: string): Promise<void> => {}),
        sendPathChallenge: vi.fn((_data: Uint8Array): void => {}),
        hasPendingPathChallenge: vi.fn((_data: Uint8Array): boolean => false),
    };
}

/**
 * Branded-id narrowing cast, same pattern as the fixtures' TransportId /
 * FetchRequestId fakes — http3 exports no ConnectionId maker (its ConnectionId
 * is string-branded, unlike quic's bytes-branded one).
 */
const fakeH3Id = "fake-h3" as ConnectionId;

/**
 * Build a fake Http3Connection that responds with `statusCode`. `request`'s
 * parameter is typed as Http3Request so recorded mock calls expose the
 * request for assertions, and the object carries the full current interface
 * surface (push, goaway(streamId)).
 */
function fakeHttp3(statusCode: number, body = new Uint8Array()) {
    const cannedResponse: Http3Response = {
        statusCode,
        headers: new Map([["content-type", "text/plain"]]),
        body,
    };
    return {
        id: fakeH3Id,
        settings: {},
        request: vi.fn(async (_req: Http3Request): Promise<Http3Response> => cannedResponse),
        push: vi.fn(async (): Promise<Http3Response> => cannedResponse),
        goaway: vi.fn(async (_streamId: bigint): Promise<void> => {}),
        close: vi.fn(async (): Promise<void> => {}),
    };
}

/**
 * Fake Http3Connection whose request() rejects — for the request-failure
 * paths. Full current interface surface, same as {@link fakeHttp3}.
 */
function failingHttp3(rejection: () => Promise<Http3Response>) {
    return {
        id: fakeH3Id,
        settings: {},
        request: vi.fn(rejection),
        push: vi.fn(async (): Promise<Http3Response> => {
            throw new Error("push is never used in this suite");
        }),
        goaway: vi.fn(async (_streamId: bigint): Promise<void> => {}),
        close: vi.fn(async (): Promise<void> => {}),
    };
}

describe("crawl() — HTTP/3 path", () => {
    beforeEach(() => {
        mockedConnectQuic.mockReset();
        mockedConnectHttp3.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches a URL over HTTP/3 and maps the response into http3Response", async () => {
        const h3 = fakeHttp3(200, new TextEncoder().encode("hello"));
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (_h: string, _p: number): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["https://example.com/path?q=1"], { http3: factory }));

        // The factory was called for the origin.
        expect(factory).toHaveBeenCalledWith("example.com", 443);
        // QUIC + HTTP/3 were wired up.
        expect(mockedConnectQuic).toHaveBeenCalledTimes(1);
        expect(mockedConnectHttp3).toHaveBeenCalledTimes(1);
        // The result carries the HTTP/3 response (not the FetchResponse).
        expect(r.ok).toBe(true);
        expect(r.status).toBe(200);
        expect(r.http3Response).toBeDefined();
        expect(r.http3Response?.statusCode).toBe(200);
        expect(r.response).toBeUndefined();
        expect(r.error).toBeUndefined();
        // The connection was closed before returning.
        expect(h3.close).toHaveBeenCalledTimes(1);
    });

    it("maps request headers + body into the HTTP/3 request", async () => {
        const h3 = fakeHttp3(201);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const encoder = new TextEncoder();
        await crawl(["https://api.example.com/resource"], {
            http3: factory,
            fetchOptions: {
                method: "POST",
                headers: { "content-type": "application/json", "x-custom": "v" },
                body: encoder.encode('{"k":"v"}'),
            },
        });

        // The http3.request call should carry the mapped method, scheme,
        // authority, path, headers, and body.
        expect(h3.request).toHaveBeenCalledTimes(1);
        const req = h3.request.mock.calls[0]![0]!;
        expect(req.method).toBe("POST");
        expect(req.scheme).toBe("https");
        expect(req.authority).toBe("api.example.com");
        expect(req.path).toBe("/resource");
        expect(req.headers.get("content-type")).toBe("application/json");
        expect(req.headers.get("x-custom")).toBe("v");
        expect(req.body).toEqual(encoder.encode('{"k":"v"}'));
    });

    it("rejects http URLs (HTTP/3 requires https)", async () => {
        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["http://example.com/"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toContain("https");
        // The factory was never called — the scheme guard short-circuits.
        expect(factory).not.toHaveBeenCalled();
        expect(mockedConnectQuic).not.toHaveBeenCalled();
    });

    it("handles a malformed URL without throwing", async () => {
        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        // A URL that fails new URL() — the path-less ":" triggers a parse error.
        const r = firstResult(await crawl(["not a url"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/invalid URL/);
        expect(factory).not.toHaveBeenCalled();
    });

    it("records a factory failure as ok:false with an error", async () => {
        const factory = vi.fn(async (): Promise<DatagramTransport> => {
            throw new Error("udp bind failed");
        });
        const r = firstResult(await crawl(["https://example.com/"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toContain("udp bind failed");
        expect(mockedConnectQuic).not.toHaveBeenCalled();
    });

    it("records an http3.request failure as ok:false with an error", async () => {
        const h3 = failingHttp3(async (): Promise<Http3Response> => {
            throw new Error("stream reset");
        });
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["https://example.com/"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toContain("stream reset");
        // The connection was still closed in the finally block.
        expect(h3.close).toHaveBeenCalledTimes(1);
    });

    it("maps a 4xx HTTP/3 response to ok:false", async () => {
        const h3 = fakeHttp3(404);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["https://example.com/missing"], { http3: factory }));
        expect(r.status).toBe(404);
        expect(r.ok).toBe(false);
        expect(r.http3Response).toBeDefined();
    });

    it("maps a 5xx HTTP/3 response to ok:false", async () => {
        const h3 = fakeHttp3(503);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["https://example.com/"], { http3: factory }));
        expect(r.status).toBe(503);
        expect(r.ok).toBe(false);
    });

    it("handles multiple URLs over HTTP/3 (one connection each)", async () => {
        const h3a = fakeHttp3(200);
        const h3b = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValueOnce(h3a).mockResolvedValueOnce(h3b);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const results = await crawl(
            ["https://a.example.com/", "https://b.example.com/"],
            { http3: factory },
        );
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.ok)).toBe(true);
        expect(mockedConnectQuic).toHaveBeenCalledTimes(2);
        expect(mockedConnectHttp3).toHaveBeenCalledTimes(2);
        expect(h3a.close).toHaveBeenCalledTimes(1);
        expect(h3b.close).toHaveBeenCalledTimes(1);
    });

    it("respects a non-default port from the URL", async () => {
        const h3 = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (_h: string, _p: number): Promise<DatagramTransport> => fakeDatagramTransport());
        await crawl(["https://example.com:8443/"], { http3: factory });
        expect(factory).toHaveBeenCalledWith("example.com", 8443);
    });

    it("passes timeoutMs through to the QUIC handshake", async () => {
        const h3 = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        await crawl(["https://example.com/"], { http3: factory, timeoutMs: 5000 });
        // The connectQuic call should receive the forwarded handshake timeout.
        const quicOpts = mockedConnectQuic.mock.calls[0]![0]!;
        expect(quicOpts.handshakeTimeoutMs).toBe(5000);
    });

    it("passes a Uint8Array body through without re-encoding", async () => {
        const h3 = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const raw = new Uint8Array([1, 2, 3, 4]);
        await crawl(["https://example.com/"], {
            http3: factory,
            fetchOptions: { method: "PUT", body: raw },
        });
        const req = h3.request.mock.calls[0]![0]!;
        // The same Uint8Array instance should be passed through (not encoded).
        expect(req.body).toBe(raw);
    });

    it("stringifies a non-Error factory rejection (String(err) fallback)", async () => {
        const factory = vi.fn(async (): Promise<DatagramTransport> => {
            throw "raw-string";
        });
        const r = firstResult(await crawl(["https://example.com/"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toBe("raw-string");
    });

    it("closes the connection even when http3.request throws a non-Error", async () => {
        const h3 = failingHttp3(async (): Promise<Http3Response> => {
            throw 42;
        });
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const r = firstResult(await crawl(["https://example.com/"], { http3: factory }));
        expect(r.ok).toBe(false);
        expect(r.error).toBe("42");
        expect(h3.close).toHaveBeenCalledTimes(1);
    });

    it("encodes a string body via TextEncoder (HTTP/3 path)", async () => {
        // The `typeof body === "string"` branch: a string body must be encoded
        // to UTF-8 bytes before being passed to the HTTP/3 layer.
        const h3 = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        const encoder = new TextEncoder();
        await crawl(["https://example.com/submit"], {
            http3: factory,
            fetchOptions: { method: "POST", body: "plain string body" },
        });

        const req = h3.request.mock.calls[0]![0]!;
        // The string body should be encoded to UTF-8 bytes.
        expect(req.body).toEqual(encoder.encode("plain string body"));
    });

    it("detects IPv6 host and sets family: 6 on the UDP address", async () => {
        // familyForHost() returns 6 when the host contains ":" (IPv6). An IPv6
        // URL like https://[::1]/ exercises this branch.
        const h3 = fakeHttp3(200);
        mockedConnectQuic.mockResolvedValue(fakeQuicConnection());
        mockedConnectHttp3.mockResolvedValue(h3);

        const factory = vi.fn(async (): Promise<DatagramTransport> => fakeDatagramTransport());
        await crawl(["https://[::1]/"], { http3: factory });

        // The factory should receive the bracketed IPv6 host.
        expect(factory).toHaveBeenCalledWith("[::1]", 443);
        // The connectQuic call should carry family: 6 for IPv6.
        const quicOpts = mockedConnectQuic.mock.calls[0]![0]!;
        expect(quicOpts.peer.family).toBe(6);
    });

});
