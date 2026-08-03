/**
 * Behavior fixture — a plain http.Server for redirect, compression, and
 * abort/timeout tests. Separate from the bot-detection fixture so each focuses
 * on one concern and stays small (≤370 lines).
 *
 * Endpoints:
 *   GET /redirect/301 → 301 to /land
 *   GET /redirect/chain → 302 → 307 → /land
 *   GET /redirect/loop → 302 to /redirect/loop (manual policy to test loops)
 *   GET /land         → 200 "landed"
 *   GET /gzip         → 200 with gzip-encoded body + content-encoding: gzip
 *   GET /deflate      → 200 with deflate-encoded body
 *   GET /slow?ms=N    → waits N ms then 200 (for timeout/abort tests)
 *   GET /echo-headers → 200 JSON of received headers (for header-order checks)
 */

import { createServer, type Server, type RequestListener, type ServerResponse, type IncomingMessage } from "node:http";
import { gzipSync, deflateSync } from "node:zlib";

/** Start the behavior fixture on an ephemeral port. Returns server + baseUrl. */
export async function startBehaviorServer(): Promise<{ server: Server; baseUrl: string; port: number }> {
    const server = createServer(handler);
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve();
        });
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    return { server, baseUrl: `http://localhost:${port}`, port };
}

/** Stop the behavior fixture. */
export async function stopBehaviorServer(server: Server): Promise<void> {
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
}

/** Send a JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data),
    });
    res.end(data);
}

const handler: RequestListener = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url ?? "/";
    const host = req.headers.host ?? "localhost";

    if (url === "/redirect/301") {
        res.writeHead(301, { location: `/land` });
        res.end();
        return;
    }
    if (url === "/redirect/chain") {
        res.writeHead(302, { location: `/redirect/chain-2` });
        res.end();
        return;
    }
    if (url === "/redirect/chain-2") {
        res.writeHead(307, { location: `/land` });
        res.end();
        return;
    }
    if (url === "/redirect/loop") {
        res.writeHead(302, { location: `/redirect/loop` });
        res.end();
        return;
    }
    if (url === "/land") {
        sendJson(res, 200, { landed: true, host });
        return;
    }
    if (url === "/gzip") {
        const body = gzipSync(Buffer.from("gzip-decoded-body"));
        res.writeHead(200, {
            "content-type": "text/plain",
            "content-encoding": "gzip",
            "content-length": body.length,
        });
        res.end(body);
        return;
    }
    if (url === "/deflate") {
        const body = deflateSync(Buffer.from("deflate-decoded-body"));
        res.writeHead(200, {
            "content-type": "text/plain",
            "content-encoding": "deflate",
            "content-length": body.length,
        });
        res.end(body);
        return;
    }
    if (url.startsWith("/slow")) {
        const parsed = new URL(url, "http://x");
        const ms = Number(parsed.searchParams.get("ms") ?? "100");
        setTimeout(() => {
            sendJson(res, 200, { waited: ms });
        }, ms);
        return;
    }
    if (url === "/echo-headers") {
        // Echo raw header names + values in arrival order.
        const raw: Array<[string, string]> = [];
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
            const name = req.rawHeaders[i];
            const value = req.rawHeaders[i + 1];
            if (name !== undefined && value !== undefined) {
                raw.push([name, value]);
            }
        }
        sendJson(res, 200, { headers: raw });
        return;
    }
    sendJson(res, 404, { error: "not found", url });
};
