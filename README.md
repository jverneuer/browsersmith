# browsercore

You wrote a scraper. It worked yesterday. Today you're getting 403 Forbidden.

The site isn't blocking your IP. It's looking at how your request looks at the protocol level — the TLS handshake, the HTTP/2 settings, the order of headers. Real browsers send specific signatures. Your HTTP client doesn't.

**browsercore** (npm: `browsersmith`) is a TypeScript HTTP client that makes requests look exactly like Chrome or Firefox at the wire level. Pick a browser profile, and the TLS ClientHello, HTTP/2 SETTINGS, and header ordering match that browser byte-for-byte. Bot-detection systems that fingerprint those signals let your requests through.

It does not run a browser. It does not execute JavaScript. It solves one problem: making HTTP requests that pass bot-detection systems.

## Quickstart

**Prerequisites:** Node >= 26.

Install:

```sh
npm install browsersmith
```

Make your first request:

```ts
// save as test.ts, then run: npx tsx test.ts
import { fetch, PROFILES } from "browsersmith";

const response = await fetch("https://httpbin.org/get", {
  profile: PROFILES["chrome-140"],
});

console.log("Status:", response.status);
console.log(await response.text());
```

Run it:

```sh
npx tsx test.ts
```

You'll see a 200 status and a JSON response from httpbin. The request arrived with Chrome 140's TLS fingerprint, HTTP/2 settings, and header order — indistinguishable from a real browser at the protocol level.

## Core Concepts

### Profiles: Pick a browser, get its exact fingerprint

A profile is a browser fingerprint definition. It captures the TLS cipher suite order, HTTP/2 settings frame, and header ordering that a specific browser version emits. You pass a profile id to `fetch()` or `createClient()`, and browsercore reproduces that browser's wire signature.

```ts
import { PROFILES } from "browsersmith";

// The two starter profiles, pinned and ready to use
const response = await fetch("https://example.com", {
  profile: PROFILES["chrome-140"], // Chrome 140's exact fingerprint
});

// Other available profiles: "firefox-128", "safari-18", "edge-128", ...
import { listProfiles } from "browsersmith";
const allProfiles = listProfiles(); // returns all registered profile ids
```

Use a profile whenever you need a request to look like it came from a specific browser. Chrome 140 is the default recommendation for most targets.

### fetch(): Like fetch(), but browser-accurate

`fetch()` is a drop-in replacement for the global `fetch()` function. It takes a URL and options, returns a response. The difference: it sends the request with a real browser's TLS and HTTP fingerprint.

```ts
import { fetch, PROFILES } from "browsersmith";

const response = await fetch("https://example.com", {
  profile: PROFILES["chrome-140"],
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "hello" }),
  timeoutMs: 10_000,
});

console.log(response.status, response.headers);
const data = await response.json();
```

Use `fetch()` for one-off requests. For multiple requests to the same site, use `createClient()` to reuse connections and share a cookie jar.

### crawl(): Fetch many URLs with cookie persistence

`crawl()` walks a list of URLs with a shared connection pool and cookie jar. Cookies set by one request are automatically sent with the next. Failed requests don't abort the crawl — they're recorded as errors and the crawl continues.

```ts
import { crawl, PROFILES } from "browsersmith";

const results = await crawl([
  "https://example.com/page-1",
  "https://example.com/page-2",
  "https://example.com/page-3",
], {
  profile: PROFILES["chrome-140"],
  delayMs: 500,      // wait 500ms between requests
  concurrency: 2,    // two requests in flight at a time
});

for (const r of results) {
  console.log(r.url, r.ok ? r.status : r.error);
}
```

Use `crawl()` for batch fetching — sitemaps, product catalogs, or any list of URLs where you need cookie persistence and polite concurrency.

### Errors: What goes wrong and how to handle it

Every failure mode is a typed error. Match on the error type to handle it — no string parsing.

```ts
import { fetch, FetchError, FetchTimeoutError, RedirectError } from "browsersmith";

try {
  const response = await fetch("https://example.com", { timeoutMs: 5000 });
} catch (err) {
  if (err instanceof FetchTimeoutError) {
    console.error("Timed out after", err.timeoutMs, "ms");
  } else if (err instanceof RedirectError) {
    console.error("Too many redirects, last location:", err.location);
  } else if (err instanceof FetchError) {
    console.error("Request failed:", err.message, "URL:", err.url);
  } else {
    console.error("Unexpected error:", err);
  }
}
```

Use try/catch around any request. `FetchError` is the base class for all fetch-related failures. `FetchTimeoutError`, `RedirectError`, and `ProtocolError` cover specific failure modes.

## Integration & Ecosystem

### Scraping frameworks

**Cheerio** parses HTML. browsercore fetches it. Together they form a complete scraper: browsercore retrieves the page with a browser-accurate fingerprint, Cheerio extracts the data.

```ts
import { fetch, PROFILES } from "browsersmith";
import * as cheerio from "cheerio";

const response = await fetch("https://example.com/products", {
  profile: PROFILES["chrome-140"],
});
const $ = cheerio.load(await response.text());
const prices = $(".price").map((_, el) => $(el).text()).get();
```

Use this combo for product catalogs, directory listings, or any server-rendered content behind bot detection.

### Testing tools

**Playwright** automates a real browser — it can log in, solve CAPTCHAs, and handle complex auth flows. Once authenticated, export the session cookies and hand them to browsercore for high-volume requests. This avoids spinning up a browser instance for every request.

Use Playwright for the hard part (auth), browsercore for the scale part (data extraction).

### Bot-detection services

**DataDome**, **Kasada**, and **PerimeterX** hash TLS and HTTP fingerprints to identify non-browser clients. They check the cipher suite order, HTTP/2 settings, header order, and GREASE values (reserved bytes real browsers send to keep extensions flexible). browsercore reproduces these signals byte-for-byte for Chrome, Firefox, Safari, and Edge, so requests pass as legitimate browser traffic.

If your scraper works from your machine but fails in production, the target likely upgraded its bot detection. browsercore is the fix.

### MCP/AI agents

**Stagehand** and **BrowserKit** automate browsers for AI agents — they click, type, and navigate. browsercore complements them by handling the programmatic, high-volume requests that would otherwise get blocked. Use the agent for interaction, browsercore for data retrieval.

### Monitoring and uptime

Standard monitoring tools (Pingdom, UptimeRobot) send requests that look like bots. When a site behind bot detection goes down, these tools report a false positive — they get blocked, not the actual site. browsercore sends browser-accurate requests, so your monitoring sees what real users see.

Use it to verify that a site returns the right content, headers, and status codes from different regions.

### CDN and content verification

CDNs serve different content based on geography, device, and browser. To verify that a CDN is configured correctly, you need requests that look like they come from specific browsers in specific locations. browsercore lets you impersonate the browser; pair it with a proxy to impersonate the location.

Use it to verify compression (brotli, gzip), header configuration, and geographic content variation.

## When to Use / When Not to Use

| Use browsercore | Don't use browsercore |
|---|---|
| Scraping server-rendered sites behind bot detection | SPAs that need JavaScript execution |
| Passing TLS/HTTP fingerprinting (DataDome, Kasada, PerimeterX) | Tasks needing screenshots or visual rendering |
| High-volume crawling with cookie persistence | One-off requests (the setup overhead isn't worth it) |
| Session continuity across many requests | Full browser automation (use Playwright or Puppeteer) |
| API testing with browser-accurate requests | WebSocket connections (not supported) |
| Verifying CDN content and compression | Tasks requiring browser extensions or plugins |

## Reference

### API Surface

```ts
// One-shot request (creates a client, makes the request, closes the client)
function fetch(input: string, options?: FetchOptions): Promise<FetchResponse>;

// Create a reusable client with connection pooling
function createClient(options?: FetchClientOptions): FetchClient;

// Batch fetch a list of URLs with cookie persistence
function crawl(urls: readonly string[], options?: CrawlOptions): Promise<CrawlResult[]>;

// Cookie jar management
function createCookieJar(options?: CookieJarOptions): CookieJar;
async function saveJar(jar: CookieJar, filePath: string): Promise<void>;
async function loadJar(filePath: string): Promise<CookieJar>;

// Profile management
function getProfile(id: ProfileId): BrowserProfile;
function listProfiles(): ReadonlyArray<ProfileId>;
function registerProfile(profile: BrowserProfile): void;
```

### FetchClient

```ts
interface FetchClient {
  readonly id: FetchRequestId;
  fetch(input: string, options?: FetchOptions): Promise<FetchResponse>;
  close(): Promise<void>;
}
```

### FetchResponse

```ts
interface FetchResponse {
  readonly url: string;          // final URL after redirects
  readonly status: number;       // HTTP status code (e.g. 200)
  readonly statusText: string;   // HTTP status text (e.g. "OK")
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyUsed: boolean;    // whether the body has been consumed
  body(): Promise<Uint8Array>;   // consume body as bytes
  json(): Promise<unknown>;      // consume body as parsed JSON
  text(): Promise<string>;       // consume body as UTF-8 string
  clone(): FetchResponse;        // clone so body can be read again
}
```

### FetchOptions

```ts
interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Readonly<Record<string, string>>;
  body?: Uint8Array | string;
  profile?: ProfileId;           // browser profile to impersonate
  followRedirects?: boolean;     // default true
  maxRedirects?: number;         // default 20
  timeoutMs?: number;            // default 30_000
  cookieJar?: CookieJar;
  signal?: AbortSignal;
  priority?: number;             // HTTP/2 stream priority hint
}
```

### FetchClientOptions

```ts
interface FetchClientOptions {
  cookieJar?: CookieJar;
  profile?: ProfileId;
  redirectPolicy?: RedirectPolicy;
  timeoutMs?: number;
  idleTimeoutMs?: number;        // idle connection eviction, default 30_000
  transportFactory?: (host: string, port: number) => Promise<Transport> | Transport;
}
```

### CrawlOptions

```ts
interface CrawlOptions {
  profile?: ProfileId;
  cookieJar?: CookieJar;
  fetchOptions?: FetchOptions;
  delayMs?: number;              // delay between requests, default 0
  concurrency?: number;          // max in-flight per host, default 1
  timeoutMs?: number;
  transportFactory?: (host: string, port: number) => Promise<Transport> | Transport;
}
```

### Profiles

| Profile ID | Browser | Version |
|---|---|---|
| `chrome-120` | Chrome | 120.0.6099.71 |
| `chrome-128` | Chrome | 128.0.6613.137 |
| `chrome-140` | Chrome | 140.0.7339.18 |
| `firefox-120` | Firefox | 120.0 |
| `firefox-128` | Firefox | 128.0 |
| `firefox-135` | Firefox | 135.0 |
| `safari-17` | Safari | 17.6 |
| `safari-18` | Safari | 18.1 |
| `edge-120` | Edge | 120.0.2210.91 |
| `edge-128` | Edge | 128.0.2739.70 |

The `PROFILES` constant provides the two recommended starter profiles: `PROFILES["chrome-140"]` and `PROFILES["firefox-128"]`.

### Error Types

| Error | When it occurs |
|---|---|
| `FetchError` | Base class for all fetch failures. Check `kind`, `url`, `details`, and `cause`. |
| `FetchTimeoutError` | The request exceeded the configured `timeoutMs`. |
| `RedirectError` | Too many redirects, or a redirect was encountered with `redirectPolicy: "error"`. |
| `ProtocolError` | ALPN negotiation failed or the server rejected the offered protocols. |
| `AbortError` | The request was cancelled via `AbortSignal`. |
| `UnknownProfileError` | The requested profile id doesn't exist. |
| `CookieDomainError` | A cookie's domain doesn't match the request URL. |
| `CookieParseError` | A `Set-Cookie` header couldn't be parsed. |

## License

MIT
