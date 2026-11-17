# Crawlee integration

browsersmith ships a first-class Crawlee HTTP client: [`@browsercore/crawlee`](https://www.npmjs.com/package/@browsercore/crawlee). One `httpClient` option and every crawler request completes a real TLS handshake with a browser-identical ClientHello (JA3/JA4), HTTP/2 SETTINGS frame, and header order — with HTTP CONNECT / SOCKS5 proxy support and zero native dependencies. Crawlee keeps what it is good at (queues, retries, sessions, autoscaling concurrency); browsersmith owns the wire.

## Install

```bash
npm install @browsercore/crawlee
npm install crawlee        # peer: @crawlee/http-client >= 4.0.0-rc.0
```

`@browsercore/crawlee` depends on browsersmith ^0.0.17 — the fixed stack whose fidelity fixes this integration is built on: native multi-`Set-Cookie` fidelity (`getSetCookie()` from both protocol layers), pooled HEAD/204/304 that no longer closes keep-alive connections, and wire-correct Safari 17/18 profiles.

## Quick start — CheerioCrawler

```ts
import { CheerioCrawler } from "crawlee";
import { BrowsersmithHttpClient } from "@browsercore/crawlee";

const crawler = new CheerioCrawler({
    httpClient: new BrowsersmithHttpClient(),
    async requestHandler({ $, request }) {
        console.log(request.url, "→", $("title").text());
    },
});

await crawler.run(["https://books.toscrape.com/"]);
```

Every request now dials with the `chrome-140` fingerprint — pass Bot Check, a JA3 collector, or `tls.peet.ws` and the connection reads as Chrome on the wire. Any crawler built on `@crawlee/http-client` accepts the same option (`HttpCrawler`, `BasicCrawler`, …).

## Proxy rotation

Crawlee's `ProxyConfiguration` / `proxyUrls` work as-is: each session's proxy URL reaches the client and is dialed through browsersmith's own HTTP CONNECT / SOCKS5 tunnel — no `https-proxy-agent`, no native modules.

```ts
import { CheerioCrawler } from "crawlee";
import { BrowsersmithHttpClient } from "@browsercore/crawlee";

const crawler = new CheerioCrawler({
    httpClient: new BrowsersmithHttpClient(),
    proxyUrls: [
        "socks5://user:pass@proxy1.example.com:1080",
        "socks5h://proxy2.example.com:1080", // remote DNS — proxy resolves the target
        "http://user:pass@proxy3.example.com:8080",
    ],
    // Each session keeps its own exit IP AND its own TLS fingerprint for the
    // life of the session — identity and wire look stay coherent.
    maxConcurrency: 10,
    async requestHandler({ $ }) { /* ... */ },
});
```

Accepted schemes: `http` (CONNECT), `socks5` (client-side DNS), `socks5h` (proxy-side DNS). An `https://` proxy scheme is rejected with a typed `ProxyConfigError` naming the scheme — TLS-to-the-proxy is not modeled by the underlying stack.

## Profile selection

```ts
import { BrowsersmithHttpClient } from "@browsercore/crawlee";

// Pin one profile for every request (wins over session fingerprints):
new BrowsersmithHttpClient({ profile: "firefox-128" });

// Or follow each session's fingerprint (the default, "auto"):
//   fingerprint.browser "firefox" → firefox-128
//   fingerprint.browser "safari"  → safari-18
//   "chrome" / "edge" / no fingerprint → chrome-140
new BrowsersmithHttpClient({ profile: "auto" });
```

Any profile id in the browsersmith registry is accepted (`safari-18`, `edge-128`, … — see [profiles.md](./profiles.md)) and validated at construction with the registry's own typed error. This mirrors `ImpitHttpClient`'s override precedence: an explicit profile wins over the session, and Chromium-based families collapse onto Chrome.

## How the cookie path works

Crawlee's `BaseHttpClient` applies the session jar to the request's `cookie` header before the request reaches the client, and the header is forwarded verbatim. On the response side, browsersmith's `getSetCookie()` exposes every wire `Set-Cookie` value — multiple cookies are never collapsed (the 0.0.17 stack fix) — so `BaseHttpClient` harvests all of them into the session jar with full fidelity. The client-level jar handed to browsersmith internally is an `InertCookieJar`: browsersmith's own cookie engine stays out of the cookie path so it cannot overwrite the header Crawlee's session applied.

`ignoreTlsErrors` is rejected with a typed `IgnoreTlsErrorsUnsupportedError` rather than silently downgrading security — browsersmith performs real certificate-validating handshakes, and a request that skips verification would not produce a fingerprint worth impersonating. The full option-mapping table lives in the [@browsercore/crawlee README](https://github.com/jverneuer/browsercore-crawlee#readme).

## The verification gate

Three layers prove the two properties this integration exists for — *behaves like crawlee's stock HTTP clients* and *the wire fingerprint stays browser-identical* — and the first two are wired into the package's CI as merge gates:

1. **Conformance (offline, in CI)** — local `node:http` fixtures drive a real `CheerioCrawler` through `BrowsersmithHttpClient`, and every scenario has a **twin test running crawlee's stock `FetchHttpClient` (undici) against the same fixture**. A scenario passes when both clients produce the same observable behavior (status, body, redirect chain, cookie-jar contents) — that equivalence is the evidence. The matrix mirrors crawlee's own `BaseHttpClient` contract tests (Apache-2.0; scenario origins cited per file) and covers redirect semantics (301/302/303/307/308 incl. 303 POST→GET), cross-origin credential stripping, cookie interop in both directions, timeouts + AbortSignal, keep-alive reuse, gzip/br, HEAD, connection-refused retry classification, and proxy-URL mapping.
2. **Fingerprint parity (offline in CI + a one-request live gate in CI)** — the offline suite captures the real ClientHello and asserts it hashes to the exact real-Chrome golden **JA4 `t13d1516h2_8daaf6152771_d8a2da3f94cd`** (real Chrome 146 capture, 2026-10-31 — the same pin browsersmith's own suite holds), and asserts the Akamai HTTP/2 golden **`1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p`** piece by piece: SETTINGS bytes and order, WINDOW_UPDATE 15663105, HEADERS flags and priority block, pseudo-header order, no `host` field. The live CI gate then makes one request to the `tls.peet.ws` fingerprint oracle and asserts it reports exactly those goldens — no prefix matching, no tail drift. A drift means the wire is no longer browser-identical and blocks the merge.
3. **Blocking canary (manual, not in CI)** — a side-by-side comparison artifact: one request through Node's stock client and one through `BrowsersmithHttpClient` to the same oracle, printing both observed fingerprints. The browsersmith column must show the goldens; the undici column documents the stock-runtime fingerprint — that contrast is the point.

## When to use what

- **Crawlee + `@browsercore/crawlee`** — you want queues, retries, sessions, proxy rotation, and autoscaling concurrency, with the wire fingerprint handled underneath. Start here for scraping projects; see [scraping.md](./scraping.md) for the wider scraping playbook.
- **browsersmith directly** (`fetch` / `createClient` / `crawl`) — a script, a lambda, or a service that just needs requests that don't get 403'd, without a crawler framework. See [getting-started.md](./getting-started.md).
