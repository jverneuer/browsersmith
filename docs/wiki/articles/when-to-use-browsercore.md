# When to Use browsercore

browsercore replaces a full browser in any scenario where the **network
fingerprint is the only barrier** and the content you need arrives in the
initial HTTP response. Below are the eight replacement use cases, each with a
concrete explanation of why browsercore fits and why a full browser is
overkill.

If your use case is not on this list, read
[When NOT to Use browsercore](when-not-to-use-browsercore.md) — being honest
about limitations is more useful than overselling.

---

## 1. High-throughput scraping of server-rendered content

**The scenario:** Scraping product listings, news archives, pricing pages, or
search results where the data is present in the HTML the server sends.

**Why browsercore fits:** The request carries a browser-identical TLS +
HTTP fingerprint, so bot detectors (Cloudflare, Datadome, Akamai, PerimeterX,
fingerprint.com) accept it. No JavaScript engine is needed because the HTML
already contains the data. `crawl()` gives concurrency control, cookie
persistence, and polite delays out of the box.

**Why a full browser is overkill:** Spawning Chromium per session costs
~50–200 MB RAM and seconds of startup per instance. A single Node process
running browsercore sustains hundreds of concurrent requests with a fraction
of the memory. Rendering JavaScript is wasted work when the HTML already
contains the data you need.

## 2. Bot-detection evasion where the detector keys on network signals

**The scenario:** Target sites that fingerprint via JA3/JA4 TLS hash, HTTP/2
SETTINGS, or header order — rather than JavaScript challenges.

**Why browsercore fits:** This is the exact problem browsercore was built to
solve. Its TLS ClientHello, ALPN, HTTP/2 SETTINGS, and header ordering match
Chrome / Firefox byte-for-byte (verified against golden captures in
`testing/captures/`). The e2e suite in `tests/e2e-detection.test.ts` proves it
passes a simulated bot detector.

**Why a full browser is overkill:** A real browser passes these checks too,
but carries a massive attack surface (JS engine, rendering, extensions). If
the only signal the detector checks is the network fingerprint, a real browser
is wasteful — and headless browsers often leak telltales (`navigator.webdriver`,
missing fonts, missing WebGL) that sophisticated detectors use. browsercore
has no JavaScript environment to leak.

## 3. API testing with browser-accurate requests

**The scenario:** Verifying that your API behaves correctly for real browser
clients — TLS negotiation, HTTP/2 multiplexing, header ordering, content
negotiation, cookie handling, and redirect behavior.

**Why browsercore fits:** `createClient()` with a specific profile reproduces
exactly what a browser sends. You can assert on the negotiated protocol (h2 vs
http/1.1), verify cookies round-trip through the jar, and test redirect
policies. The typed error surface (`FetchTimeoutError`, `RedirectError`,
`ProtocolError` in `fetch/src/errors.ts`) makes assertions precise.

**Why a full browser is overkill:** For API testing you care about the wire
bytes, not the rendered page. A browser would render, execute JS, and paint —
none of which help you assert on HTTP semantics.

## 4. Cookie and session management across many requests

**The scenario:** Maintaining authenticated sessions across a crawl or a
sequence of API calls — auth tokens, CSRF cookies, tracking cookies — with
persistence across process restarts.

**Why browsercore fits:** `createCookieJar()` is RFC 6265-compliant with
domain / path / Secure / expiry / SameSite matching. Cookies flow
automatically between requests via the shared jar. `saveJar` / `loadJar`
serialize to JSON for session resumption; domain-mismatch cookies are rejected
per spec (see `cookies/src/jar.ts`).

**Why a full browser is overkill:** If you only need cookie semantics (set /
get / clear / expire / SameSite), a browser is a heavyweight way to manage a
Map. browsercore's jar is a focused, testable, serializable cookie store.

## 5. Crawling sites that fingerprint via JA3/JA4/HTTP/2 signals rather than JS

**The scenario:** Sites that block non-browser clients based on TLS/HTTP
fingerprinting alone — no CAPTCHA, no JavaScript challenge, no proof-of-work.

**Why browsercore fits:** Pick a profile and the request is indistinguishable
from that browser at the network layer. The `crawl()` helper walks URL lists
with per-host concurrency, delays, and cookie persistence. Each failure is
recorded per-URL without aborting the crawl.

**Why a full browser is overkill:** If the site does not challenge with
JavaScript, executing JavaScript is pure cost. You would spawn a browser, wait
for it to load, parse the DOM — when a single `fetch()` with the right
fingerprint gets you the same HTML in a fraction of the time and memory.

## 6. Lightweight integration and smoke tests in CI

**The scenario:** In CI pipelines, verifying that endpoints return expected
status codes, headers, and content — with browser-identical requests so the
test exercises the same code path a real user would hit.

**Why browsercore fits:** Pure Node, no browser binary to install, no
`npx playwright install`. `npm install browsercore` and run. The e2e suite
itself boots a local fixture server and runs fully offline — the same pattern
works in CI.

**Why a full browser is overkill:** Playwright / Puppeteer in CI require
browser downloads (~150 MB), system dependencies (libs for Chromium), and are
flakier (GPU sandbox issues, OOM in containers). browsercore is a single npm
dependency with no native binaries.

## 7. Content negotiation and compression verification

**The scenario:** Verifying that your server correctly negotiates
content-encoding (gzip, deflate, brotli) and that clients receive correctly
compressed responses.

**Why browsercore fits:** The compression layer decodes gzip / deflate (zlib +
raw fallback) / brotli / identity transparently, with browser-tolerant deflate
handling — it tries zlib-wrapped first, then falls back to raw inflate, exactly
what browsers do. The `accept-encoding` header is profile-accurate.

**Why a full browser is overkill:** You are testing wire-level content
encoding, not rendered output. A browser would decompress internally and you
would have no visibility into the raw bytes or the negotiation.

## 8. Protocol conformance testing (HTTP/2 vs HTTP/1.1)

**The scenario:** Testing that your server correctly handles HTTP/2
multiplexing, stream priorities, flow control, HPACK header compression,
SETTINGS exchange, and GOAWAY — and that it falls back to HTTP/1.1 when a
client does not support h2.

**Why browsercore fits:** The `@browsercore/http2` package is a full HTTP/2
framing implementation (frame parse / serialize, HPACK, stream lifecycle, flow
control, SETTINGS, GOAWAY, PING, PUSH_PROMISE). ALPN offers `["h2", "http/1.1"]`
(see `fetch/src/profile.ts`, `ALPN_PROTOCOLS`) so you can assert on the
negotiated protocol. The HTTP/2 SETTINGS frame is profile-seeded.

**Why a full browser is overkill:** Browsers abstract all of this away.
browsercore exposes the protocol layer directly, so you can assert on frames,
settings, and stream behavior.

---

## Decision checklist

Before choosing browsercore, confirm:

- [ ] The target content arrives in the initial HTML response (not JS-rendered).
- [ ] The site's bot detection keys on network signals (TLS / HTTP / headers),
      not JavaScript challenges.
- [ ] You do not need screenshots, DOM interaction, or visual verification.
- [ ] You have (or can obtain) session cookies without running a JS login flow.

If all four hold, browsercore is likely the lighter, faster, more reliable
choice. If any of them fails, read
[When NOT to Use browsercore](when-not-to-use-browsercore.md).
