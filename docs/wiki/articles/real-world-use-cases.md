# Real-World Use Cases

Concrete scenarios where browsercore is the right tool — and a few where it is
not. Each scenario names the problem, why browsercore fits, and the specific
API or feature that does the work.

---

## Scraping a server-rendered product catalog

**The problem:** You need to monitor prices across a competitor's
server-rendered product listing page. The page returns full HTML with prices
embedded. The site runs behind Cloudflare and blocks requests whose JA3
fingerprint does not match a known browser.

**Why browsercore fits:** A `fetch()` with `profile: "chrome-140"` sends a TLS
ClientHello and HTTP/2 SETTINGS frame identical to Chrome 140. Cloudflare's
network-layer check passes. The response body contains the prices — no
rendering needed.

**How:**

```ts
import { fetch } from "browsercore";

const res = await fetch("https://example.com/products", {
  profile: "chrome-140",
});
const html = await res.text();
// Parse with your HTML parser of choice (linkedom, cheerio, etc.)
```

For a full catalog crawl, hand a URL list to `crawl()` with a shared cookie jar
and a polite `delayMs` between requests.

---

## Defeating a JA3-based WAF

**The problem:** A target site sits behind a WAF that computes a JA3 hash from
the TLS ClientHello and blocks any hash not on its allowlist. Standard Node
`fetch`, `axios`, and `got` all produce hashes that are not on the list.

**Why browsercore fits:** browsercore's TLS layer emits the exact ClientHello
a specific browser version emits — cipher order, extensions, GREASE, supported
versions, key-share groups, signature algorithms, all in the right order. The
JA3/JA4 hash matches the real browser's hash. The golden-capture tests in
`tests/golden-fingerprint.test.ts` assert this against real browser captures in
`testing/captures/`.

**How:** Pick the profile that matches the WAF's allowlist (e.g.
`"firefox-128"` if Firefox is allowed) and make the request. The fingerprint is
automatic — no manual TLS configuration.

---

## Authenticated API testing in CI

**The problem:** Your API sets a session cookie on `/login` and requires it on
`/account`. You want a CI test that logs in, then asserts the authenticated
response — using a real browser's request shape so the test exercises the same
code path a user would hit.

**Why browsercore fits:** `createClient({ cookieJar })` persists cookies across
requests. The login response's `Set-Cookie` is stored automatically; the next
request sends it back. The request carries a browser-accurate fingerprint, so
the test hits the same WAF / bot-detection code path as production traffic.

**How:**

```ts
import { createClient, createCookieJar } from "browsercore";

const jar = createCookieJar();
const client = createClient({ profile: "chrome-140", cookieJar: jar });

await client.fetch("https://api.example.com/login", {
  method: "POST",
  body: JSON.stringify({ username, password }),
  headers: { "content-type": "application/json" },
});
const res = await client.fetch("https://api.example.com/account");
console.assert(res.status === 200);
```

No browser binary, no system dependencies — runs in any CI container with
Node >= 26.

---

## Crawling a news archive with session continuity

**The problem:** A news site requires a consent cookie (`cookie_consent=1`) set
on the first visit before it serves article content. You need to crawl a
thousand archive URLs, carrying that consent cookie across all of them.

**Why browsercore fits:** `crawl(urls, { cookieJar })` shares one cookie jar
across every request in the crawl. The first request stores the consent
cookie; every subsequent request sends it. Results are returned in input order,
and a single failed URL does not abort the crawl — it is recorded as
`{ ok: false, error }` and the next URL proceeds.

**How:**

```ts
import { crawl, createCookieJar } from "browsercore";

const jar = createCookieJar();
const results = await crawl(archiveUrls, {
  profile: "chrome-140",
  cookieJar: jar,
  delayMs: 500,
  concurrency: 2,
  timeoutMs: 15_000,
});
```

After the crawl, `saveJar(jar, "session.json")` persists the session for later
resumption with `loadJar("session.json")`.

---

## Content-encoding verification for a CDN

**The problem:** You run a CDN that serves brotli-compressed responses to
clients that advertise `br` in `accept-encoding`. You want to verify that a
request from a Chrome-like client receives a correctly brotli-compressed
body — and that the deflate fallback (zlib-wrapped, then raw) works for older
clients.

**Why browsercore fits:** The compression layer decodes gzip / deflate (zlib +
raw fallback) / brotli / identity transparently, with browser-tolerant deflate
handling. The `accept-encoding` header is profile-accurate. You can assert on
the negotiated encoding and the decoded body.

**How:** Make a request with a profile that advertises brotli (e.g.
`"chrome-140"`), then assert the response decodes correctly. The decoding is
automatic — `response.text()` returns the decompressed body.

---

## HTTP/2 server conformance test

**The scenario:** You operate an HTTP/2 server and want to assert that it
correctly handles stream multiplexing, respects the client's SETTINGS frame,
and sends a valid connection preface.

**Why browsercore fits:** `@browsercore/http2` is a full HTTP/2 framing
implementation — frame parse / serialize, HPACK, stream lifecycle, flow
control, SETTINGS, GOAWAY, PING, PUSH_PROMISE. ALPN offers `["h2", "http/1.1"]`
so you can assert the server negotiates h2. The SETTINGS frame is seeded from
the profile (see `fetch/src/profile.ts`, `profileHttp2Settings`).

**How:** `createClient({ profile: "chrome-140" })` negotiates h2 when the
server supports it. You can then assert on the negotiated protocol, the
SETTINGS exchange, and multiplexed stream behavior.

---

## When browsercore is NOT the right tool (concrete)

| Scenario | Why browsercore fails | What to use |
| --- | --- | --- |
| Scraping a React SPA that renders all content client-side | Returns an empty `<div id="root">` shell | Playwright / Puppeteer |
| Passing a Cloudflare Turnstile challenge | No JS engine to solve the challenge | A real browser, or a CAPTCHA service |
| Capturing a screenshot of a rendered page | No compositor, no pixels | Playwright / Puppeteer |
| Logging into a site that computes its CSRF token in JavaScript | No JS to evaluate the token | Playwright to log in, then export cookies to browsercore |
| Acting on your logged-in LinkedIn session via an AI agent | Cannot attach to your Chrome; not an MCP server | BrowserKit |
| Targeting an HTTP/3-only endpoint | HTTP/3 not wired into the entrypoint | An HTTP/3-capable client |

---

## A common combined pattern

A practical workflow that plays to each tool's strengths:

1. **Authenticate once** with Playwright (or BrowserKit, or a manual browser
   session). Export the resulting cookies.
2. **Load the cookies** into browsercore via `createCookieJar` + `setCookie`,
   or `loadJar` from a serialized snapshot.
3. **Scale the work** with browsercore — `crawl()` for batch scraping,
   `createClient()` for high-concurrency API calls, all carrying the
   authenticated state and a browser-identical fingerprint.

This splits the problem: the browser handles the human-in-the-loop login that
browsercore cannot do, and browsercore handles the high-throughput work that a
browser is too heavy for.
