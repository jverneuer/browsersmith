# Impersonation Libraries

Per-library deep dives. Each file covers: what the library does, how it works architecturally, which browsers it impersonates, which fingerprint signals it covers, its API surface, and what makes it unique. All files link to source code, documentation, and GitHub repos.

## Index

### Foundational TLS Engines
| Library | Lang | Stars | Role |
|---------|------|-------|------|
| [utls](utls.md) | Go | ~6.5k | ClientHello forging engine — the foundation most Go tools build on |
| [cloudflare/boring](cloudflare-boring.md) | Rust | ~1.2k | BoringSSL bindings — the foundation Rust tools build on |

### Full HTTP Clients (Wire-Level Impersonation)
| Library | Lang | Stars | Browser Targets |
|---------|------|-------|-----------------|
| [curl-impersonate](curl-impersonate.md) | C | ~3.5k | Chrome 99-116, Firefox 91-117, Safari 15.3-15.5, Edge 99-101 |
| [curl-cffi](curl-cffi.md) | Python | ~6.2k | Chrome 99-146, Firefox 133-147, Safari 15-26, Edge, Tor |
| [impers](impers.md) | TypeScript | ~101 | Chrome 99-146, Firefox 133-147, Safari 15-26, Edge, Tor |
| [tls-client](tls-client.md) | Go | ~7k | 100+ browser profiles |
| [wreq](wreq.md) | Rust | ~1.5k | 100+ browser device profiles |
| [cycle-tls](cycle-tls.md) | Go/Node | ~2k | Chrome, Firefox, Safari |
| [azuretls-client](azuretls-client.md) | Go | ~1k | Chrome, Firefox, Safari, Edge |
| [python-tls-client](python-tls-client.md) | Python | ~1k | Chrome 103-120, Firefox 102-120, Safari 15-16 |
| [node-tls-client](node-tls-client.md) | Node.js | ~500 | Same as Go tls-client |
| [got-scraping](got-scraping.md) | Node.js | ~700 | Browser headers + TLS considerations |

### C/C++ Foundations
| Library | Lang | Stars | Role |
|---------|------|-------|------|
| [lwthiker/curl-impersonate](curl-impersonate.md) | C | ~3.5k | Original patched libcurl fork |
| [lexiforest/curl-impersonate](curl-impersonate.md) | C | ~2.7k | Most maintained fork, powers curl_cffi/impers |

### Fingerprint Analysis & Reference
| Library | Lang | Stars | Purpose |
|---------|------|-------|---------|
| [ja4](../protocols/ja3-ja4.md) | Rust | ~1k | JA4+ fingerprinting spec (detection side) |
| [salesforce/ja3](salesforce-ja3.md) | Python | ~2k | Original JA3 detection |
| [clienthellod](clienthellod.md) | Go | ~300 | ClientHello/QUIC parser |
| [tlsx](tlsx.md) | Go | ~1.4k | TLS grabber + JA3 extraction |

### Language-Specific Building Blocks
| Library | Lang | Stars | Purpose |
|---------|------|-------|---------|
| [tls-attacker](tls-attacker.md) | Java | ~800 | Arbitrary TLS handshake crafting |
| [bouncy-castle](bouncy-castle.md) | Java | ~2k | Low-level TLS ClientHello control |
| [conscrypt](conscrypt.md) | Java | ~5k | Android BoringSSL-based TLS provider |

## Key Insights

1. **Go dominates** — `utls`, `tls-client`, `cycle-tls`, `azuretls-client` are all Go-based. The `utls` library is the foundational TLS engine that most others build on.

2. **BoringSSL is the Rust path** — Rust impersonation relies on `cloudflare/boring` bindings since `rustls` cannot easily produce browser-matching ClientHellos.

3. **curl-impersonate is the cross-language anchor** — powers Python (`curl_cffi`), Node.js (`impers`), and is the reference for many fingerprint databases.

4. **JA4 is replacing JA3** — newer libraries support JA4R for more precise fingerprint control.

5. **TLS alone is insufficient** — the best libraries address HTTP/2 SETTINGS, header ordering, Akamai fingerprints, and behavioral signals.

---

*See [../DELTA_REPORT.md](../../DELTA_REPORT.md) for the full gap analysis comparing browsercore to each of these.*
