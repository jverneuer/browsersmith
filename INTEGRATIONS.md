# Ecosystem & Integrations

browsercore is a fetchable transport layer. Its value shows up wherever a tool makes HTTP requests that get blocked, fingerprinted, or challenged by bot-detection systems. This section documents real projects where integrating browsercore provides concrete, specific value — and an honest reckoning with where it doesn't.

All projects below are verified active (commits within the last 12 months unless noted) and their integration sketches use real browsercore API: `createClient`, `fetch`, `crawl`, `PROFILES`, `CHROME_140`, `FIREFOX_128`, `createCookieJar`, `loadJar`, `saveJar`.

---

## Web Scraping Frameworks

### [Crawlee](https://github.com/apify/crawlee)

**What it is:** Apify's web scraping and browser automation framework (5,410 commits, Apache-2.0) — queue management, proxy rotation, storage, and both HTTP and headless-browser crawling behind one API.

**Why integrate browsercore:** Crawlee's HTTP crawler (`CheerioCrawler`) historically used [got-scraping](https://github.com/apify/got-scraping) for browser-like requests — a package Apify **deprecated in 2025** in favor of their Rust-based `impit`. The Node ecosystem lost its maintained browser-fingerprinting HTTP client. browsercore fills that gap: it gives Crawlee's HTTP path byte-accurate Chrome/Firefox TLS ClientHellos (JA3/JA4), HTTP/2 SETTINGS frames, and header ordering — the signals bot detectors actually score. Crawlee keeps what it's good at (queue, proxy rotation, session storage); browsercore replaces the transport layer that got-scraping left behind.

**Integration pattern:**
```ts
import { CheerioCrawler, Dataset } from 'crawlee';
import { createClient, PROFILES, loadJar } from 'browsersmith';

// browsercore handles fingerprinting; Crawlee handles queue/proxy/storage.
const client = createClient({
    profile: PROFILES['chrome-140'],
    cookieJar: loadJar('./session.json'),
});

const crawler = new CheerioCrawler({
    async requestHandler({ request, log }) {
        const res = await client.fetch(request.url, { timeoutMs: 30_000 });
        const html = await res.text();
        log.info(`${request.url} -> ${res.status}`);
        await Dataset.pushData({ url: request.url, html });
    },
});
```

**Value to user:** Crawlee's HTTP crawler stops getting 403'd by Cloudflare and DataDome on bot-protected targets, without paying the overhead of spinning up a headless browser per page.

**Maturity:** Production-ready

---

### [Firecrawl](https://github.com/firecrawl/firecrawl)

**What it is:** Web-scraping API (6,047 commits, AGPL-3.0) that turns URLs into markdown, structured JSON, or screenshots — with a hosted service and self-hosted option, plus an MCP server for AI agents.

**Why integrate browsercore:** Firecrawl's `/scrape` endpoint runs headless browsers for JS-heavy pages, which is expensive at scale. For the large fraction of pages that serve static HTML (docs, forums, product listings, government sites), browsercore can power a lighter "fast scrape" tier: same HTML, no browser, with TLS/HTTP2 fingerprints that still pass bot checks. Self-hosting users especially benefit — they trade browser-instance cost for a cheap `fetch()`.

**Integration pattern:**
```ts
import { createClient, PROFILES } from 'browsersmith';

// A "fast scrape" route: static pages without spinning up a browser.
const client = createClient({ profile: PROFILES['chrome-140'] });

export async function fastScrape(url: string) {
    const res = await client.fetch(url, {
        timeoutMs: 15_000,
        // Follow the same redirect chain a browser would.
        followRedirects: true,
    });
    return { status: res.status, html: await res.text() };
}
```

**Value to user:** Self-hosted Firecrawl operators cut per-request cost on static pages while keeping bot-detection resistance — no headless browser pool to manage for the easy 60% of URLs.

**Maturity:** Experimental (would be a new fast-path tier in Firecrawl's router)

---

### [Cheerio](https://github.com/cheeriojs/cheerio)

**What it is:** Fast, jQuery-like HTML parser for Node.js (4,268 commits, MIT) — the de facto parse layer for hand-rolled scrapers. It does not make HTTP requests.

**Why integrate browsercore:** Cheerio needs something to fetch the HTML. Most pair it with `node-fetch`, `axios`, or `got` — all of which emit Node's default TLS fingerprint and get blocked on bot-protected sites. browsercore is the fetch layer that doesn't get blocked. The combo is the modern equivalent of "requests + BeautifulSoup" in Python, but with browser-accurate wire fingerprints out of the box.

**Integration pattern:**
```ts
import * as cheerio from 'cheerio';
import { createClient, PROFILES, createCookieJar } from 'browsersmith';

const client = createClient({
    profile: PROFILES['chrome-140'],
    cookieJar: createCookieJar(), // persists cookies across requests
});

export async function scrapePrice(url: string) {
    const res = await client.fetch(url);
    const $ = cheerio.load(await res.text());
    return { title: $('h1').text(), price: $('.price').text() };
}
```

**Value to user:** A scraper that parses with Cheerio and fetches with browsercore passes bot detection that blocks `axios`/`node-fetch` — no proxy rotation required for moderate-volume scraping.

**Maturity:** Production-ready

---

## AI Agents & MCP

### [MCP Fetch Server](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)

**What it is:** The reference implementation of a web-fetch MCP server (maintained by Anthropic under the modelcontextprotocol org, 4,158 commits on the parent repo). It gives AI agents a `fetch` tool to retrieve web pages as markdown.

**Why integrate browsercore:** The reference `mcp-server-fetch` uses Python's `urllib`/`requests` under the hood — fingerprints that scream "bot" to Cloudflare, DataDome, and PerimeterX. Any AI agent using it against a protected site gets a challenge page instead of content. A browsercore-backed fetch MCP server would return real content, because the TLS ClientHello and HTTP/2 SETTINGS match Chrome byte-for-byte. This is the highest-leverage integration in this document: it makes every MCP-compatible AI agent (Claude Desktop, Cursor, VS Code, Cline) unblocked with one server swap.

**Integration pattern:**
```ts
// A drop-in browsercore-backed fetch MCP server (TypeScript).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient, PROFILES } from 'browsersmith';

const client = createClient({ profile: PROFILES['chrome-140'] });
const server = new McpServer({ name: 'browsercore-fetch', version: '1.0.0' });

server.tool('fetch', { url: z.string() }, async ({ url }) => {
    const res = await client.fetch(url, { timeoutMs: 30_000 });
    const html = await res.text();
    return { content: [{ type: 'text', text: html }] };
});
```

**Value to user:** AI agents retrieve content from bot-protected sites (news, forums, e-commerce) without getting challenge pages — the difference between an agent that "can browse the web" and one that gets stuck on Cloudflare.

**Maturity:** Experimental (a new MCP server, but built on production-ready primitives)

---

### [Stagehand](https://github.com/browserbase/stagehand)

**What it is:** Browserbase's AI browser-automation SDK (1,414 commits, MIT) — lets agents navigate pages with natural language and code, backed by Playwright/CDP.

**Why integrate browsercore:** Stagehand spins up a real browser for every task. That's necessary for clicking, typing, and JS rendering — but wasteful when the agent only needs to *read* a page. browsercore handles the "fetch and read" subset (static content, API responses, docs) at a fraction of the memory and latency, leaving Stagehand's browser for the interactions that actually need one. Think of it as a fast path before the slow path.

**Integration pattern:**
```ts
import { createClient, PROFILES } from 'browsersmith';

const client = createClient({ profile: PROFILES['chrome-140'] });

// Before spinning up a Stagehand browser, try a lightweight fetch.
export async function readPage(url: string) {
    const res = await client.fetch(url);
    if (res.status === 200) return await res.text(); // static page — done.
    // Fall back to Stagehead only when the page challenges or needs JS.
    return null;
}
```

**Value to user:** AI-agent builders cut browser-instance costs on read-only tasks and reduce latency — only pay for a full browser when the task genuinely requires interaction.

**Maturity:** Experimental

---

### [Browser Use](https://github.com/browser-use/browser-use)

**What it is:** Python library that lets AI agents control real browsers (10,008 commits, MIT) — the open-source core behind Browser Use Cloud, popular for agent-driven web automation.

**Why integrate browsercore:** Same logic as Stagehand, but in the Python ecosystem. Browser Use drives a real browser (Playwright) for every task. For the subset of tasks that are "fetch this URL and tell me what's on it," a browsercore-backed HTTP call (via a Node subprocess or an HTTP microservice) is orders of magnitude cheaper. The integration is less clean here because browsercore is Node-only — it requires a small Node sidecar or HTTP wrapper called from Python.

**Integration pattern:**
```ts
// Node sidecar: browsercore fetch service on :8090
import { createClient, PROFILES } from 'browsersmith';
import { serve } from 'node:http';

const client = createClient({ profile: PROFILES['chrome-140'] });
serve(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost').searchParams.get('url')!;
    const html = await (await client.fetch(url)).text();
    res.end(html);
}).listen(8090);
```

**Value to user:** Python agent builders reduce Playwright browser usage to interaction-only tasks, cutting memory and cost on the read-only majority.

**Maturity:** Potential (requires a Node sidecar from Python — extra operational complexity)

---

## Workflow Automation & Monitoring

### [n8n](https://github.com/n8n-io/n8n)

**What it is:** Fair-code workflow automation platform (22,605 commits) — visual canvas plus code, 1,500+ integrations, self-hosted or cloud. Its HTTP Request node is the common way workflows pull data from the web.

**Why integrate browsercore:** n8n's HTTP Request node uses Node's standard `fetch`/undertow — default TLS fingerprint, instant bot-detection flag. Any workflow scraping a protected site (price monitoring, lead gen, content aggregation) gets blocked. A custom n8n node wrapping browsercore lets those workflows fetch with a real browser fingerprint, while n8n handles scheduling, retries, and data routing. The custom-node surface (`n8n-nodes-community`) is well-documented.

**Integration pattern:**
```ts
// Inside a custom n8n node's execute() method:
import { createClient, PROFILES } from 'browsersmith';

const client = createClient({ profile: PROFILES['chrome-140'] });

const res = await client.fetch(this.getNodeParameter('url', 0) as string, {
    timeoutMs: 30_000,
});
const body = await res.text();
return [{ json: { status: res.status, html: body } }];
```

**Value to user:** n8n workflows that scrape bot-protected sites start working without proxy services — the HTTP Request node gains browser-grade fingerprinting.

**Maturity:** Experimental (requires building/packaging a custom node)

---

### [Uptime Kuma](https://github.com/louislam/uptime-kuma)

**What it is:** Self-hosted uptime monitor (7,204 commits, MIT) — HTTP(s) keyword checks, certificate monitoring, 90+ notification channels. Popular replacement for Uptime Robot.

**Why integrate browsercore:** Uptime Kuma's HTTP checks use a standard Node fingerprint. When you monitor a site behind Cloudflare or a similar WAF, the probe itself can get challenged or rate-limited — producing false "down" alerts. A browsercore-backed monitor probe sends requests that look like a real browser, so you measure the *actual* user-facing uptime, not whether the WAF likes your probe. Most valuable for monitoring sites you don't control that sit behind bot protection.

**Integration pattern:**
```ts
// A custom Uptime Kuma probe (via its Kubernetes-style monitor or a forked HTTP monitor).
import { createClient, PROFILES } from 'browsersmith';

const client = createClient({ profile: PROFILES['chrome-140'] });
const res = await client.fetch(monitor.url, { timeoutMs: 10_000 });
const body = await res.text();
// Uptime Kuma's "keyword check" logic:
const ok = res.status === 200 && body.includes(monitor.keyword);
```

**Value to user:** Accurate uptime monitoring of bot-protected sites — eliminates false downtime alerts caused by the probe itself getting blocked.

**Maturity:** Potential (requires a custom monitor type or fork; Uptime Kuma doesn't expose a pluggable HTTP-client interface today)

---

## Headless Browser Orchestration

### [browserless](https://github.com/browserless/browserless)

**What it is:** Headless-browser hosting platform (6,290 commits) — run Chrome in Docker or their cloud, connect via Puppeteer/Playwright. Their `/smart-scrape` API cascades from HTTP fetch → proxy → headless browser → CAPTCHA solving.

**Why integrate browsercore:** browserless's smart-scrape cascade starts with a plain HTTP fetch. That first tier fails on any bot-protected site, forcing escalation to the expensive browser tier. Replacing (or preceding) that first tier with browsercore means the "cheap" path actually works on protected sites — fewer escalations to paid browser instances. For browserless's own API customers, it raises the success rate of the cheapest tier. For browserless users building their own tools, browsercore handles the "I just need the HTML" case without a browser at all.

**Integration pattern:**
```ts
import { createClient, PROFILES } from 'browsersmith';

// Replace browserless's plain-fetch tier with a browsercore fetch.
const client = createClient({ profile: PROFILES['chrome-140'] });

export async function smartFetch(url: string) {
    const res = await client.fetch(url, { timeoutMs: 15_000 });
    if (res.status === 200) return await res.text(); // cheap tier now works on protected sites
    // Escalate to browserless only when truly needed.
    return null;
}
```

**Value to user:** Fewer headless-browser instances needed for scraping — browsercore's fetch succeeds where plain HTTP gets challenged.

**Maturity:** Experimental

---

### [Playwright](https://github.com/microsoft/playwright)

**What it is:** Microsoft's browser-automation framework (17,633 commits, Apache-2.0) — drives real Chromium, Firefox, WebKit. The industry standard for testing and browser-based scraping.

**Why integrate browsercore:** Honest caveat first — Playwright *already* has perfect browser fingerprints because it drives a real browser. browsercore does not improve Playwright's fingerprinting. The value is purely resource reduction: if you're using Playwright to fetch static HTML (no JS execution needed), browsercore uses ~100x less memory and ~10x less latency per request. The integration is "use browsercore for the fetch-only steps, Playwright for the steps that need a real DOM." Not a fingerprint story — a cost story.

**Integration pattern:**
```ts
import { createClient, PROFILES } from 'browsersmith';
import { chromium } from 'playwright';

const client = createClient({ profile: PROFILES['chrome-140'] });

// Fetch static content cheaply with browsercore.
const html = await (await client.fetch('https://example.com/docs')).text();

// Only launch a real browser when you need interaction.
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://example.com/login');
```

**Value to user:** Teams using Playwright for mixed workloads (fetch + interact) cut infrastructure costs on the fetch portion while keeping real-browser accuracy for interactions.

**Maturity:** Production-ready (but the value proposition is narrower than for other entries — only the resource argument holds)

---

## Proxy & Data Services

### [Bright Data](https://brightdata.com)

**What it is:** Commercial web-data platform — residential proxies, datacenter proxies, a "Web Unlocker" (anti-bot bypass), Scraper API, and datasets. 20,000+ customers.

**Why integrate browsercore:** Bright Data's proxy networks give you the *IP* (residential, mobile, datacenter). browsercore gives you the *fingerprint* (TLS ClientHello, HTTP/2 SETTINGS, header order). IP and fingerprint are the two independent signals bot detectors correlate — a residential IP with a Node.js TLS fingerprint still gets flagged. Pairing them closes the loop: Bright Data's IP + browsercore's fingerprint = requests that look like a real user on a real device. This is complementary, not competitive: Bright Data doesn't ship a Node fetch client with browser-accurate TLS.

**Integration pattern:**
```ts
import { createClient, PROFILES } from 'browsersmith';

// Route browsercore through Bright Data's residential proxy.
// transportFactory overrides TCP transport creation — point it at Bright Data's
// proxy endpoint. (Proxy auth handled inside the factory; specifics depend on
// Bright Data's proxy protocol — HTTP CONNECT or SOCKS5.)
const BRIGHTDATA_PROXY = 'proxy.brightdata.com:22225';
const client = createClient({
    profile: PROFILES['chrome-140'],
    transportFactory: (host, port) =>
        createTcpTransport(BRIGHTDATA_PROXY, { host, port, auth: process.env.BRIGHTDATA_AUTH! }),
});

const res = await client.fetch('https://target-site.com/product/123');
```

**Value to user:** Residential proxies that actually pass bot detection — the IP is residential *and* the TLS/HTTP2 fingerprint matches a real browser, so both signals align.

**Maturity:** Production-ready (both pieces are production-grade; wiring them together is the integration work)

---

## Bot Detection (compatibility reference)

These aren't integrations — they're the adversaries. Documenting them because understanding *what they check* tells you whether browsercore helps.

### [Cloudflare Bot Management](https://www.cloudflare.com/products/bot-management/)

**What it is:** Cloudflare's bot-detection layer, scoring requests via JA3/JA4 TLS hashes, HTTP/2 fingerprinting, JS challenges, and behavioral signals.

**Where browsercore passes:** JA3/JA4 TLS fingerprint (browsercore's ClientHello matches Chrome/Firefox byte-for-byte), HTTP/2 SETTINGS frame layout, and HTTP/1.1 header ordering. These are the passive network-layer checks — the ones computed from the first packets.

**Where browsercore does NOT pass:** JS challenges (Turnstile, managed challenges), behavioral analysis, and CAPTCHAs. browsercore doesn't execute JS. Against Cloudflare Enterprise with JS challenges enabled, browsercore gets the challenge just like any non-browser client.

**Verdict:** browsercore clears the network-layer bar for Cloudflare's *free/pro* bot fight mode and lowers bot scores in Enterprise. It does not bypass JS challenges.

---

### [DataDome](https://datadome.co/)

**What it is:** Real-time bot protection (reverse-proxy / edge) combining TLS fingerprinting, device/browser fingerprinting, behavioral biometrics, and IP intelligence.

**Where browsercore passes:** TLS fingerprinting (JA3-style and their proprietary variant) and header-set consistency. DataDome's docs and public analysis confirm TLS is one signal among many.

**Where browsercore does NOT pass:** JS sensor data collection, canvas/WebGL/audio fingerprinting, mouse-movement behavioral analysis. DataDome cross-correlates signals — a perfect TLS fingerprint with no JS sensor data is itself suspicious.

**Verdict:** browsercore satisfies DataDome's TLS layer. Against a full DataDome deployment, that's necessary but not sufficient — the JS and behavioral layers still flag a non-browser client.

---

## Rejected / competing projects

Honest accounting of projects evaluated that did **not** make the cut:

| Project | Reason |
|---|---|
| **[impit](https://github.com/apify/impit)** (Apify) | Direct competitor, not an integration target. Rust-based browser impersonation with a `fetch()` API — solves the same problem as browsercore. Worth knowing about; not worth integrating. |
| **[got-scraping](https://github.com/apify/got-scraping)** (Apify) | Deprecated in 2025, replaced by impit. Not maintained. |
| **[ScrapingBee](https://github.com/scrapingbee/scrapingbee-node)** | Hosted scraper API with its own fingerprinting — a competitor to browsercore's value prop, not a partner. |
| **[Claude Code](https://github.com/anthropics/claude-code)** | Has its own web-fetch tooling; browsercore adds little. |
| **[Checkly](https://github.com/checkly/checkly-go-sdk)** | Synthetic monitoring, but their checks target APIs and user journeys, not bot-protected scraping. Weak value prop. |

---

## Summary

| Category | # Integrations | Highest value |
|---|---|---|
| Web scraping frameworks | 3 | **Crawlee** — direct replacement for deprecated got-scraping transport |
| AI agents & MCP | 3 | **MCP Fetch Server** — unblocks every MCP-compatible AI agent |
| Workflow automation & monitoring | 2 | **n8n** — browser-grade fingerprinting for workflow HTTP calls |
| Headless browser orchestration | 2 | **browserless** — raises success rate of the cheap fetch tier |
| Proxy & data services | 1 | **Bright Data** — residential IP + browser fingerprint, both signals aligned |
| Bot detection (reference) | 2 | **Cloudflare** — clears JA3/JA4 + HTTP/2 SETTINGS network-layer checks |

**The pattern:** browsercore adds the most value where a tool already makes HTTP requests but gets blocked at the TLS/HTTP2 layer. It adds the least value where a tool already drives a real browser (the fingerprint is already correct) or where the adversary requires JS execution (which browsercore doesn't do). Integrate it as a *transport layer*, not as a magic bypass.
