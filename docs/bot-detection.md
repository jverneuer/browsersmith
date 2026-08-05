# Bot-detection playbook

Which layer of the stack to swap when a specific detector blocks you — Cloudflare, Akamai, DataDome, PerimeterX (HUMAN). Each detector reads a different combination of wire signals; browsersmith owns the ones the network layer produces.

## The four major detectors

Most commercial bot protection in 2026 falls into four buckets — **Cloudflare Bot Management**, **Akamai Bot Manager**, **DataDome Bot Management**, and **PerimeterX / HUMAN**. Each fingerprints a different combination of TLS, HTTP/2, HTTP/3, header-order, and cookie signals, and some issue a JavaScript challenge for clients that pass the wire fingerprint but lack a verified session cookie. The matrix maps which detector reads which signal. Use `chrome-140` as the safe default unless a target match-fingerprints Firefox.

| Signal | Cloudflare | Akamai | DataDome | PerimeterX / HUMAN |
|---|---|---|---|---|
| TLS ClientHello (JA3/JA4) | primary | secondary | primary | primary |
| HTTP/2 SETTINGS + window sizes | secondary | primary | secondary | secondary |
| HTTP/2 pseudo-header order | secondary | primary | secondary | secondary |
| HTTP/1.1 header order | secondary | — | partial | secondary |
| HTTP/3 frames + QPACK (experimental) | partial | — | — | — |
| Cookies + session continuity | required (`cf_clearance`) | required | required (`datadome`) | required (`_px`) |
| JS challenge | yes (Under Attack) | rare | yes | yes (Press & Hold) |

Legend: *primary* = the detector's main signal · *secondary* = checked as corroboration · *partial* = checked only on some configurations · *required* = the cookie must be present or the request is blocked.

## Layer map: which browsersmith layer controls which signal

Every fingerprint signal in the matrix has a single owning `@browsercore/*` layer and a single owning config field. When a detector blocks you, the layer map tells you which knob to turn. See [architecture.md#where-the-fingerprint-lives](../architecture.md#where-the-fingerprint-lives) for the deeper stack walk. The HTTP/3 row is experimental — opt-in via `crawl({ http3: factory })`, one fresh connection per URL, no cookie-jar coordination with the h2 path. If a detector is HTTP/3-only, browsersmith's HTTP/3 path probably won't fool it yet.

| Fingerprint signal | `@browsercore/*` layer | Config field |
|---|---|---|
| TLS ClientHello (JA3/JA4) | `@browsercore/tls` | `BrowserProfile.tls` → `extensionOrder` + `grease` + `cipherSuites` |
| HTTP/2 SETTINGS + window sizes | `@browsercore/http2` | `BrowserProfile.http2.settings` (caller-supplied `Http2SettingsMap`) |
| HTTP/2 pseudo-header order | `@browsercore/http2` | Fixed `:method :scheme :authority :path` order in this implementation |
| HTTP/1.1 header order | `@browsercore/http1` | `BrowserProfile.http1.headerOrder` |
| HTTP/3 frames + QPACK | `@browsercore/http3` (+ `@browsercore/quic`) | Opt-in via `crawl({ http3: factory })` |
| Cookies + session continuity | `@browsercore/cookies` | `createClient({ cookieJar })` |

## Cloudflare

Cloudflare Bot Management reads JA3/JA4 (TLS ClientHello) as the primary signal, then the HTTP/2 Akamai fingerprint as a secondary check, then issues a JS challenge (`/cdn-cgi/challenge-platform/`) for clients that pass the wire fingerprint but lack a verified `cf_clearance` cookie. browsersmith's `chrome-140` profile matches the wire fingerprint; the JS challenge is the gap. Solve it once with `puppeteer-extra` + `puppeteer-extra-plugin-stealth`, harvest `cf_clearance`, then pass it to a browsersmith client via `createClient({ cookieJar })` — or use a Cloudflare-solving service. browsersmith alone does not defeat Under Attack mode — that requires executing JavaScript browsersmith never executes.

## Akamai

Akamai Bot Manager's primary signal is the HTTP/2 Akamai fingerprint string — the `1:65536;2:0;4:131072;5:16384|12517377|0|m,p,a,s` format encoding `SETTINGS` + `WINDOW_UPDATE` + priority + pseudo-header order. JA3/JA4 is secondary. browsersmith's `@browsercore/http2` layer owns the SETTINGS + pseudo-header order; the `chrome-140` profile matches Chrome 140's Akamai fingerprint. If you're seeing blocks: (a) verify the profile isn't overridden by a per-call option; (b) confirm your `User-Agent` matches the profile's browser — chrome-140 with a Firefox UA is an instant tell; (c) confirm ALPN negotiated `h2`, not `http/1.1` fallback. Known limitation: the implementation emits pseudo-headers in the fixed Chrome order `:method :scheme :authority :path`; real Firefox emits `:method :scheme :path :authority`. If a target match-fingerprints Firefox specifically, use `firefox-128`.

## DataDome

DataDome puts heavy weight on JA3/JA4 + HTTP/2 SETTINGS + behavioral signals (request timing, interaction patterns on the challenge page). The `chrome-140` profile matches Chrome's TLS + HTTP/2 fingerprint; the remaining signal is the `datadome` cookie, issued after a JS challenge on first visit. Same playbook as Cloudflare: harvest `datadome` with a real browser, reuse with browsersmith. The cookie has a short TTL (~24h) — re-harvest periodically. Known limitation: the implementation emits a single HEADERS frame per request and does not split header blocks across HEADERS + CONTINUATION frames. Real browsers sometimes split.

## PerimeterX / HUMAN

PerimeterX / HUMAN's signal mix is similar to DataDome — JA3/JA4 + HTTP/2 + headers + a `_px` cookie issued after a JS challenge. Same playbook: real-browser harvest + browsersmith reuse. HUMAN also ships a "Press & Hold" captcha variant harder to automate than a standard checkbox — flag this as a case where you may need a captcha-solving service. As of late 2026, `chrome-140` passes the wire-fingerprint checks for the standard HUMAN flow; the JS challenge still needs a real browser.

## When fingerprints aren't enough

For targets that issue a JS challenge on every request — Cloudflare's "Under Attack" mode, DataDome full-bot-protection, HUMAN Press & Hold — no amount of wire-fingerprint matching will help. The challenge requires executing JavaScript, which browsersmith never does (we are not a browser). Two options: (a) use a real browser (`puppeteer-extra` + `puppeteer-extra-plugin-stealth`) for the challenge, harvest the session cookie, then use browsersmith for data-fetching; (b) use a captcha-solving service. See [comparison.md#when-to-combine](../comparison.md#when-to-combine) and [scraping.md](./scraping.md).

## Debugging your fingerprint

When a target still blocks you, verify what browsersmith is actually sending. Three tools:

1. **`https://tls.peet.ws/api/all`** — the canonical JA3/JA4 + HTTP/2 Akamai-fingerprint oracle. Returns your request's fingerprints as JSON.
2. **`https://browserleaks.com/tls`** — browser-friendly view of the same signals.
3. **`@browsercore/devtools`** — local inspector that renders the outgoing ClientHello + HTTP/2 frames in an HTML view. See [packages.md#browsercore-devtools](../packages.md#browsercore-devtools).

```typescript
import { fetch, PROFILES } from "browsersmith";

const res = await fetch("https://tls.peet.ws/api/all", {
  profile: PROFILES["chrome-140"],
});
const data = await res.json();
console.log(data.tls.ja3);                 // match against canonical Chrome 140 JA3
console.log(data.tls.ja4);                 // match against canonical Chrome 140 JA4
console.log(data.http2.akamai_fingerprint); // 1:65536;2:0;4:131072;5:16384|...
```

If any of the three diverges from the published Chrome 140 values, file an issue — the profile is the contract.

## Patterns to avoid

- **Don't fingerprint-rotate per-request.** A session that re-negotiates its TLS fingerprint between requests looks like a bot. Pick one profile per session and stick to it.
- **Don't mix a Chrome TLS profile with a Firefox `User-Agent`.** Instant tell. Profiles ship with a matching UA hint — use it. See [profiles.md](../profiles.md).
- **Don't warm up with Node's default `fetch()`, and don't run `axios` or `got` in the same process.** Their default agents leak a non-browser TLS fingerprint. Use browsersmith for every outbound request, or isolate the other client to a subprocess.
- **Don't ignore `Retry-After`.** Hammering past a 429 burns the IP and the cookie.
- **Don't reuse a `CookieJar` across profiles or target domains.** Cookies leak across profiles (`cf_clearance` under `chrome-140` won't validate under `firefox-128`) and across domains (DataDome cookies are domain-scoped). One jar per (profile, target) pair.

## Sources

- Worklog: Task `1-repo-browsersmith` — `INTEGRATIONS.md` covers Cloudflare + DataDome bot-detection reference; `examples/defeat-bot-detection.ts` is the existing recipe source.
- Worklog: Task `1-repo-tls` — `ClientHelloConfig.extensionOrder` is "the primary fingerprinting signal, so the order is load-bearing"; `grease` flag injects RFC 8701 GREASE (Chrome: true, Firefox: false).
- Worklog: Task `1-repo-http2` — caller-supplied `initialSettings`; fixed pseudo-header order.
- Worklog: Task `1-R2` — curl-impersonate's blog posts are the canonical reference for TLS/HTTP2 fingerprinting.
- Reference: RFC 8701 (GREASE), RFC 8446 (TLS 1.3), RFC 9113 (HTTP/2), RFC 9114 (HTTP/3).
