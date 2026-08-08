/**
 * Node.js platform adapter for time primitives.
 *
 * This folder is the time platform boundary: it wraps `Date.now()`,
 * `performance.now()`, and `setTimeout`/`clearTimeout` to satisfy the
 * platform-agnostic Time interface.
 */

export { NodeTime, nodeTime } from "./time.js";
export type { Time } from "./time-types.js";
