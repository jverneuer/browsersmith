# Getting started

From zero to a browser-accurate `fetch()` in five minutes — install, first request, reading a response, and the `createClient()` pattern for connection reuse.

If you only want the 30-second version, the [README quickstart](../README.md#quickstart) has it. This page goes deeper: how the response is shaped, how to read bodies safely, when to graduate from `fetch()` to a stateful client, and how to branch on the typed error classes.

## Prerequisites

browsersmith is ESM-only, MIT-licensed, and requires Node ≥ 26. It runs on Linux, macOS, and Windows with no native modules — the entire TLS, HTTP/1.1, HTTP/2, and HTTP/3 stack is pure TypeScript on top of WebCrypto. If you're stuck on CommonJS, reach it from a `.cjs` file via dynamic `import()`:

```typescript
// From CommonJS:
// const { fetch, PROFILES } = await import("browsersmith");
```

## Install

One package, no peer deps to worry about — every protocol layer lives under the `@browsercore/*` namespace and is bundled in.

```sh
npm install browsersmith
# or: pnpm add browsersmith
# or: yarn add browsersmith
# or: bun add browsersmith
```

## Your first request

Pass a profile to `fetch()` and the bytes on the wire — TLS ClientHello, HTTP/2 SETTINGS frame, header order, GREASE — match Chrome 140 (or Firefox 128) byte-for-byte. That's why a site that 403s the stock Node `fetch` will respond 200 here.

```typescript
import { fetch, PROFILES, platform } from "browsersmith";

const res = await fetch("https://example.com", {
  profile: PROFILES["chrome-140"],
  timeoutMs: 15_000,
}, platform);

console.log(res.status, res.statusText); // 200 OK
console.log(res.url);                    // https://example.com (after redirects)
console.log(res.headers["server"]);     // ECS (dcb/1F8E)
const body = await res.text();
console.log(body.slice(0, 120));
```

The response mirrors the WHATWG shape you already know — `status`, `statusText`, `headers`, `url`, `body` — so existing code that consumes a `Response` ports over with minimal changes. For a deeper walkthrough of what's happening on the wire, see [architecture.md](./architecture.md).

## Reading the response

`FetchResponse` exposes three ways to consume the body: `text()` (UTF-8 string), `json()` (parsed value), and `body()` (raw `Uint8Array`). They're mutually exclusive on a single response — once you've consumed the body, `bodyUsed` flips to `true` and any further call rejects. Call `clone()` first if you need to read the same response two ways.

```typescript
// JSON shortcut — assert the shape yourself, browsersmith doesn't ship a schema layer.
const data = (await res.json()) as { ok: boolean };
```

```typescript
// Raw bytes — for binary content or when you want your own decoder.
const bytes = await res.body();
```

`body()` returns the fully buffered (and decompressed) body as a one-shot `Promise<Uint8Array>` — it is **not** an async-iterable stream. If you genuinely need streaming for very large responses, drop down a layer to [`@browsercore/http1`](https://github.com/jverneuer/browsercore-http1) or [`@browsercore/http2`](https://github.com/jverneuer/browsercore-http2), which expose the raw read loop. Always consume the body (or `clone()`) — an unread body holds the pooled connection. For more, see [examples.md](./examples.md#consuming-the-response-body).

## Connection reuse with `createClient()`

Every `fetch()` call spins up a fresh client, handshakes TLS, and tears it down — fine for ad-hoc probing, wasteful for crawlers. `createClient(options)` gives you a stateful `FetchClient` to call `.fetch()` on repeatedly.

One thing to get right up front: `createClient()` is **synchronous**. It returns a `FetchClient`, not a `Promise<FetchClient>`. Don't write `await createClient(...)` — there is no `await` to drop, and the old README / `llm.txt` examples that show one are drift. The function builds the client inline and hands it back ready to use.

```typescript
import { createClient, PROFILES, createCookieJar, platform } from "browsersmith";

const client = createClient({
  profile: PROFILES["chrome-140"],
  cookieJar: createCookieJar(),
  events: platform.events,
  timeoutMs: 15_000,
});

// Both requests share one TLS session and one cookie jar.
await client.fetch("https://example.com/login", {
  method: "POST",
  body: JSON.stringify({ user: "ada", pass: "lovelace" }),
});
const dashboard = await client.fetch("https://example.com/dashboard");
console.log(dashboard.status, (await dashboard.text()).length);
```

Pin a profile and a cookie jar once at the top, then call `.fetch()` per request — that's the whole pattern. The options object also accepts `transportFactory`, which swaps the underlying byte transport for an in-memory loopback; that's how the test suite works, but it's an [architecture.md](./architecture.md) topic.

## Errors and timeouts

browsersmith re-exports a small typed error hierarchy from `@browsercore/fetch`: `FetchError` is the base, with `FetchTimeoutError` (carries `timeoutMs`), `RedirectError`, and `ProtocolError` as subclasses. Branch on `instanceof` and recover per-class.

```typescript
import {
  fetch,
  PROFILES,
  FetchError,
  FetchTimeoutError,
  RedirectError,
  ProtocolError,
} from "browsersmith";

try {
  const res = await fetch("https://example.com", {
    profile: PROFILES["chrome-140"],
    timeoutMs: 5_000,
  });
  console.log(res.status);
} catch (err) {
  if (err instanceof FetchTimeoutError) {
    console.warn(`timed out after ${err.timeoutMs}ms — retry with backoff`);
  } else if (err instanceof RedirectError) {
    console.warn(`redirect loop or too many hops: ${err.message}`);
  } else if (err instanceof ProtocolError) {
    console.error(`wire-level failure: ${err.message}`);
    process.exit(1);
  } else if (err instanceof FetchError) {
    console.error(`fetch failed: ${err.message}`);
  } else {
    throw err; // re-throw anything we don't recognize
  }
}
```

If you opt into the experimental HTTP/3 path, the same `try/catch` will additionally surface `QuicError` and `Http3Error` family classes (e.g. `ConnectionClosedError`) re-exported from [`@browsercore/quic`](https://github.com/jverneuer/browsercore-quic) and [`@browsercore/http3`](https://github.com/jverneuer/browsercore-http3). Those are advanced — when in doubt, catch `FetchError` and inspect `err.cause` for the underlying protocol error.

## Where to go next

- **"I want recipes."** → [examples.md](./examples.md) — cookies, crawl, custom profile, errors.
- **"I want to understand the stack."** → [architecture.md](./architecture.md) — the layer cake.
- **"I'm scraping."** → [scraping.md](./scraping.md) — defeating bot detection with `crawl()`.
- **"I'm deploying to Lambda."** → [serverless.md](./serverless.md) — packaging, cold start, HTTP/3 caveats.

## Sources

- Worklog: Task `1-repo-browsersmith` — `src/index.ts` re-export surface, `src/profiles.ts` (`PROFILES = { "chrome-140": CHROME_140, "firefox-128": FIREFOX_128 }`), `src/crawl.ts` (returns `Promise<CrawlResult[]>`), `examples/basic-fetch.ts` (canonical recipe confirming bracketed `PROFILES["chrome-140"]` access and `FetchError` / `FetchTimeoutError` instanceof handling).
- Worklog: Task `1-repo-browsersmith` Stage Summary — headline trio `fetch` / `createClient` / `crawl`, ~50 public exports, doc-vs-code drift points (createClient sync not async, PROFILES bracketed access, `crawl()` returns `Promise<CrawlResult[]>`).
- Package: `@browsercore/fetch` — owns the `fetch()`, `createClient()`, `FetchClient`, and `FetchError` / `FetchTimeoutError` / `RedirectError` / `ProtocolError` implementations.
- Package: `@browsercore/profiles` — owns the `ProfileId` branded type and the profile registry.
