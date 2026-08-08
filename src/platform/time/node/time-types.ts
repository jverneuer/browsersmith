/**
 * Platform-agnostic time interface — re-exported from @browsercore/contracts.
 *
 * `Time` bundles a `Clock` (wall + monotonic time reading) with a
 * `Scheduler` (delays, timeouts, composable deadlines). This is the single
 * source of truth — re-exported so browsersmith and protocol packages
 * share the exact same type.
 */

export type { Time, Clock, Duration, Scheduler, Deadline } from "@browsercore/contracts";
