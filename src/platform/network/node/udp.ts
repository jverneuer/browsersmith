/**
 * Node.js adapter for the {@link DatagramTransport} contract.
 *
 * Wraps `node:dgram` to satisfy the platform-agnostic interface. This is the
 * only file in the stack that imports `node:dgram` — the rest of BrowserCore
 * (including @browsercore/quic) depends only on the DatagramTransport interface.
 */

import { createSocket } from "node:dgram";
import type { DatagramTransport, UdpAddress } from "@browsercore/contracts";

/**
 * Node.js implementation of the {@link DatagramTransport} contract.
 *
 * Used by @browsercore/quic for HTTP/3 (QUIC) connections over UDP.
 */
export const nodeUdp: DatagramTransport = {
    id: "node-udp",
    send(data, address) {
        return new Promise<void>((resolve, reject) => {
            const port = address.port;
            const addr = address.address;
            nodeUdpSocket.send(data, port, addr, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    },
    recv() {
        return new Promise<{ readonly data: Uint8Array; readonly from: UdpAddress }>((resolve, reject) => {
            const onMessage = (msg: Buffer, rinfo: { address: string; port: number }) => {
                nodeUdpSocket.off("error", onError);
                // node:dgram's RemoteInfo has no `family` field — infer from the address.
                const family = rinfo.address.includes(":") ? 6 : 4;
                resolve({
                    data: new Uint8Array(msg),
                    from: { address: rinfo.address, port: rinfo.port, family },
                });
            };
            const onError = (err: Error) => {
                nodeUdpSocket.off("message", onMessage);
                reject(err);
            };
            nodeUdpSocket.once("message", onMessage);
            nodeUdpSocket.once("error", onError);
        });
    },
    close() {
        return new Promise<void>((resolve) => {
            nodeUdpSocket.close(() => {
                resolve();
            });
        });
    },
};

const nodeUdpSocket = createSocket("udp4");
