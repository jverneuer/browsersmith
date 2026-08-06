# browsercore Knowledge Base

A structured reference for browser fingerprint impersonation: how competitors work, what protocols they target, how bot detection systems fingerprint clients, and how to build golden captures that prove wire-level accuracy.

## Structure

```
kb/
├── README.md                        — this file
├── impersonation-libraries/         — per-library deep dives (one file per library)
│   ├── README.md                    — index of all libraries
│   ├── curl-impersonate.md          — C/libcurl fork (the gold standard)
│   ├── curl-cffi.md                 — Python binding
│   ├── impers.md                    — Node.js/TypeScript binding
│   ├── tls-client.md                — Go HTTP client (7k+ stars)
│   ├── utls.md                      — Go TLS ClientHello forging (foundation)
│   ├── wreq.md                      — Rust HTTP client (BoringSSL)
│   ├── cycle-tls.md                 — Go/Node TLS spoofing
│   ├── azuretls-client.md           — Go easy-mode client
│   ├── python-tls-client.md         — Python wrapper for Go tls-client
│   └── ...                          — add more as discovered
├── protocols/                       — protocol specs & fingerprint signals
│   ├── README.md                    — index
│   ├── ja3-ja4.md                   — TLS fingerprinting specs
│   ├── tls-13-extensions.md         — extension types & ordering
│   ├── http2-fingerprinting.md      — Akamai HTTP/2 fingerprint
│   ├── http3-fingerprinting.md      — QUIC + HTTP/3 fingerprint
│   └── http1-fingerprinting.md      — HTTP/1.1 header ordering
├── bot-detection/                   — how WAFs detect bots
│   ├── README.md                    — index
│   ├── akamai.md                    — Akamai Bot Manager
│   ├── cloudflare.md                — Cloudflare Bot Management
│   ├── datadome.md                  — DataDome
│   └── perimeterx.md                — PerimeterX / HUMAN
├── golden-captures/                 — capture methodology & reference data
│   ├── README.md                    — how to create golden captures
│   ├── capture-methodology.md       — tools, process, verification
│   └── reference-captures.md        — what we have, what's missing
└── research/                        — papers, articles, techniques
    ├── README.md                    — index
    └── ...                          — add as discovered
```

## How to Use This Knowledge Base

**For implementation:** Start with `impersonation-libraries/` to understand how each competitor solves the same problem. Cross-reference with `protocols/` to understand the fingerprint signal being impersonated.

**For verification:** Use `golden-captures/` to understand how to prove wire-level accuracy. The capture methodology explains how to extract ground-truth bytes from real browsers.

**For detection understanding:** `bot-detection/` explains what each WAF checks, so you know which fingerprint signals matter most.

## Contributing

When adding a new library:
1. Create a new `.md` file in `impersonation-libraries/`
2. Follow the template: Overview, Architecture, Browser Coverage, Fingerprint Signals, API Surface, Unique Features, References
3. Update the `impersonation-libraries/README.md` index
4. Cross-reference any new protocol details in `protocols/`

When adding protocol research:
1. Add to the relevant `protocols/` file or create a new one
2. Include wire-format diagrams where possible
3. Reference the RFC section numbers
4. Link to real capture data in `golden-captures/`

---

*Last updated: 2026-08-06 — initial build from 20-agent audit of 26+ impersonation libraries*
