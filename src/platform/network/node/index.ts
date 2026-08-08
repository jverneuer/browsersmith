/**
 * Node.js platform adapters for the browsercore network stack.
 *
 * This folder is the network platform boundary: it imports `node:net`,
 * `node:dns`, and `node:dgram` and exposes them as `@browsercore/contracts`
 * interfaces. To support a new runtime (Bun, Deno, ...), add a sibling
 * folder (`bun/`, `deno/`, ...) with the same exports.
 */

export { nodeNet } from "./net.js";
export { nodeDns } from "./dns.js";
export { nodeUdp } from "./udp.js";
