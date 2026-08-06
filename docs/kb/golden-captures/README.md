# Golden Captures

How to create, verify, and maintain golden packet captures that serve as ground truth for wire-level fingerprint comparison.

## What Is a Golden Capture?

A golden capture is a **record of the actual bytes** that a real browser (or a perfect impersonator like curl-impersonate) sends on the wire. It serves as the reference that browsercore's output is compared against.

## Current Capture Status

| Profile | TLS Capture | HTTP/2 Capture | Quality |
|---------|-------------|----------------|---------|
| chrome-140 | 96 bytes | Small stub | **SYNTHETIC** — not real wire data |
| firefox-128 | 96 bytes | None | **SYNTHETIC** — not real wire data |
| chrome-131 | 1753 bytes | 33 bytes | **REAL** — from curl_cffi |
| firefox-133 | 1797 bytes | 33 bytes | **REAL** — from curl_cffi |
| safari-17 | 517 bytes | 27 bytes | **REAL** — from curl_cffi |

**Critical gap:** The real captures exist on disk but are NOT registered in `testing/src/captures/manifest.ts`. Only the synthetic stubs are registered.

## Index

| File | Purpose |
|------|---------|
| [capture-methodology.md](capture-methodology.md) | Tools, process, and verification steps |
| [reference-captures.md](reference-captures.md) | What we have, what's missing, hex dumps |

## Capture Rules

1. **Capture from a trusted source** — real browser via Wireshark, or curl-impersonate (verified byte-identical)
2. **Capture the full TLS record** — including the 5-byte record header
3. **Normalize random fields** — client_random, ephemeral keys, GREASE, nonces must be masked before comparison
4. **Store binary + metadata** — `.bin` for the bytes, `.meta.json` for capture context (browser, version, date, tool)
5. **Verify against an oracle** — tls.peet.ws or similar to confirm the capture matches the expected JA3/JA4
6. **Register in manifest** — add to `testing/src/captures/manifest.ts` for discoverability
