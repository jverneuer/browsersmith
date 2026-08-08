# Scraping with browsersmith

The networking layer of a scraper that doesn't get 403'd. Sessions, concurrency, politeness, and a clear rule for when to escalate to a real browser.

## Why scraping needs fingerprint matching

Most bot-protected targets (Cloudflare, Akamai, DataDome, PerimeterX) fingerprint the TLS `ClientHello` and HTTP/2 `SETTINGS` frame, then 403 anything that doesn't match a known browser — before your code sees a response. Stock `fetch`, `undici`, `got`, and `axios` all fail this check. browsersmith ships wire-identical Chrome 140 / Firefox 128 fingerprints, so the request reaches your handler instead of the bot wall. See [bot-detection.md](./bot-detection.md) for the mechanism, [profiles.md](./profiles.md) for what's in a profile.

## The basic scraping loop

`createClient()` is **synchronous** — it returns a stateful client you call `.fetch()` on. One client per target site: it pools connections, shares a cookie jar across requests, and pins a single profile for the session.

```ts
import { createClient, createCookieJar, PROFILES } from "browsersmith";

const client = createClient({
  profile: PROFILES["chrome-140"],
  cookieJar: createCookieJar(),
});

const urls = ["https://example.com/", "https://example.com/docs", "https://example.com/pricing"];

for (const url of urls) {
  const res = await client.fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  console.log(res.status, url, (await res.text()).length);
}

await client.close();
```

A cookie jar matters: many targets issue a session cookie on the first request and 403 requests that don't replay it. Without a jar, every request looks like a new visitor; with one, the challenge cookie is replayed automatically.

## Walking a sitemap with `crawl()`

`crawl()` is the batteries-included helper: one pooled client walks a URL list, cookies flow between requests, and each result is reported as `ok` / `error` without aborting the batch. Three knobs: `concurrency` (per-host, default 1 = serial), `delayMs` (delay between requests), `cookieJar` (shared across the crawl).

```ts
import { crawl, createCookieJar, PROFILES } from "browsersmith";
import type { CrawlResult } from "browsersmith";

const urls = [
  "https://example.com/",
  "https://example.com/docs",
  "https://example.com/docs/quickstart",
  "https://example.com/pricing",
];

const results: CrawlResult[] = await crawl(urls, {
  profile: PROFILES["chrome-140"],
  cookieJar: createCookieJar(),
  concurrency: 2,
  delayMs: 200,
  timeoutMs: 10_000,
});

for (const r of results) {
  if (r.ok && r.response) console.log("OK  %d  %s", r.status, r.url);
  else console.log("FAIL    %s  (%s)", r.url, r.error ?? "unknown");
}
```

`crawl()` returns `Promise<CrawlResult[]>` — iterate with `for (const r of await crawl(...))`, not `for await`. Failed fetches become `{ ok: false, error }` and don't abort the rest. Full recipe: [examples.md#walking-a-sitemap-with-crawl](./examples.md#walking-a-sitemap-with-crawl).

## Cookies and sessions

Two patterns. First, persist cookies across runs — for logins that issue long-lived session cookies you'd rather not re-acquire every crawl:

```ts
import { createCookieJar, saveJar, loadJar, crawl, PROFILES } from "browsersmith";

// Resume from a previous run if it exists; otherwise start fresh.
const jar = await loadJar("./session.json").catch(() => createCookieJar());

await crawl(urls, {
  profile: PROFILES["chrome-140"],
  cookieJar: jar,
  concurrency: 2,
  delayMs: 200,
});

// Persist for the next run.
await saveJar(jar, "./session.json");
```

Second, use one jar per target domain when crawling multiple sites in one process. Cookies leaking across domains is both a privacy bug and a fingerprint leak. When in doubt, one jar per origin.

## Concurrency and politeness

Higher concurrency = faster crawl, higher block risk. `crawl()` caps concurrency per host, so crawling 5 hosts at `concurrency: 3` means up to 15 in-flight requests total. For most sites, `concurrency: 2-5` with `delayMs: 200-1000` is the polite zone. Honor `Retry-After` on 429 / 503 — bump `delayMs` and back off.

Pick one profile per target and stick with it for the session — rotating profiles per request looks like a bot evading detection ([bot-detection.md#patterns-to-avoid](./bot-detection.md#patterns-to-avoid)).

## When to reach for a real browser

If the target serves a Cloudflare JS challenge, a DataDome captcha, or any client-side fingerprint collection script (`navigator.webdriver`, WebGL vendor, canvas fingerprint, reCAPTCHA), browsersmith alone won't get past it — it doesn't execute JavaScript. Two escape hatches:

- **Pair browsersmith with a headless browser.** Use `puppeteer-extra` + `puppeteer-extra-plugin-stealth` (or Playwright) for the JS-challenge endpoints, browsersmith for everything else. The two are complementary — stealth patches the JS layer, browsersmith patches the network layer.
- **Use a captcha-solving service** for the rare request that genuinely needs one.

Be honest about limits: no fingerprint beats every detector. Some targets also do IP reputation, behavioral analysis, or TLS-1.2-only JA3 matching browsersmith doesn't yet cover. See [bot-detection.md](./bot-detection.md) and [comparison.md#when-to-combine](./comparison.md#when-to-combine).

## Composing with scraping frameworks

browsersmith composes with the usual suspects. The repo's `INTEGRATIONS.md` has per-framework details; the short version:

- **Crawlee** — wire browsersmith in as a `Crawler` transport for URLs that need fingerprint matching.
- **Firecrawl** — swap the fetch backend.
- **Cheerio** — `cheerio.load(await res.text())` on any browsersmith response body.
- **Stagehand / Browser Use** — pair browsersmith with a real browser for JS-heavy targets, browsersmith for the rest.

`crawl()` is just a helper — for retries, queues, dedupe, robots.txt, compose with Crawlee or your own.
