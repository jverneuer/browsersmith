/**
 * Node.js adapter for the {@link UdpSocketFactory} contract.
 *
 * Wraps `node:dgram` to satisfy the platform-agnostic interface. This is the
 * only file in the stack that imports `node:dgram` — the rest of BrowserCore
 * (including @browsercore/quic) depends only on the DatagramTransport interface.
 */

import { createSocket, type Socket } from "node:dgram";
import type {
    DatagramCloseReason,
    DatagramTransport,
    UdpAddress,
    UdpSocketFactory,
} from "@browsercore/contracts";

/**
 * Node.js implementation of the {@link UdpSocketFactory} contract.
 *
 * Used by @browsercore/quic for HTTP/3 (QUIC) connections over UDP.
 * Factory, NOT a shared instance: each `connect()` binds a fresh ephemeral
 * socket — nothing is bound at module-import time (the former
 * `createSocket("udp4")` singleton was the replaceability audit's
 * import-time-binding finding), and `close()` releases that one socket.
 */
export const nodeUdp: UdpSocketFactory = {
    async connect(address: UdpAddress): Promise<DatagramTransport> {
        const socket: Socket = createSocket(address.family === 6 ? "udp6" : "udp4");
        await new Promise<void>((resolve, reject) => {
            socket.once("error", reject);
            socket.bind(() => {
                socket.off("error", reject);
                resolve();
            });
        });

        const transport: DatagramTransport = {
            id: "node-udp",
            send(data, to) {
                return new Promise<void>((resolve, reject) => {
                    socket.send(data, to.port, to.address, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            },
            recv() {
                return new Promise<{ readonly data: Uint8Array; readonly from: UdpAddress }>(
                    (resolve, reject) => {
                        const onMessage = (msg: Buffer, rinfo: { address: string; port: number }) => {
                            socket.off("error", onError);
                            // node:dgram's RemoteInfo has no `family` field — infer from the address.
                            const family = rinfo.address.includes(":") ? 6 : 4;
                            resolve({
                                data: new Uint8Array(msg),
                                from: { address: rinfo.address, port: rinfo.port, family },
                            });
                        };
                        const onError = (err: Error) => {
                            socket.off("message", onMessage);
                            reject(err);
                        };
                        socket.once("message", onMessage);
                        socket.once("error", onError);
                    },
                );
            },
            close(_reason?: DatagramCloseReason) {
                return new Promise<void>((resolve) => {
                    socket.close(() => {
                        resolve();
                    });
                });
            },
        };
        return transport;
    },
};
