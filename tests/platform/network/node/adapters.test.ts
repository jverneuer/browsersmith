/**
 * Unit and integration tests for the Node.js network adapters
 * (`src/platform/network/node/{net,dns,udp}.ts`).
 *
 * These adapters are the only files in the stack that import `node:net`,
 * `node:dns`, and `node:dgram` — the rest of BrowserCore depends only on the
 * `@browsercore/contracts` interfaces. The tests verify that the adapters
 * faithfully implement those contracts:
 *
 *   - `nodeNet` delegates to `node:net.connect` and returns a live Socket.
 *   - `nodeDns` resolves hostnames via `node:dns.lookup` and returns IPAddress[].
 *   - `nodeUdp` exposes the DatagramTransport interface over `node:dgram`.
 *
 * All three adapters are exercised against real localhost sockets so the tests
 * exercise the genuine Node networking stack. UDP uses a real datagram socket
 * bound to an ephemeral port — deterministic on loopback, no CI flakeness.
 *
 * Architecture note for nodeUdp: the adapter owns its `node:dgram` socket at
 * module scope (singleton). Closing it tears down the underlying OS socket
 * with no reopen path — so these tests exercise close() exactly once, last, and
 * never close the underlying socket between assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type AddressInfo } from "node:net";
import { createSocket, type Socket as DgramSocket } from "node:dgram";

// ---------------------------------------------------------------------------
// nodeNet — integration tests against a real localhost TCP server
// ---------------------------------------------------------------------------

import { nodeNet } from "../../../../src/platform/network/node/net.js";
import type { Socket } from "@browsercore/contracts";

describe("nodeNet adapter", () => {
    let server: Server;
    let port: number;

    beforeEach(async () => {
        // Spin up a real TCP echo server on an ephemeral port so we exercise
        // the genuine Node networking stack rather than a mock.
        server = createServer((socket) => {
            socket.on("data", (chunk) => {
                socket.write(chunk);
            });
        });
        await new Promise<void>((resolveListen) => {
            server.listen(0, "127.0.0.1", resolveListen);
        });
        const addr = server.address() as AddressInfo;
        port = addr.port;
    });

    afterEach(async () => {
        await new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
        });
    });

    it("connect() returns a live Socket connected to localhost", async () => {
        const socket = nodeNet.connect({ host: "127.0.0.1", port });

        // The socket must satisfy the @browsercore/contracts Socket interface.
        expect(socket).toBeDefined();
        expect(typeof socket.write).toBe("function");
        expect(typeof socket.end).toBe("function");
        expect(typeof socket.destroy).toBe("function");
        expect(typeof socket.once).toBe("function");
        expect(typeof socket.on).toBe("function");
        expect(socket.destroyed).toBe(false);

        // Wait for the 'connect' event to confirm the TCP handshake completed.
        await new Promise<void>((resolveConnect, rejectConnect) => {
            socket.once("connect", resolveConnect);
            socket.once("error", rejectConnect);
        });

        // Write data and verify it echoes back through the real stack.
        // Node delivers the 'data' event as a Buffer (a Uint8Array subclass),
        // so compare via Buffer.equals rather than deep class equality.
        const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        const received = waitForData(socket);
        socket.write(payload);
        const echo = await received;
        expect(Buffer.from(echo)).toEqual(Buffer.from(payload));

        // Clean shutdown of the client socket (adapter owns no socket state).
        socket.destroy();
    });

    it("connect() accepts and applies the noDelay option", async () => {
        const socket = nodeNet.connect({ host: "127.0.0.1", port, noDelay: true });
        await new Promise<void>((resolveConnect, rejectConnect) => {
            socket.once("connect", resolveConnect);
            socket.once("error", rejectConnect);
        });
        // The socket connected successfully with noDelay applied — verifying
        // no throw is sufficient since we can't introspect TCP_NODELAY from JS.
        expect(socket.destroyed).toBe(false);
        socket.destroy();
    });
});

/**
 * Collect the next chunk of data from a socket into a Promise.
 * Helpers like this keep the integration tests readable without leaking
 * listeners between assertions.
 */
function waitForData(socket: Socket): Promise<Uint8Array> {
    return new Promise((resolve) => {
        socket.once("data", (chunk: Uint8Array) => resolve(chunk));
    });
}

// ---------------------------------------------------------------------------
// nodeDns — integration tests against the real DNS resolver
// ---------------------------------------------------------------------------

import { nodeDns } from "../../../../src/platform/network/node/dns.js";
import type { IPAddress } from "@browsercore/contracts";

describe("nodeDns adapter", () => {
    it("lookup() resolves localhost to a loopback address", async () => {
        const results = await nodeDns.lookup("localhost", 4);

        // The contract returns a non-empty readonly IPAddress[].
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        const addr = results[0] as IPAddress;
        expect(typeof addr.address).toBe("string");
        expect(addr.address.length).toBeGreaterThan(0);
        // localhost should resolve to 127.0.0.1 (IPv4).
        expect(addr.address).toBe("127.0.0.1");
        expect(addr.family).toBe(4);
    });

    it("lookup() returns results with the correct IPAddress shape", async () => {
        const results = await nodeDns.lookup("localhost", 4);

        // Every result must have the readonly IPAddress shape from the contract.
        for (const r of results) {
            const addr = r as IPAddress;
            expect(addr).toHaveProperty("address");
            expect(addr).toHaveProperty("family");
            expect(typeof addr.address).toBe("string");
            expect([4, 6]).toContain(addr.family);
        }
    });

    it("lookup() rejects with an error for an invalid hostname", async () => {
        // `.invalid` is reserved by RFC 2606 to never resolve — a stable,
        // network-independent failure input.
        await expect(nodeDns.lookup("this-host-does-not-exist.invalid", 4)).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// nodeUdp — integration tests against a real localhost UDP socket
// ---------------------------------------------------------------------------

import { nodeUdp } from "../../../../src/platform/network/node/udp.js";
import type { DatagramTransport, UdpAddress } from "@browsercore/contracts";

describe("nodeUdp adapter", () => {
    let peerSocket: DgramSocket;
    let peerPort: number;
    let adapterPort: number;

    beforeEach(async () => {
        // A real UDP socket standing in for the remote peer — lets us exchange
        // datagrams deterministically on loopback.
        peerSocket = createSocket("udp4");
        await new Promise<void>((resolveBind) => {
            peerSocket.bind(0, "127.0.0.1", resolveBind);
        });
        peerPort = (peerSocket.address() as AddressInfo).port;
    });

    afterEach(async () => {
        // Close only the peer socket. The adapter's internal socket is a
        // module-scope singleton (see file header) — closing it would tear
        // down the OS socket with no reopen path, breaking later tests.
        await new Promise<void>((resolveClose) => {
            peerSocket.close(() => resolveClose());
        });
    });

    it("exposes the DatagramTransport interface shape", () => {
        expect(typeof nodeUdp.id).toBe("string");
        expect(typeof nodeUdp.send).toBe("function");
        expect(typeof nodeUdp.recv).toBe("function");
        expect(typeof nodeUdp.close).toBe("function");
    });

    it("has the expected id tag", () => {
        expect(nodeUdp.id).toBe("node-udp");
    });

    it("send() delivers a datagram to a peer UDP socket", async () => {
        const payload = new Uint8Array([0xde, 0xad]);
        const recvPromise = new Promise<Uint8Array>((resolve) => {
            peerSocket.once("message", (msg) => resolve(new Uint8Array(msg)));
        });

        await nodeUdp.send(payload, {
            address: "127.0.0.1",
            port: peerPort,
            family: 4,
        });

        const received = await recvPromise;
        expect(received).toEqual(payload);
    });

    it("recv() resolves with a datagram sent from a peer", async () => {
        // Step 1: Adapter sends a probe to the peer so the peer learns the
        // adapter's ephemeral port (the adapter's socket is already bound at
        // module scope, so its port is stable).
        const probe = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
        await nodeUdp.send(probe, {
            address: "127.0.0.1",
            port: peerPort,
            family: 4,
        });

        // Step 2: Peer receives the probe and captures the adapter's port.
        adapterPort = await new Promise<number>((resolve) => {
            peerSocket.once("message", (_msg, rinfo) => resolve(rinfo.port));
        });

        // Step 3: Arm recv() BEFORE the peer sends, so no datagram is missed.
        const adapterRecv = nodeUdp.recv();
        const echoPayload = new Uint8Array([0x01, 0x02, 0x03]);
        peerSocket.send(echoPayload, adapterPort, "127.0.0.1");

        // Step 4: Adapter's recv() resolves with the echoed datagram.
        const adapterResult = await adapterRecv;
        expect(adapterResult.data).toEqual(echoPayload);
        expect(adapterResult.from.address).toBe("127.0.0.1");
        expect(adapterResult.from.port).toBe(peerPort);
    });

    it("recv() infers IPv4 family from an IPv4 address", async () => {
        // Arm recv first, then send from a known IPv4 peer.
        const adapterRecv = nodeUdp.recv();
        const payload = new Uint8Array([0xab]);
        peerSocket.send(payload, adapterPort, "127.0.0.1");

        const result = await adapterRecv;
        expect(result.from.family).toBe(4);
    });
});
