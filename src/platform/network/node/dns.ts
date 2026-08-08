/**
 * Node.js adapter for the {@link DnsResolver} contract.
 *
 * Wraps `node:dns.lookup` (callback-style) into the Promise-based
 * `@browsercore/contracts` interface. This is the only file in the stack
 * that imports `node:dns` — the rest of BrowserCore depends only on interfaces.
 */

import { lookup as dnsLookup } from "node:dns";
import type { DnsResolver, IPAddress } from "@browsercore/contracts";

/**
 * Node.js implementation of the {@link DnsResolver} contract.
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
export const nodeDns: DnsResolver = {
    lookup(hostname, family) {
        return new Promise((resolve, reject) => {
            dnsLookup(hostname, { family }, (err, address, resolvedFamily) => {
                if (err) {
                    reject(err);
                    return;
                }
                const result: IPAddress = {
                    address,
                    family: (resolvedFamily || family) as 4 | 6,
                };
                resolve([result]);
            });
        });
    },
};
