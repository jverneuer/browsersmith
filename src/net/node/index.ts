/**
 * Node.js platform adapters for the browsercore stack.
 *
 * This folder is the platform boundary: it imports `node:net` and `node:dns`
 * and exposes them as `@browsercore/contracts` interfaces. To support a new
 * runtime (Bun, Deno, ...), add a sibling folder (`bun/`, `deno/`, ...) with
 * the same exports.
 */

export { nodeNet } from "./net.js";
export { nodeDns } from "./dns.js";
