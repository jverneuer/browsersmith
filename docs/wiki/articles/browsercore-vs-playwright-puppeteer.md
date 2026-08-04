# browsercore vs Playwright / Puppeteer

Playwright and Puppeteer are full browser automation frameworks — they drive a
real Chromium, Firefox, or WebKit instance with a JavaScript engine, DOM,
layout, compositor, and event system. browsercore is not a browser. It is a
networking client that reproduces a browser's TLS and HTTP fingerprints at the
wire level. These tools solve different problems; the right choice depends on
what the target site requires.

## The fundamental difference

| Dimension | browsercore | Playwright / Puppeteer |
| --- | --- | --- |
| **What it is** | `fetch()` with a browser-identical network fingerprint | Remote control for a real browser process |
| **JavaScript engine** | None | Full V8 / SpiderMonkey / WebCore |
| **DOM / rendering** | None | Full layout, paint, compositor |
| **Screenshots** | No | Yes |
| **User interaction** | No | Click, type, scroll, drag, focus |
| **TLS fingerprint (JA3/JA4)** | Byte-for-byte match to a specific browser version | Whatever the bundled browser emits (real, but tied to that browser binary) |
| **HTTP/2 SETTINGS** | Profile-seeded, version-specific | Real browser defaults |
| **Header ordering** | Profile-enforced | Real browser defaults |
| **Memory per instance** | Negligible (one Node process) | ~50–200 MB per browser |
| **Startup time** | Milliseconds | Seconds (browser boot) |
| **Concurrency model** | Hundreds of concurrent requests, pooled connections | One browser per few pages; serialization overhead |
| **CI footprint** | One npm dependency, no native binaries | Browser binaries (~150 MB), system libs, GPU sandbox config |

## When browsercore wins

Use browsercore when you only need the **network request** to look like a browser
and the content you want arrives in the initial HTML. Typical cases:

- **Scraping server-rendered product listings.** A pricing page that ships its
  data in the HTML response needs no JavaScript. A single `fetch()` with the
  `chrome-140` profile returns the same HTML a browser would receive, without
  spawning Chromium.
- **Bot-detection evasion keyed on network signals.** If the detector checks
  JA3/JA4, HTTP/2 SETTINGS, or header order and nothing else, browsercore passes
  with a fraction of the resource cost. See
  [`examples/defeat-bot-detection.ts`](../../examples/defeat-bot-detection.ts).
- **CI smoke tests.** Verifying that an endpoint returns the right status code
  and headers with a browser-accurate request is a single `npm install` and a
  `fetch()` call. No browser download, no `npx playwright install`, no
  container sandbox tuning.

## When Playwright / Puppeteer wins

Use a full browser when the target site requires anything beyond network
fingerprinting:

- **Single-Page Applications.** If the HTML is an empty `<div id="root">` and the
  content is fetched and rendered client-side, browsercore returns an empty
  shell. A real browser runs the JavaScript and produces the rendered DOM.
- **JavaScript challenges.** Cloudflare Turnstile, reCAPTCHA, proof-of-work
  challenges, and any behavior computed in JS are invisible to browsercore.
- **Visual verification.** Screenshots, visual regression testing, layout
  assertions — all require a compositor.
- **Logged-in sessions you already have.** Playwright can load a saved
  `storageState` or attach to a profile with cookies, localStorage, and session
  already present from manual login.

## The honest middle ground

Headless browsers are not a silver bullet against bot detection either. A
headless instance often leaks telltales — `navigator.webdriver === true`,
missing fonts, missing WebGLRenderer strings, absent `chrome.runtime`, a
headless user-agent unless overridden. Evading those requires additional
patching (e.g. `puppeteer-extra-plugin-stealth`), which itself is an arms race.

browsercore has no JavaScript environment to leak. It cannot solve a JavaScript
challenge — but a JavaScript challenge solver cannot claim to be a lightweight
networking client. Each tool is honest about what it is.

## TL;DR

- **browsercore** = "the bytes on the wire look exactly like Chrome 140."
  No rendering, no JS, no DOM. Use it for high-throughput scraping of
  server-rendered content, network-layer bot evasion, and lightweight testing.
- **Playwright / Puppeteer** = "a real browser you can program." Use it when
  you need JavaScript execution, rendered output, user interaction, or
  screenshots.

They are complementary. A common pattern: use Playwright once to log in and
export cookies, then hand those cookies to browsercore for high-volume scraping.
