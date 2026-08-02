# PLAN.md Audit — All 10 @browsercore Packages

Read-only audit: each package's `PLAN.md` checked against its actual `src/` and `tests/`.
Done after all 10 packages were published to npm.

---

## Summary Table

| Package | Verdict | node:crypto boundary | TSConfig | Tests |
|---|---|---|---|---|
| crypto | INACCURATE | N/A (only allowed importer) | self-contained ✓ | gaps vs plan (RFC vectors) |
| transport | INACCURATE | clean ✓ | self-contained ✓ | 3 missing vs plan |
| profiles | INACCURATE | clean ✓ | self-contained ✓ | full |
| cookies | COMPLETE | clean ✓ | self-contained ✓ | full (minor) |
| http1 | COMPLETE | clean ✓ | self-contained ✓ | 3 missing vs plan |
| tls | INACCURATE | clean ✓ | self-contained ✓ | major gaps; **core API stubbed** |
| http2 | INACCURATE | **VIOLATION** `connection.ts:31` | self-contained ✓ | 7 skipped (state-machine bug) |
| fetch | INACCURATE | clean ✓ | self-contained ✓ | **almost none** |
| testing | INCOMPLETE | N/A | self-contained ✓ | 62 pass / 282 todo |
| devtools | INACCURATE | clean ✓ | self-contained ✓ | 1 of 7 modules |

**9 of 10** packages have inaccurate or incomplete plans.
**1 critical boundary violation** (http2 → node:crypto).
**2 packages with stubbed core APIs** (tls, fetch).

---

## Per-package findings

### crypto — PLAN INACCURATE
- All planned modules implemented (no stubs).
- **Under-reports**: `verifySignature` (ECDSA P-256/384, RSA-PSS, RSA-PKCS1) fully built + tested but never mentioned in PLAN.md.
- Test gaps vs plan: HKDF has no RFC 5869 fixed vectors (only oracle compare); X25519 has no RFC 7748 vector; wrong-AAD assertion missing for AES-256-GCM and ChaCha20-Poly1305 (only AES-128-GCM has it).
- node:crypto: clean — only `src/crypto.ts` imports it (the allowed boundary).

### transport — PLAN INACCURATE (stale markers)
- All 6 steps fully implemented, but only Step 1 marked `(DONE)`; all DoD checkboxes unchecked.
- 3 missing tests vs plan: connect-timeout-fires, socket-error→closed transition, remote-end→remote_close.
- Undocumented extras present: `ReadTimeoutError`, `createId` helper.
- Leaf package clean (only node:net/dns/events).

### profiles — PLAN INACCURATE (under-reports)
- All claimed fingerprints present + populated: Chrome 120/128/140, Firefox 120/128/135, Safari 17/18, Edge 120/128 + registry.
- Step 8 (diff utility, `src/diff.ts`) unchecked in PLAN but fully implemented + 6 tests.
- Step 7 (validation, `src/validate.ts`) unchecked but implemented + 5 tests — but the *real Wireshark/JA4 capture* validation is absent (tests use synthetic captures only).
- **Data bug**: `profiles/firefox.ts:120` cipher typo `CHACHA0` → should be `CHACHA20`.
- Zero runtime deps ✓.

### cookies — PLAN COMPLETE (minor understatements)
- All 10 steps implemented; 31 tests, no skips.
- Minor gaps: `parseSetCookieHeader` error paths untested; `Partitioned` not directly asserted; `createId` arguably dead code.
- Stale: SameSite DoD checkbox unchecked despite implemented + tested (jar enforces SameSite when caller supplies context).
- Zero runtime deps ✓.

### http1 — PLAN COMPLETE (with caveats)
- All 7 steps implemented; 35 tests across 6 files, no skips.
- 3 missing tests vs plan Step 5: keep-alive multi-request, `Connection: close`, state-machine transition (`_ensureOpen` rejection paths).
- DoD checkboxes all stale.
- node:crypto/node:tls boundary clean (only node:zlib + @browsercore/transport).

### tls — PLAN INACCURATE (significant gaps + overstatement)
- **CRITICAL: core public API is stubbed** — `connectTls` throws "not implemented"; `Tls1ConnectionImpl` read/write/close all throw; `generateKeyShares` throws.
- Done: record header parse/serialize, ClientHello builder, X.509/hostname/chain, key schedule (HKDF), record encrypt/decrypt.
- Partial: ServerHello parser (no cipher/version validation wired); ALPN encoding present but selection not.
- NOT done: handshake state-machine wiring (Step 6), full TLS 1.3 handshake (Step 8), TLS 1.2 fallback (Step 9).
- **Test gaps**: no tests for buildClientHello, parseServerHello, advanceHandshake, key schedule (no RFC 8446 vectors), record encrypt/decrypt, extensions, profiles — only record header + certificates covered.
- **Overstatement**: package.json claims "TLS 3 (and 1.2 fallback) client" but connectTls is a stub and 1.2 is absent.
- Dead stubs: 5 functions in `extensions.ts` throw.
- node:crypto boundary clean in src/ (all routes through @browsercore/crypto).

### http2 — PLAN INACCURATE (significant + boundary violation)
- All 12 modules implemented in src/.
- **CRITICAL BOUNDARY VIOLATION**: `connection.ts:31` imports `randomInt` from `node:crypto` (used by `randomUint64()` for PING opaque-data, `connection.ts:363`). Must source randomness from `@browsercore/crypto` (or inject it), not node:crypto directly. (`stream/stream.ts:35` also couples to `node:events`.)
- 7 connection/stream integration tests are `it.skip` due to a real, reproduced handshake race: un-skipped → `waitForSettingsAck` times out at 5000 ms. Handshake/multiplex/PING/GOAWAY-receive are implemented but broken end-to-end.
- HPACK works (covered indirectly via stream-manager encode/decode) but has no dedicated test file; per-frame-type round trips and dynamic-table eviction are untested.
- PLAN overstates: Steps 7/8/10 marked DONE while their integration tests are skipped/broken; DoD checklist entirely unchecked contradicts the DONE markers.

### fetch — PLAN INACCURATE (significant)
- **Test coverage essentially non-existent**: one 75-line file, 4 trivial error-instantiation tests. No behavioral tests at all.
- **Stubbed/missing**: `applyHttp2Profile` is a void no-op (h2 settings NOT applied); timeout timer has an empty no-op callback; AbortSignal only pre-checked (in-flight requests never aborted); idle eviction absent (no TTL/interval, single connection per origin not a pool); loop detection is count-only (no visited-URL set).
- Done: types, URL parsing, transport/TLS/ALPN offer, ALPN selection, dispatch h1/h2, redirect policy, cookie jar, streaming body.
- node:crypto boundary clean.

### testing — INCOMPLETE
- Phase 1 done + well-tested: compareBytes/bytesToHex, errors, TestCategory model.
- Phase 2 (golden storage) implemented but **untested**; PLAN checkbox wrongly marks it not-done.
- Phase 3 (TLS captures): **overclaims** — says Chrome 140/Firefox 135/Safari 18/Edge 140, but disk only has `chrome-140` + `firefox-128` (wrong Firefox version, no Safari/Edge).
- Phase 4 (HTTP/2 captures): only SETTINGS exists, no HEADERS.
- Phase 5/10 (RFC suites, benchmarks): exported throwing stubs, but README shows them as working — overstatement.
- Phases 6–11: correctly `it.todo`. 62 passed / 282 todo.

### devtools — PLAN INACCURATE
- Done: inspector session (+tested), TLS decoder/visualizer, HTTP/2 decoder/visualizer, profile diff, certificate inspector (full ASN.1).
- Gaps: HTTP/1.1 message viewer (only hex fallback); benchmark CLI is a stub (throws on all commands); JSON/HTML export doesn't exist.
- **Test coverage: 1 of 7 modules** — 35-line file covers only `createInspectorSession`.
- Overstatement: stale type comments say "stubbed"; CLI advertises non-functional commands.
- node:crypto boundary clean.

---

## Critical issues to fix first

1. **http2 node:crypto violation** (`connection.ts:31`) — breaks the architectural boundary. Replace with `@browsercore/crypto` or injected randomness. This is the single most important correctness fix.
2. **http2 handshake race** — the 7 skipped connection tests. Once fixed, the package's core value (real multiplexed HTTP/2) works end-to-end.
3. **tls core API stubs** — `connectTls`/`TlsConnectionImpl`/`generateKeyShares` throw. The package's main entry point is non-functional.
4. **fetch core no-ops** — timeout/abort/eviction/h2-profile are stubbed; add real behavioral tests.
5. **Stale plan markers** — nearly every PLAN.md has unchecked checkboxes or DONE markers that contradict reality. The docs should be accurate.

## What's genuinely solid

- **crypto, transport, cookies, http1** are largely complete and well-tested — only minor test/doc gaps.
- **profiles** data is comprehensive (9 browsers) — just a stale plan + one cipher typo.
- All 10 **tsconfigs are self-contained** (standalone-package scaffolding worked).
- All 10 packages **published to npm** and the **node:crypto boundary holds everywhere except http2**.
