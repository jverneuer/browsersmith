# Orchestration Model

This document describes the multi-agent orchestration system that builds and
validates the `@network/*` packages. It is the contract the workflow implements.

## Hierarchy

```
Top Orchestrator  (workflow script — owns global plan + dependency graph)
  │
  ├─ Package Orchestrator × 10   (one agent per @network/* package)
  │     │
  │     ├─ Developer agent(s)   — implement the next chunk from PLAN.md
  │     └─ QA agent(s)          — typecheck + test the package, report pass/fail
  │
  └─ Integration                — full monorepo typecheck + test after dispatch
```

## Roles

### Top Orchestrator (the workflow)
- Reads every package's `PLAN.md` and counts remaining `not implemented` stubs.
- Knows the dependency graph (see below) and dispatches packages in waves so a
  package is only dispatched after its dependencies have completed a wave.
- Collects structured status from each package orchestrator.
- Adjusts the plan: re-dispatches a package whose QA failed, or advances it to the
  next chunk.
- Runs the final integration gate (`tsc --build` + `vitest run`) and reports.

### Package Orchestrator (one agent per package)
- Owns a single package end to end.
- Reads `packages/<name>/PLAN.md` and the current source. Identifies the next
  unimplemented chunk that has its dependencies satisfied.
- Splits the chunk into a concrete, bounded developer task.
- Dispatches a **developer agent** with the exact files, types, and acceptance
  criteria. Waits for it to finish.
- Dispatches a **QA agent** that runs `tsc -p tsconfig.json --noEmit` and
  `vitest run` for the package and reports structured pass/fail + error text.
- If QA fails: adjusts (re-dispatches developer with the failure context) up to a
  bounded retry count, then reports `needs-human-review`.
- Reports one of: `complete` (all chunks done), `chunk-done` (more remain),
  `blocked` (dependency not ready), `needs-human-review`.

### Developer agent
- Implements exactly one bounded chunk against the package's existing public API
  and `PLAN.md`. Follows `CODING_STANDS.md` — no `any`, branded IDs, discriminated
  unions, `readonly`, typed errors, `.js` imports, `assertNever`.
- Does NOT touch other packages. Keeps its change small and compilable.
- Verifies its own change compiles before reporting done.

### QA agent
- Runs the package typecheck and tests. Reports structured results. Never edits
  files — purely observational.

## Dependency graph (dispatch order)

```
Wave 1 (no @network deps):  profiles, cookies
Wave 2 (deps from wave 1):  crypto, transport
Wave 3 (deps from wave 2):  tls, http1, http2, testing, devtools
Wave 4 (deps from wave 3):  fetch
```

`profiles` and `cookies` are already complete (0 stubs) and are validated only.

## Status model (discriminated union — no magic strings)

```ts
type PackageStatus =
  | { readonly status: "complete" }
  | { readonly status: "chunk-done"; readonly chunksRemaining: number }
  | { readonly status: "blocked"; readonly waitingFor: PackageName }
  | { readonly status: "needs-human-review"; readonly reason: string }
  | { readonly status: "in-progress"; readonly chunk: string };
```

## Success criteria

A wave succeeds when every package in it reports `complete` or `chunk-done` with
QA passing (typecheck clean + tests green). The workflow advances to the next wave.
The final gate is a clean full-monorepo `tsc --build` and `vitest run`.
