# Quickstart — your first request in five minutes

This guide takes you from `npm install` to a working request that looks like
Chrome 140 on the wire. Everything here runs against a public site; no setup
beyond the install is required.

## 1. Install

```sh
npm install browsercore
```

The package is **ESM only** and requires **Node >= 26**. If you are on an
older Node, upgrade first — the TLS layer relies on APIs only available in
recent Node releases. There are no peer dependencies, no native builds, no
post-install steps.

## 2. Make a one-shot request

The `fetch` export is a convenience function: it creates a default client,
issues the request, and closes the client when it finishes. Pass a `profile`
to pick which browser to impersonate.

```ts
import { fetch } from "browsercore";

const res = await fetch("https://example.com", {
    profile: "chrome-140",
    timeoutMs: 15_000,
});

console.log(res.status, res.statusText);
console.log(await res.text());
```

That is the entire API surface most scripts need. The `profile` string is the
only new concept: it selects a built-in browser fingerprint (Chrome 140,
Firefox 128, and others) that drives the TLS ClientHello, the HTTP/2 SETTINGS
frame, and the header order. Pick a profile and the stack reproduces that
browser's wire bytes.

## 3. Read the response

`FetchResponse` mirrors the standard `Response` shape:

| Method | Returns | Notes |
| --- | --- | --- |
| `res.status` | `number` | HTTP status code |
| `res.statusText` | `string` | HTTP reason phrase |
| `res.headers` | `Record<string, string>` | Lowercased header map |
| `res.text()` | `Promise<string>` | Decode the body as UTF-8 |
| `res.json()` | `Promise<unknown>` | Parse the body as JSON |
| `res.body()` | `Promise<Uint8Array>` | Raw bytes |
| `res.clone()` | `FetchResponse` | Read the body more than once |

The body is **streaming and single-use**: once you call `text()`, `json()`, or
`body()`, it is consumed. Call `clone()` first if you need to read it twice:

```ts
const clone = res.clone();
const asText = await res.text();
const asJson = await clone.json();
```

Decompression (gzip, deflate, brotli) is handled transparently based on the
response's `Content-Encoding`, so you never decode manually.

## 4. Reuse a client

`fetch()` creates a fresh client every call. When you are making several
requests to the same origin, build a `FetchClient` once and reuse it: the
client pools connections per origin and keeps a cookie jar across calls.

```ts
import { createClient, createCookieJar } from "browsercore";

const jar = createCookieJar();
const client = createClient({
    profile: "chrome-140",
    cookieJar: jar,
});

await client.fetch("https://httpbin.org/cookies/set?token=abc123");
const res = await client.fetch("https://httpbin.org/cookies");
console.log(await res.text()); // → {"cookies":{"token":"abc123"}}

await client.close();
```

Every request sent through the same `client` carries the same browser
fingerprint and shares the cookie jar, so session cookies set by one request
are automatically attached to the next. `createClient` accepts
`FetchClientOptions`: `profile`, `cookieJar`, `redirectPolicy`, `timeoutMs`,
`idleTimeoutMs`, and (in tests) a `transportFactory`.

## 5. Handle errors

All failures are typed. Catch the specific class you want to handle; the base
`FetchError` catches the rest.

```ts
import {
    fetch,
    FetchError,
    FetchTimeoutError,
    RedirectError,
    ProtocolError,
} from "browsercore";

try {
    await fetch("https://example.com", { profile: "chrome-140" });
} catch (err) {
    if (err instanceof FetchTimeoutError) {
        console.error("timed out after %dms", err.timeoutMs);
    } else if (err instanceof RedirectError) {
        console.error("redirect loop or limit exceeded");
    } else if (err instanceof ProtocolError) {
        console.error("ALPN negotiation failed");
    } else if (err instanceof FetchError) {
        console.error("fetch failed: %s", err.message);
    } else {
        throw err;
    }
}
```

Each error carries a `kind` literal discriminator, so `switch (err.kind)`
works too.

## 6. Run it

Save the example as `demo.mjs` (or `demo.ts` if you use `tsx`):

```sh
npx tsx demo.ts
```

You should see a 200 status and the page body. The request just made was, at
the TLS and HTTP layer, byte-identical to one Chrome 140 would have produced.

## Next steps

- [Browser profiles explained](browser-profiles-explained.md) — what a
  profile is and how to pick one.
- [Cookies & sessions](cookies-and-sessions.md) — persist a session across
  process restarts with `saveJar` / `loadJar`.
- [Crawling](crawling.md) — walk a URL list with `crawl()`, a one-shot batch
  fetcher built on `createClient`.
