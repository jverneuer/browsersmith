/**
 * Node.js platform adapter for inter-protocol events.
 *
 * This folder is the events platform boundary: it imports `node:events` and
 * exposes an EventProvider implementation that satisfies the platform-agnostic
 * interface defined in `event-provider-types.ts`.
 */

export { NodeEventProvider, nodeEventProvider } from "./event-provider.js";
export type { EventProvider } from "./event-provider-types.js";
