/**
 * Fake transport — wires browsercore's HTTP client to a real Node http.Server
 * over a loopback socket, with no TLS.
 *
 * `@browsercore/fetch` exposes a `transportFactory` test seam on
 * `FetchClientOptions`: when set, the client calls it instead of opening a TCP
 * + TLS connection, and connects the HTTP/1.1 layer directly to whatever
 * {@link Transport} it returns. This module opens a plain TCP socket to the
 * fixture server (localhost:port) and adapts it to the Transport interface the
 * HTTP layer expects.
 *
 * The result: the fetch client's real request serialization, header ordering,
 * chunked-encoding parsing, cookie jar, and redirect handling all run against a
 * genuine HTTP/1.1 server — fully in-process and deterministic. The only layer
 * bypassed is TLS (which has its own dedicated unit tests in @browsercore/tls).
 */

import { connect as connectNet, type Socket } from "node:net";
import { EventEmitter } from "node:events";
import type { Transport, TransportId, TransportState, CloseReason } from "@browsercore/transport";

let counter = 0;

/** A Transport backed by a raw node:net Socket speaking plain HTTP/1.1. */
// oxlint-disable-next-line unicorn/prefer-event-target -- Transport contractually extends EventEmitter (see @browsercore/transport); EventTarget can't replace it.
export class LoopbackTransport extends EventEmitter implements Transport {
    readonly id: TransportId;
    private readonly socket: Socket;
    private stateValue: TransportState;
    private readonly readQueue: Uint8Array[] = [];
    private readonly waiters: Array<(chunk: Uint8Array) => void> = [];
    private readonly rejectors: Array<(err: Error) => void> = [];

    constructor(socket: Socket, host: string, port: number) {
        super();
        counter += 1;
        this.id = `loopback-${counter}` as TransportId;
        this.socket = socket;
        this.stateValue = { state: "connecting" };

        socket.on("connect", () => {
            this.stateValue = { state: "open" };
            this.emit("open");
        });
        socket.on("data", (data: Buffer) => {
            // If a read() is pending, hand the chunk straight to it; else queue.
            const waiter = this.waiters.shift();
            if (waiter === undefined) {
                this.readQueue.push(new Uint8Array(data));
                this.emit("data", new Uint8Array(data));
            } else {
                waiter(new Uint8Array(data));
            }
        });
        socket.on("close", () => {
            this.stateValue = {
                state: "closed",
                reason: { kind: "remote_close" } satisfies CloseReason,
            };
            // Reject any pending reads — the peer closed before data arrived.
            for (const reject of this.rejectors.splice(0)) {
                reject(new Error("transport closed"));
            }
            this.emit("close", false);
        });
        socket.on("error", (err: Error) => {
            this.emit("error", err);
        });
        // Touch host/port to satisfy the constructor signature (kept for
        // symmetry with TcpTransport; the socket already knows its target).
        void host;
        void port;
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
            this.rejectors.push(reject);
        });
    }

    close(reason?: CloseReason): Promise<void> {
        this.stateValue = {
            state: "closing",
        };
        if (!this.socket.destroyed) {
            this.socket.destroy();
        }
        this.stateValue = {
            state: "closed",
            reason: reason ?? { kind: "client_close" },
        };
        this.emit("close", true);
        return Promise.resolve();
    }
}

/**
 * Build a `transportFactory` that connects to the fixture server at the given
 * port. Pass this to `createClient({ transportFactory })` so the fetch client
 * talks HTTP/1.1 to the fixture over loopback.
 */
export function loopbackTransportFactory(port: number): (host: string, p: number) => Promise<Transport> {
    return async (host: string, _p: number): Promise<Transport> => {
        void _p;
        const socket = connectNet({ host: "127.0.0.1", port });
        const transport = new LoopbackTransport(socket, host, port);
        // Wait for the socket to actually connect before handing it over so the
        // first write doesn't race the SYN.
        if (socket.readyState !== "open") {
            await new Promise<void>((resolve, reject) => {
                socket.once("connect", resolve);
                socket.once("error", reject);
            });
        }
        return transport;
    };
}
