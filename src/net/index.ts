/**
 * Platform-agnostic barrel for BrowserCore's runtime adapters.
 *
 * Currently exports the Node.js adapters. Future runtimes (Bun, Deno, ...)
 * add their own subfolder and re-export here.
 */

export { nodeNet, nodeDns } from "./node/index.js";

// Re-export the contracts so consumers can pull everything from one place.
export type { Net, Socket, DnsResolver, ConnectOptions, IPAddress } from "@browsercore/contracts";
