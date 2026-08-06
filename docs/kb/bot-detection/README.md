# Bot Detection Systems

How major WAFs and bot detection services fingerprint clients. Understanding what they check tells us which fingerprint signals matter most.

## Index

| File | System | What It Checks |
|------|--------|----------------|
| [akamai.md](akamai.md) | Akamai Bot Manager | JA3, HTTP/2 Akamai fingerprint, header order, TLS extension order |
| [cloudflare.md](cloudflare.md) | Cloudflare Bot Management | JA4, HTTP/2, header consistency, behavioral signals |
| [datadome.md](datadome.md) | DataDome | TLS, HTTP/2, JavaScript challenges, header analysis |
| [perimeterx.md](perimeterx.md) | PerimeterX / HUMAN | TLS, HTTP/2, header order, cookie behavior, JS challenges |
| [kasada.md](kasada.md) | Kasada | TLS, HTTP/2, header consistency, behavioral biometrics |

## Detection Layers (Least to Most Expensive)

1. **TLS fingerprint (JA3/JA4)** — cheapest, checked on every connection
2. **HTTP/2 fingerprint (Akamai)** — cheap, checked on every request
3. **HTTP/1.1 header order** — cheap, checked on every request
4. **Header consistency** — medium (cross-layer: does JA3 match sec-ch-ua?)
5. **Cookie behavior** — medium (split cookies, cookie jar patterns)
6. **Behavioral signals** — expensive (mouse movement, timing, navigation)
7. **JavaScript challenges** — most expensive (canvas, WebGL, WebRTC)

## Priority for browsercore

The first 4 layers are pure wire-level signals that browsercore can address directly. Layers 5-7 are outside the scope of a protocol library.

---

*Each file documents the specific fingerprint signals a WAF checks, with references to public research and detection mechanisms.*
