# Research

Papers, articles, and technical deep-dives relevant to browser fingerprint impersonation. Add new entries as they're discovered.

## Index

| File | Topic | Source |
|------|-------|--------|
| *(empty — add as discovered)* | | |

## Suggested Reading

### Fingerprinting Specifications
- [JA3 TLS Fingerprinting](https://github.com/salesforce/ja3) — John Althouse, original JA3 spec
- [JA4+ Fingerprinting Suite](https://github.com/FoxIO-LLC/ja4) — FoxIO-LLC, next-gen JA4 spec
- [GREASE (RFC 8701)](https://tools.ietf.org/html/rfc8701) — Google's Generate Random Extensions And Sustain Extensibility

### Academic Papers
- *[The Web Never Forgets](https://securehomes.esat.kuleuven.be/~gacar/papers/the-web-never-forgets-stocker-acsac14.pdf)* — Acar et al., browser fingerprinting survey
- *[FP-Stalker](https://hal.inria.fr/hal-01285470)* — Fiore et al., tracking via browser fingerprints
- *[Browser Fingerprinting: A Survey](https://arxiv.org/abs/1905.01022)* — Laperdrix et al., comprehensive survey

### Industry Articles
- [Cloudflare: Bot Management](https://blog.cloudflare.com/bot-management-machine-learning-client-behavior/)
- [Akamai: Bot Manager](https://www.akamai.com/blog/security/bot-manager-machine-learning)
- [Fastly: The State of Web Scraping](https://www.fastly.com/blog/)

### Technical Deep-Dives
- [tls.peet.ws](https://tls.peet.ws) — TLS fingerprint oracle, shows JA3/JA4 for your connection
- [ja3.zone](https://ja3.zone) — JA3 fingerprint database
- [curl-impersonate signature files](https://github.com/lwthiker/curl-impersonate/tree/main/tests/signatures) — ground truth YAML fingerprints

## Contributing

Add new research as it's discovered:
1. Create a new `.md` file or add to an existing one
2. Include the source URL, publication date, and key findings
3. Cross-reference relevant protocol details in `../protocols/`
