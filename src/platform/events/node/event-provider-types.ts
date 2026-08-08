/**
 * Platform-agnostic event provider interface — re-exported from @browsercore/contracts.
 *
 * Defines the minimal pub/sub surface that BrowserCore needs for inter-protocol
 * events. Implemented by `NodeEventProvider` (Node.js) but can be backed by
 * EventTarget (browsers), mitt, or any other event system. This is the single
 * source of truth — re-exported so browsersmith and protocol packages share
 * the exact same type.
 */

export type { EventProvider } from "@browsercore/contracts";
