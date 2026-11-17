/**
 * Platform-agnostic time interface — re-exported from @browsercore/contracts.
 *
 * `Time` IS the canonical `Clock` (contracts 0.2.6 collapsed the former
 * `{ clock, scheduler }` bundle — Time≡Clock: `now`/`monotonic`/`sleep`/
 * `setTimeout`/`clearTimeout` on one surface; the scheduler wrapper was
 * implemented by zero protocol packages). `Duration`/`Scheduler`/`Deadline`
 * remain available for callers that compose duration-based scheduling.
 * This is the single source of truth — re-exported so browsersmith and
 * protocol packages share the exact same type.
 */

export type { Time, Clock, TimerHandle, Duration, Scheduler, Deadline } from "@browsercore/contracts";
