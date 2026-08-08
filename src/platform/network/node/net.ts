/**
 * Node.js adapter for the {@link Net} contract.
 *
 * Wraps `node:net.connect` so it satisfies the platform-agnostic
 * `@browsercore/contracts` interface. This is the only file in the stack
 * that imports `node:net` — the rest of BrowserCore depends only on interfaces.
 */

import { connect as netConnect } from "node:net";
import type { Net, Socket, ConnectOptions } from "@browsercore/contracts";

/**
 * Node.js implementation of the {@link Net} contract.
 *
 * Pass this to `connect()` from `@browsercore/transport` when running on Node:
 *
 * ```ts
 * import { connect } from "@browsercore/transport";
 * import { nodeNet, nodeDns } from "./index.js";
 *
 * const transport = await connect({ host, port, net: nodeNet, dns: nodeDns });
 * ```
 */
export const nodeNet: Net = {
    connect(options: ConnectOptions): Socket {
        return netConnect({
            host: options.host,
            port: options.port,
            noDelay: options.noDelay,
            localAddress: options.localAddress,
            family: options.family,
        }) as Socket;
    },
};
