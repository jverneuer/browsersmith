# Comparison with alternatives

browsersmith is a TypeScript-native, pure-JavaScript HTTP client that pins TLS, HTTP/1.1, HTTP/2, and (experimental) HTTP/3 fingerprints to match real browsers. This page compares it honestly against seven related projects — some compete on the network layer, some are complementary at the in-page runtime layer. If you want the byte-level "which layer of the stack controls which signal" view first, read [architecture](./architecture.md).

## Feature matrix

| Project | Language / Runtime | TLS JA3/JA4 | HTTP/2 (SETTINGS, HEADERS-order) | HTTP/3 + QUIC | Cookies | Serverless / Lambda | Native modules | JS runtime stealth | Active maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **browsersmith** | TypeScript, Node ≥26 | ✅ (chrome-140, firefox-128) | ✅<sup>1</sup> | ⚠️<sup>2</sup> | ✅ (CookieJar, `saveJar`/`loadJar`) | ✅ (pure TS, ESM) | None | ❌ | ✅ |
| **curl-impersonate** | C/C++ binary + wrappers | ✅ (21 presets, golden YAMLs) | ✅ (`CURLOPT_HTTP2_PSEUDO_HEADERS_ORDER` + SETTINGS) | ❌ | ✅ (libcurl cookie engine) | ❌ (native binary + BoringSSL/NSS) | Yes (BoringSSL, NSS, libnghttp2) | ❌ | ⚠️<sup>3</sup> |
| **curl_cffi** | Python 3.10+ (cffi FFI) | ✅ (JA3 / JA4R + 51+ presets) | ✅ (`akamai=`, `extra_fp` dict) | ✅<sup>4</sup> | ✅ (Session + CookieJar) | ⚠️ (10–20 MB wheel + C load) | Yes (bundled libcurl-impersonate) | ❌ | ✅ |
| **got-scraping** | TypeScript, Node ≥16 | ❌ | ❌ | ❌ | ❌ (delegated to got) | ✅ (pure JS) | None | ❌ | ❌ (EOL) |
| **CycleTLS** | JS over Go subprocess; native Go | ✅ (JA3 + JA4R strings) | ✅ (Akamai `http2Fingerprint`) | ✅ (GA, QUIC fingerprint hex) | ✅ (JS + Go jars) | ❌<sup>5</sup> | Yes (Go binary in npm tarball) | ❌ | ⚠️ |
| **puppeteer-extra-plugin-stealth** | JavaScript (CommonJS plugin) | ❌ (not network-layer) | ❌ | ❌ | ❌ (delegated to puppeteer) | ⚠️<sup>6</sup> | None directly (Chromium needed) | ✅ (15+ evasions) | ✅ |
| **undici** | Pure JavaScript, Node ≥18 (Node-core) | ❌ | ❌ | ❌ | ✅ (Cookie API) | ✅ (bundled in Node core) | None (llhttp WASM) | ❌ | ✅ |
| **node-fetch** | JavaScript, ESM/CJS, Node ≥12.20 | ❌ | ❌ (HTTP/1.1 only) | ❌ | ❌ (manual `Set-Cookie`) | ✅ (pure JS) | None | ❌ | ⚠️ (maintenance mode) |

Notes:

1. browsersmith's `@browsercore/http2` layer controls SETTINGS, WINDOW_UPDATE, and pseudo-header order; Akamai-format fingerprint strings are not yet a top-level API.
2. HTTP/3 + QUIC is experimental — see [architecture § HTTP/3 path](./architecture.md#the-http3-path).
3. The upstream `lwthiker` fork is slow-moving; the `lexiforest` fork (curl_cffi) ships new browser targets faster.
4. HTTP/3 fingerprints are GA in curl_cffi since v0.15.0; some targets are commercial-tier.
5. CycleTLS spawns a Go subprocess on a localhost port — does not survive Lambda freeze/thaw.
6. The plugin is pure JS, but underlying puppeteer still needs Chromium; `chrome-aws-lambda` is the Lambda path.

## When to use browsersmith

- You're in a TypeScript / Node.js / Next.js / Lambda@Edge stack and want zero native modules in the deploy artifact.
- Your target is AWS Lambda or another serverless runtime where a Go subprocess or BoringSSL build won't fit.
- You need HTTP/3 + QUIC with fingerprints, not just HTTP/2.
- You want a real fetch-shaped async API with `AsyncIterable` streaming, typed errors, redirects, and timeouts — not a CLI you shell out to.
- You'd rather pick from a curated profile registry than paste raw JA3 strings from Wireshark.
- You're documenting the boundary between network-layer and in-page-runtime stealth for a team — see [bot-detection](./bot-detection.md).

## When to use curl-impersonate

- You want the original, most battle-tested fingerprints — every commercial impersonation service traces back to this project.
- You're polyglot: the same library powers Python (via curl_cffi), PHP, JS, and Go bindings.
- You need a CLI tool (`curl_chrome116 https://…`) for one-shot debugging or shell scripts.
- You want a larger preset library — 21 targets spanning Chrome 99–116, Edge, Firefox 91esr–117, and Safari.
- You're on Linux or macOS-Intel where the pre-compiled binaries drop in without building from source.

## When to use curl_cffi

- You're in Python — fits Scrapy / requests / httpx workflows natively.
- You want the broadest profile library (51+ presets including Android and iOS variants).
- You want the bundled `curl-cffi` CLI as a debugging tool (`curl-cffi get tls.browserleaks.com/json --impersonate chrome`).
- You need asyncio + WebSocket + retry + caching in one package.
- You want to paste raw `ja3=` / `akamai=` / `extra_fp=` strings to impersonate non-browser targets (OkHttp, mobile apps).
- You want commercial support via `impersonate.pro`.

## When to use got-scraping

- Honestly, almost no reason in 2026 — got-scraping is end-of-life and Apify themselves recommend migrating to `impit`.
- The only legitimate case is "I have an existing got-based scraper and want minimal code churn": swapping `got` → `gotScraping` is a one-line import change that preserves the full got API surface.

## When to use CycleTLS

- You need HTTP/3 + QUIC fingerprinting as GA, not experimental.
- You want WebSocket + SSE clients built in.
- You're using the Go binding (no Node dependency in your deploy).
- You want to paste raw JA3 / JA4R / Akamai strings directly.
- You need `enableConnectionReuse` as a first-class documented feature.
- Caveat: the Go subprocess makes it unsuitable for AWS Lambda.

## When to use puppeteer-extra-plugin-stealth

This is a complementary tool, not a competitor — it covers a different layer of the stack.

- The target executes JavaScript and inspects `navigator.webdriver`, WebGL vendor, canvas, `chrome.runtime`, etc.
- You need to handle Cloudflare JS challenges, reCAPTCHA scoring, or fingerprint-collection scripts.
- You're already in the `puppeteer-extra` / `playwright-extra` plugin ecosystem.

browsersmith covers the network layer (TLS, HTTP/2, HTTP/3); stealth covers the in-page runtime. They compose — see [When to combine](#when-to-combine) below.

## When to use undici

- You want zero dependencies — undici is bundled into Node core since v18.
- You need raw HTTP/1.1 throughput (undici's `dispatch` tops 20 000 req/sec; node-fetch is ~4 700).
- You need `MockAgent`, interceptors, `ProxyAgent`, `Socks5ProxyAgent`, or `H2CClient`.
- You want LTS alignment with Node.js itself — version compatibility is documented and guaranteed.
- You don't need fingerprinting — API clients, internal microservices, webhooks.

## When to use node-fetch

- You want the closest spec compliance to the browser Fetch API surface in Node (deviations are documented in `v3-LIMITS.md`).
- You need stability and zero surprises on a long-running service.
- You want a tiny install size.
- You're on Node 12.20+ (browsersmith requires Node 26).
- You don't need fingerprinting, HTTP/2, or HTTP/3.

## When to combine

browsersmith is a networking-layer tool. It composes cleanly with JS-layer stealth tools, queue/retry frameworks, and HTML parsers — none of which it duplicates.

The canonical combination is **browsersmith (network layer) + `puppeteer-extra-plugin-stealth` (in-page runtime)**: use browsersmith for the bulk of HTML / API fetches, fall back to a stealth-puppeteer headless browser only when an endpoint serves a JS challenge, harvest the session cookie, then return to browsersmith for the heavy lifting. See the [When fingerprints aren't enough](./bot-detection.md#when-fingerprints-arent-enough) playbook.

| Combination | Use when |
|---|---|
| **browsersmith + `puppeteer-extra-plugin-stealth`** | Target does TLS fingerprinting **and** JS-runtime checks. Stealth handles the JS-challenge endpoints; browsersmith handles everything else at an order of magnitude higher throughput than a headless browser. |
| **browsersmith + Crawlee** | You need queueing, retries, dedupe, and request routing on top of a fingerprinted transport. Crawlee's `HttpClient` interface lets you swap in browsersmith as the transport. |
| **browsersmith + Cheerio** | You've fingerprinted past the bot wall and now need to parse the returned HTML. Cheerio handles selectors; browsersmith handles the bytes. |

browsersmith's `INTEGRATIONS.md` lists further known compositions — Firecrawl, Stagehand, MCP Fetch Server, Browser Use, n8n, Uptime Kuma, browserless, Playwright, Bright Data — pick the one that matches your orchestration layer.

## Sources

- Worklog task `1-R2` — per-project report (7 fields each) for curl-impersonate, curl_cffi, got-scraping, CycleTLS, puppeteer-extra-plugin-stealth, undici, node-fetch.
- Worklog task `1-R2` — side-by-side comparison matrix (8 projects × 9 attributes, with `✅` / `❌` / `⚠️` cells).
- Worklog task `1-R2` Snippet 2 — curl_cffi feature-comparison table style (emoji + superscript footnotes).
- Worklog task `1-R2` Snippet 3 — undici "When to Use Each" parallel-bullet-list pattern.
- Worklog task `1-repo-browsersmith` — `INTEGRATIONS.md` enumerates Crawlee, Firecrawl, Cheerio, MCP Fetch Server, Stagehand, Browser Use, n8n, Uptime Kuma, browserless, Playwright, Bright Data.
