/**
 * @deprecated Import from `./platform/network/node/index.js` instead.
 *
 * This re-export exists for backward compatibility during the migration to the
 * platform composition root. New code should import directly from the platform
 * adapters.
 */

export { nodeNet, nodeDns, nodeUdp } from "../platform/network/node/index.js";

// Re-export the contracts so consumers can pull everything from one place.
export type { Net, Socket, DnsResolver, ConnectOptions, IPAddress } from "@browsercore/contracts";
