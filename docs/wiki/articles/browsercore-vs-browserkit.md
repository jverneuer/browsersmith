# browsercore vs BrowserKit

BrowserKit ([`browserkit-dev/browserkit`](https://github.com/browserkit-dev/browserkit))
is an open-source framework for building site-specific MCP servers that operate
over **real, authenticated user browser sessions** running locally on your
machine. browsercore is a wire-level HTTP client with browser-identical
fingerprints. They are built for different audiences solving different problems.

## One sentence each

- **browsercore** makes HTTP requests whose TLS ClientHello, HTTP/2 SETTINGS,
  and header order are byte-for-byte identical to a specific browser version.
- **BrowserKit** lets AI agents (Cursor, Claude Desktop, custom clients)
  interact with your already-logged-in browser sessions through structured MCP
  tools.

## Head-to-head

| Dimension | browsercore | BrowserKit |
| --- | --- | --- |
| **What it is** | Browser-identical HTTP client library | MCP server framework over authenticated browser sessions |
| **Core value** | Pass bot detection via TLS / HTTP fingerprinting | Reuse your real logged-in sessions for AI agents |
| **JavaScript** | None | Full (real browser underneath) |
| **DOM / rendering** | None | Full |
| **Auth model** | Programmatic cookie jar (`createCookieJar`, `saveJar`/`loadJar`) | Your real browser sessions — headless Patchright by default, real Chrome via "extension mode" (Playwriter) |
| **Protocol signals** | Byte-for-byte match to a chosen profile (chrome-140, firefox-128, …) | Whatever the real browser emits (because it *is* a real browser) |
| **Memory footprint** | One Node process, no browser | Full Chromium/Chrome instance per adapter |
| **Startup time** | Milliseconds | Seconds per browser boot |
| **Throughput** | High — pooled connections, hundreds of concurrent requests | Low — one browser per adapter, requests serialized |
| **Primary consumer** | Crawler / scraper / automation author | AI agent (Cursor, Claude Desktop, custom MCP client) |
| **MCP server** | No | Yes — each adapter runs as a dedicated HTTP MCP server on its own port |
| **Screenshots** | No | Yes |
| **User interaction** | No | Yes — watch/pause modes, human-in-the-loop for login and 2FA |
| **Extension-mode access to your real Chrome** | No | Yes |

## What BrowserKit does that browsercore cannot

BrowserKit's reason to exist is **access to your authenticated sessions**. Its
extension mode (Playwriter) attaches to your real Chrome profile — the one with
your logged-in LinkedIn, your Gmail, your company's internal tools. An AI agent
can then drive those sessions through structured tools like `get_person_profile`
or `search_people`.

browsercore cannot do this. It manages its own cookie jar from scratch. It has no
way to attach to your running Chrome, no way to evaluate JavaScript to complete a
login flow, and no way to handle a 2FA prompt. If your use case starts with "I
want the AI to act as me on a site I'm already logged into," BrowserKit is the
right tool.

## What browsercore does that BrowserKit cannot

browsercore's reason to exist is **high-throughput, browser-identical requests
without a browser**. A single Node process running browsercore can sustain
hundreds of concurrent requests against a target, with connection pooling,
cookie persistence, and polite concurrency controls via `crawl()`. BrowserKit
spins up one browser per adapter and serializes requests through it — it is not
built for throughput.

browsercore also gives you **deterministic protocol control**. You pick a
profile (`"chrome-140"`, `"firefox-128"`) and the TLS ClientHello, ALPN,
HTTP/2 SETTINGS, and header ordering match that browser byte-for-byte, verified
against golden captures in `testing/captures/`. BrowserKit delegates all of that
to whatever browser binary it drives — you get real signals, but not
version-pinned, testable ones.

## When to pick which

**Pick browsercore when:**
- You are scraping or crawling server-rendered content at scale.
- You need to pass bot detection that keys on JA3/JA4, HTTP/2 SETTINGS, or
  header order.
- You want a lightweight, dependency-minimal HTTP client for CI or automation.
- You can obtain cookies programmatically (API token, exported jar) and do not
  need a real browser to acquire them.

**Pick BrowserKit when:**
- You are building an MCP server for an AI agent.
- The agent needs to act within *your* authenticated sessions (LinkedIn, Gmail,
  internal tools).
- The target site requires JavaScript, DOM interaction, or human-in-the-loop
  login / 2FA / CAPTCHA.
- You need screenshots or visual state from a real browser.

## Can they be used together

They can, in sequence. A practical pattern:

1. Use BrowserKit (or a manual login in a real browser) to authenticate and
   obtain session cookies.
2. Export those cookies into browsercore's jar (`createCookieJar`, then
   `setCookie` for each, or `loadJar` from a serialized snapshot).
3. Use browsercore to run high-volume, browser-identical requests against the
   same site — the cookie jar carries the authenticated state, and the network
   fingerprint carries the browser identity.

This splits the problem cleanly: BrowserKit handles the human-in-the-loop
authentication that browsercore cannot do, and browsercore handles the
high-throughput work that BrowserKit is not built for.
