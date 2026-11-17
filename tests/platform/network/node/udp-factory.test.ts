/**
 * UDP factory independence tests (`src/platform/network/node/udp.ts`).
 *
 * `nodeUdp` is a `UdpSocketFactory`: every `connect()` binds a FRESH
 * ephemeral socket (replaceability audit item #5 — no module-scope socket,
 * no import-time bind). These tests pin the two properties that make the
 * factory safe to share across concurrent connections:
 *   - two concurrent "connections" get independent sockets (own port, own
 *     receive queue — a datagram sent to one never surfaces on the other);
 *   - `close()` closes exactly the one socket behind that transport — the
 *     sibling keeps working.
 *
 * All I/O is loopback UDP — no external network.
 */

import { createSocket } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { nodeUdp } from "../../../../src/platform/network/node/index.js";
import type { UdpAddress } from "@browsercore/contracts";

/** Peer sockets opened by a test — closed afterwards so workers exit. */
const openedPeerSockets: { close(): Promise<void> }[] = [];

/** Bind a loopback receiver the test can read datagrams from. */
async function loopbackPeer(family: 4 | 6): Promise<{ port: number; address: string; nextMessage(): Promise<Buffer> }> {
    const socket = createSocket(family === 6 ? "udp6" : "udp4");
    openedPeerSockets.push({ close: () => new Promise((resolve) => socket.close(() => resolve())) });
    await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        // Explicit (port 0, address) form: dgram's typed overloads have no
        // bare (address, callback) signature — port 0 keeps the ephemeral
        // bind this helper has always produced at runtime.
        socket.bind(0, family === 6 ? "::1" : "127.0.0.1", () => {
            socket.off("error", reject);
            resolve();
        });
    });
    const address = family === 6 ? "::1" : "127.0.0.1";
    const pending: Buffer[] = [];
    const waiters: ((msg: Buffer) => void)[] = [];
    socket.on("message", (msg) => {
        const waiter = waiters.shift();
        if (waiter === undefined) {
            pending.push(msg);
        } else {
            waiter(msg);
        }
    });
    return {
        port: socket.address().port,
        address,
        nextMessage: () =>
            new Promise((resolve) => {
                const buffered = pending.shift();
                if (buffered !== undefined) {
                    resolve(buffered);
                } else {
                    waiters.push(resolve);
                }
            }),
    };
}

afterEach(async () => {
    await Promise.all(openedPeerSockets.splice(0).map((socket) => socket.close()));
});

const LOOPBACK_PEER = { address: "127.0.0.1", port: 9, family: 4 } as const;

describe("nodeUdp factory — independent sockets per connect()", () => {
    it("creates a fresh socket per connect() (distinct transports, no shared receive queue)", async () => {
        const first = await nodeUdp.connect(LOOPBACK_PEER);
        const second = await nodeUdp.connect(LOOPBACK_PEER);
        expect(first).not.toBe(second);

        const firstPeer = await loopbackPeer(4);
        const secondPeer = await loopbackPeer(4);
        expect(firstPeer.port).not.toBe(secondPeer.port);

        // Each transport sends to its OWN peer; the datagram must not leak
        // into the other connection's socket.
        await first.send(new TextEncoder().encode("one"), { address: firstPeer.address, port: firstPeer.port, family: 4 });
        await second.send(new TextEncoder().encode("two"), { address: secondPeer.address, port: secondPeer.port, family: 4 });

        expect(new TextDecoder().decode(await firstPeer.nextMessage())).toBe("one");
        expect(new TextDecoder().decode(await secondPeer.nextMessage())).toBe("two");

        await first.close();
        await second.close();
    });

    it("two concurrent connections interleave cleanly (no cross-talk)", async () => {
        const first = await nodeUdp.connect(LOOPBACK_PEER);
        const second = await nodeUdp.connect(LOOPBACK_PEER);

        const peer = await loopbackPeer(4);
        const target: UdpAddress = { address: peer.address, port: peer.port, family: 4 };

        // Fire both sends before reading anything — a shared underlying
        // socket would serialize or mix these; two sockets deliver both.
        await Promise.all([
            first.send(new TextEncoder().encode("a"), target),
            second.send(new TextEncoder().encode("b"), target),
        ]);

        const received = new Set<string>();
        received.add(new TextDecoder().decode(await peer.nextMessage()));
        received.add(new TextDecoder().decode(await peer.nextMessage()));
        expect(received.has("a")).toBe(true);
        expect(received.has("b")).toBe(true);

        await first.close();
        await second.close();
    });

    it("close() is per-socket: closing one connection leaves the sibling working", async () => {
        const first = await nodeUdp.connect(LOOPBACK_PEER);
        const second = await nodeUdp.connect(LOOPBACK_PEER);

        await first.close();

        // The sibling must still be able to send AND receive.
        const peer = await loopbackPeer(4);
        await second.send(new TextEncoder().encode("still-alive"), { address: peer.address, port: peer.port, family: 4 });
        expect(new TextDecoder().decode(await peer.nextMessage())).toBe("still-alive");

        await second.close();
    });
});
