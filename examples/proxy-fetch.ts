/**
 * Example: fetch through an HTTP CONNECT proxy.
 *
 * Spins up a minimal CONNECT proxy in-process (node:http), then fetches
 * https://example.com through it via the client-level `proxy` option. The
 * proxy logs each tunnel request, proving the traffic actually flowed
 * through it — the browser fingerprint rides the tunnel unchanged.
 *
 * Run: `npx tsx examples/proxy-fetch.ts`
 */

import * as http from "node:http";
import * as net from "node:net";
import type { Duplex } from "node:stream";
import { createClient, FetchProxyError, platform, PROFILES } from "../src/index.js";

/** Handle one CONNECT request: dial the target and pipe both directions. */
function handleConnect(req: http.IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    // CONNECT targets arrive as "host:port" in the request URL (IPv6
    // literals would break a naive split(":") — split on the last colon).
    const target = req.url ?? "";
    const colonAt = target.lastIndexOf(":");
    if (colonAt < 1) {
        clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    }
    const host = target.slice(0, colonAt);
    const port = Number(target.slice(colonAt + 1));

    console.log("proxy: CONNECT %s:%d", host, port);
    const upstream = net.connect(port, host);
    upstream.on("connect", () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
    clientSocket.on("error", () => upstream.destroy());
}

async function main(): Promise<void> {
    const url = process.argv[2] ?? "https://example.com";

    // Bind port 0 (ephemeral) so the example never fights a fixed port.
    const server = http.createServer();
    server.on("connect", handleConnect);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("proxy did not bind to a TCP port");
    }
    console.log("proxy: listening on 127.0.0.1:%d", address.port);

    // Object literal instead of parseProxyUrl() — the proxy endpoint is
    // constructed here, not parsed from a URL.
    const client = createClient({
        profile: PROFILES["chrome-140"],
        proxy: { scheme: "http", host: "127.0.0.1", port: address.port },
        platform,
    });

    try {
        const response = await client.fetch(url, { timeoutMs: 15_000 });
        const body = await response.text();
        console.log("fetch:  %d %s (%d chars through the tunnel)", response.status, response.statusText, body.length);
    } catch (err) {
        // The typed seam for tunnel failures: proxyKind names the wrapped
        // @browsercore/proxy error ("ProxyAuthError", "ProxyTunnelError", ...).
        if (err instanceof FetchProxyError) {
            console.error("fetch: proxy tunnel failed: %s (%s)", err.proxyKind, err.message);
            process.exit(1);
        }
        throw err;
    } finally {
        await client.close();
        server.close();
    }
}

void main();
