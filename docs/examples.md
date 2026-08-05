# Examples & recipes

Copy-pasteable recipes for the common cases. Every snippet is a self-contained TypeScript file — save it as `recipe.ts` and run `npx tsx recipe.ts`. For install and first-request setup, see [getting-started.md](./getting-started.md); for the full profile surface, see [profiles.md](./profiles.md).

## Basic GET

The simplest case — a one-shot `fetch()` with the `chrome-140` profile, reading the body as text. Use this for ad-hoc requests where you don't need connection reuse.

```typescript
import { fetch, PROFILES } from "browsersmith";

const res = await fetch("https://example.com", {
  profile: PROFILES["chrome-140"],
  timeoutMs: 15_000,
  headers: {
    accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  },
});

console.log(res.status, res.statusText); // 200 OK
console.log(res.url);                     // final URL after redirects
console.log(res.headers["content-type"]);

const html = await res.text();
console.log(html.slice(0, 120));
```

`fetch()` is one-shot — no connection pooling. For multiple requests to the same origin, switch to `createClient()` (next recipe).

## POST with JSON body

Use `createClient()` for stateful work — it pools connections per origin. Note that browsersmith does NOT auto-set `Content-Type` from the body shape (browser fetch does); you must set it explicitly.

```typescript
import { createClient, PROFILES } from "browsersmith";

const client = createClient({ profile: PROFILES["chrome-140"] });

const res = await client.fetch("https://httpbin.example.com/post", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({ hello: "browsersmith", n: 42 }),
});

const data = (await res.json()) as { json: { hello: string; n: number } };
console.log(res.status, data.json);
await client.close();
```

`createClient()` is synchronous — don't `await` it. The returned client owns a connection pool, so call `client.close()` when you're done to drain it.

## Cookies across requests

Pass a `CookieJar` to `createClient({ cookieJar })` and cookies flow between requests automatically. Persist across process restarts with `saveJar()` / `loadJar()`.

```typescript
import {
  createClient,
  createCookieJar,
  saveJar,
  loadJar,
  PROFILES,
} from "browsersmith";

const jar = createCookieJar();
const client = createClient({
  profile: PROFILES["chrome-140"],
  cookieJar: jar,
});

// First request: server sets a session cookie via Set-Cookie.
await client.fetch("https://example.com/login", {
  method: "POST",
  body: "user=alice&token=secret",
});
// Second request: cookie is replayed automatically from the jar.
const res = await client.fetch("https://example.com/dashboard");
console.log(res.status, (await res.text()).slice(0, 80));
await client.close();

// Persist the session across process restarts.
await saveJar(jar, "./session.json");

// Later: restore it.
const restored = await loadJar("./session.json");
const resumed = createClient({
  profile: PROFILES["chrome-140"],
  cookieJar: restored,
});
```

The option is `cookieJar` (not `cookies`). `saveJar(jar, path)` and `loadJar(path)` are standalone async helpers — not methods on the jar.

## Walking a sitemap with `crawl()`

`crawl()` walks a URL list with a shared client + cookie jar, per-host concurrency cap, and an optional delay between requests. It returns `Promise<CrawlResult[]>` — not an async generator — so iterate the resolved array.

```typescript
import { crawl, createCookieJar, PROFILES } from "browsersmith";

const urls = [
  "https://example.com/",
  "https://example.com/docs",
  "https://example.com/docs/quickstart",
  "https://example.com/pricing",
];

const jar = createCookieJar();

const results = await crawl(urls, {
  profile: PROFILES["chrome-140"],
  cookieJar: jar,
  concurrency: 2,
  delayMs: 200,
  timeoutMs: 10_000,
  fetchOptions: {
    headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
  },
});

for (const r of results) {
  if (r.ok && r.status !== undefined) {
    console.log("OK   %d  %s", r.status, r.url);
  } else {
    console.log("FAIL     %s  (%s)", r.url, r.error ?? "unknown");
  }
}
```

A failed URL becomes `{ ok: false, error }` in the result array — it does NOT abort the whole crawl. For the full scraping pattern (retries, dedupe, queues), compose with Crawlee — see [use-cases/scraping.md](./use-cases/scraping.md).

## HTTP/3 (experimental)

HTTP/3 over QUIC is opt-in and not wired into the default ALPN dispatch. The `http3` option on `crawl()` takes a factory `(host, port) => Promise<DatagramTransport> | DatagramTransport` — you supply the UDP transport (e.g. a `node:dgram` adapter; browsersmith ships no default).

```typescript
import { crawl, PROFILES } from "browsersmith";
import type { DatagramTransport } from "browsersmith";
import dgram from "node:dgram";

// browsersmith ships no default UDP adapter — implement DatagramTransport
// (id / send / recv / close) over node:dgram yourself.
function makeDatagramTransport(host: string, port: number): DatagramTransport {
  const socket = dgram.createSocket("udp4");
  socket.connect(port, host);
  return {
    id: `udp:${host}:${port}`,
    send: (data) => new Promise((r) => socket.send(data, r)),
    recv: () =>
      new Promise((resolve) =>
        socket.once("message", (data) =>
          resolve({ data, from: { address: host, port, family: 4 as const } }),
        ),
      ),
    close: () => new Promise<void>((r) => socket.close(() => r())),
  };
}

// EXPERIMENTAL: one fresh QUIC + HTTP/3 connection per URL.
// No pooling, no cookie-jar coordination across the HTTP/3 path yet.
const results = await crawl(["https://example.com/"], {
  profile: PROFILES["chrome-140"],
  http3: (host, port) => makeDatagramTransport(host, port),
});

for (const r of results) {
  if (r.ok && r.http3Response) console.log("h3 %d  %s", r.http3Response.statusCode, r.url);
}
```

`http3Response` is a raw HTTP/3 response — NOT a `FetchResponse`; treat the two response fields as mutually exclusive. For direct access without `crawl()`, import `connectQuic` and `connectHttp3`. See [architecture.md](./architecture.md#the-http3-path) for layout and limits.

## Custom profile

Register a `BrowserProfile` for a browser browsersmith doesn't ship. Capture the real ClientHello first (Wireshark, `tls.peet.ws`, or `@browsercore/testing` golden captures) — invented values match nothing.

```typescript
import {
  fetch,
  registerProfile,
  type BrowserProfile,
  type ProfileId,
} from "browsersmith";

const safari18: BrowserProfile = {
  id: "safari-18" as ProfileId,
  name: "safari",
  version: "18.0",
  tls: {
    cipherSuites: [
      "TLS_AES_256_GCM_SHA384",
      "TLS_CHACHA20_POLY1305_SHA256",
      "TLS_AES_128_GCM_SHA256",
    ],
    extensionOrder: [0, 43, 51, 10, 22, 23, 13, 45, 11, 12, 42, 28, 35, 16, 65281],
    supportedVersions: ["TLS 1.3", "TLS 1.2"],
    keyShareGroups: ["x25519", "secp256r1"],
    signatureAlgorithms: ["ecdsa_secp256r1_sha256", "rsa_pss_rsae_sha256"],
    grease: false,
  },
  http2: {
    settings: { headerTableSize: 4096, enablePush: false, initialWindowSize: 65535, maxFrameSize: 16384 },
    initialWindowSize: 65535,
    maxFrameSize: 16384,
    headerTableSize: 4096,
    weight: 16,
  },
  http1: {
    defaultHeaders: {},
    headerOrder: ["host", "connection", "accept", "user-agent", "accept-language"],
    connection: "keep-alive",
    acceptEncoding: "gzip, deflate, br",
  },
};

registerProfile(safari18);

const res = await fetch("https://example.com", { profile: "safari-18" });
console.log(res.status, (await res.text()).slice(0, 80));
```

`registerProfile(profile)` takes a full `BrowserProfile` (not an id + options) and overwrites any existing profile with the same `id`. See [profiles.md](./profiles.md#registering-your-own-profile) for load-bearing fields per layer.

## Consuming the response body

`text()`, `json()`, and `body()` are the three ways to consume a response — mutually exclusive on a single response (call `clone()` first to read two ways).

```typescript
import { fetch, PROFILES } from "browsersmith";

const res = await fetch("https://example.com/large.html", {
  profile: PROFILES["chrome-140"],
});

const text = await res.text();
console.log("body chars:", text.length);

// To read two ways, clone before consuming the original.
const cloned = res.clone();
const raw = await cloned.body(); // Promise<Uint8Array>
console.log("first byte:", raw[0]);
```

`body()` returns `Promise<Uint8Array>` — a one-shot consume of the fully buffered (and decompressed) body, not an async-iterable stream. For genuinely streaming huge responses, drop down to `@browsercore/http1` or `@browsercore/http2`. Always consume the body (or `clone()`) — an unread body holds the pooled connection.

## Typed error handling

Every failure mode is a typed class re-exported from `browsersmith`. Use `instanceof` checks, most specific first.

```typescript
import {
  fetch,
  FetchError,
  FetchTimeoutError,
  RedirectError,
  ProtocolError,
  PROFILES,
} from "browsersmith";

async function fetchWithRetry(url: string, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        profile: PROFILES["chrome-140"],
        timeoutMs: 5_000,
      });
      console.log(res.status, (await res.text()).slice(0, 60));
      return;
    } catch (err) {
      if (err instanceof FetchTimeoutError) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i)); // backoff, retry
        continue;
      }
      if (err instanceof RedirectError) {
        console.error("redirect loop:", err.location, "after", err.redirectCount);
        return;
      }
      if (err instanceof ProtocolError) {
        console.error("protocol error:", err.offeredProtocols, "->", err.selectedProtocol);
        return;
      }
      if (err instanceof FetchError) {
        console.error("fetch failed:", err.url, err.message); // network, TLS, body
        return;
      }
      throw err;
    }
  }
}
```

Order matters: `FetchError` is the base class, so put narrower subclasses first. `FetchTimeoutError` does not extend `FetchError` (it carries `timeoutMs`, not `url`) — give it its own branch. See [getting-started.md](./getting-started.md#errors-and-timeouts) for the full hierarchy.

## Sources

- `examples/basic-fetch.ts`, `examples/crawl-sitemap.ts`, `examples/http1-vs-http2.ts` — canonical recipe sources lifted and adapted.
- `src/index.ts` — public API surface (re-export barrel): `fetch`, `createClient`, `crawl`, `PROFILES`, `createCookieJar` / `saveJar` / `loadJar`, `registerProfile`, `connectQuic` / `connectHttp3`, error classes.
- `src/crawl.ts` — `CrawlOptions` (profile, cookieJar, fetchOptions, delayMs, concurrency, timeoutMs, transportFactory, http3) + `CrawlResult` ({ url, ok, status?, response?, http3Response?, error? }). Returns `Promise<CrawlResult[]>`.
- `@browsercore/fetch` — `FetchResponse` (`body(): Promise<Uint8Array>`, `text()`, `json()`, `clone()`), `FetchClient` (`fetch()`, `close()`), `createClient()` (synchronous), `FetchError` / `FetchTimeoutError` / `RedirectError` / `ProtocolError`.
- `@browsercore/cookies` — `createCookieJar()`, `saveJar(jar, path)`, `loadJar(path)`.
- `@browsercore/profiles` — `registerProfile(profile: BrowserProfile)`, `BrowserProfile` shape (`id`, `name`, `version`, `tls`, `http2`, `http1`).
- `@browsercore/quic` — `connectQuic`, `DatagramTransport` interface (`id`, `send`, `recv`, `close`).
