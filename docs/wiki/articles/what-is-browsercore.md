# What is browsercore?

**browsercore** (published on npm as `browsersmith`) is a TypeScript HTTP
client that makes network requests look *exactly* like Chrome or Firefox —
at the byte level. It composes a full networking stack (TLS, HTTP/2,
HTTP/1.1, cookies, compression) behind a single `fetch()` call whose wire
footprint matches a real browser so closely that bot-detection services let
the request through.

It is **not** a browser. There is no JavaScript engine, no DOM, no rendering,
no screenshots, no way to click or scroll. browsercore operates strictly at
the protocol layer: it sends bytes that are indistinguishable from what a
real browser would send on the wire.

## Why this matters

Bot-detection services (Cloudflare, Datadome, Akamai, PerimeterX,
fingerprint.com) do not guess whether you are a browser. They *measure* three
concrete signals:

1. **The TLS ClientHello** — the cipher suites, extensions, supported
   versions, key-share groups, signature algorithms, and their exact order.
   This structure is hashed into a JA3 or JA4 fingerprint.
2. **The HTTP/2 SETTINGS frame** — the first frame after the connection
   preface advertises window sizes, frame limits, and table sizes as a single
   tuple that is unique to each browser version.
3. **The HTTP/1.1 header order** — the sequence in which `User-Agent`,
   `Accept`, `Accept-Language`, and friends appear.

A typical Node HTTP client announces itself at every one of those layers: its
cipher order is wrong, its HTTP/2 SETTINGS are wrong, its header order is
wrong. The detector hashes those bytes and returns 403. browsercore reproduces
the correct bytes for a specific browser version, so the hash matches and the
request succeeds.

## What browsercore is not

The protocol-layer match is enough when the target serves server-rendered
HTML and detects bots by network fingerprint alone. It is *not* enough when
the site relies on JavaScript. browsercore has no JavaScript engine, no DOM,
no rendering pipeline, and no compositor. Single-Page Applications, JavaScript
challenges (Cloudflare Turnstile, reCAPTCHA, proof-of-work), screenshots, and
user interaction are all out of scope. For those, attach a real browser or a
tool like [BrowserKit](https://github.com/browserkit-dev/browserkit); for
server-rendered content behind a network-layer detector, browsercore is
lighter, faster, and ironically harder to flag because it has no JS
environment to leak telltales (`navigator.webdriver`, missing WebGL).

## The package

| Detail | Value |
| --- | --- |
| npm name | `browsersmith` |
| Package name | `browsercore` |
| Language | TypeScript, ESM only |
| Runtime | Node >= 26 |
| License | MIT |

Install it with `npm install browsercore`. There are no peer dependencies to
wire up, no workspace links, no native builds: the `@browsercore/*`
sub-packages it composes are published to npm and pulled in as ordinary
dependencies. The full composition spans `@browsercore/tls`,
`@browsercore/http2`, `@browsercore/http1`, `@browsercore/profiles`,
`@browsercore/cookies`, `@browsercore/crypto`, `@browsercore/compression`,
and `@browsercore/transport`, and the entrypoint re-exports the entire
customer-facing API.

## Try it

```ts
import { fetch } from "browsercore";

// Indistinguishable from Chrome 140 at the TLS + HTTP layer.
const res = await fetch("https://example.com", { profile: "chrome-140" });
console.log(res.status, await res.text());
```

One `fetch()` call is the whole pitch. Everything else — connection pooling,
cookie persistence, crawling, redirect policies — builds on that foundation.

## Where to go next

- [Quickstart](quickstart.md) — make your first request in five minutes.
- [When to use browsercore vs a real browser](when-to-use-browsercore-vs-a-real-browser.md) — the two-minute rule for choosing this over a full browser.
- [Honest limitations](honest-limitations.md) — what browsercore cannot do, plainly stated.
