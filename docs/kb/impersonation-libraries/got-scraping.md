# got-scraping (apify/got-scraping)

**Repository:** https://github.com/apify/got-scraping
**Language:** Node.js
**License:** MIT
**Stars:** ~700

## Overview

got-scraping is a **higher-level scraping library** that extends `got` (a popular Node.js HTTP client) with browser-like defaults for web scraping. It generates browser-like headers and considers TLS/JA3 considerations when paired with `header-generator`. It sits at a higher abstraction level than CycleTLS or browsercore — it doesn't provide raw TLS control but focuses on the headers, cookies, and behavioral signals that matter for scraping anti-bot systems.

## Architecture

```
User code
  ↓
got-scraping — extends got with browser-like defaults
  ↓
got — Node.js HTTP client (HTTP/1.1 + HTTP/2)
  ↓
node:tls — Node.js built-in TLS (no ClientHello control)
  ↓
node:net — Node.js networking
  ↓
OS TCP/IP stack
```

got-scraping does **not** provide TLS fingerprint control. For TLS fingerprinting, it must be paired with a separate TLS library (e.g., CycleTLS or browsercore).

## Browser Coverage

| Browser | Support |
|---------|---------|
| Chrome | Latest version (via header-generator) |
| Firefox | Latest version |
| Safari | Latest version |
| Mobile browsers | iOS Safari, Android Chrome |

Browser profiles are accessed via `header-generator` and applied to requests as header sets.

## API Surface

```js
const gotScraping = require("got-scraping");

// Simple GET
const { body } = await gotScraping.get("https://example.com");

// POST with JSON
const { body } = await got-scraping.post("https://example.com", {
  json: { key: "value" },
});

// Browser-like defaults
const { body } = await gotScraping.get("https://example.com", {
  headerGeneratorOptions: {
    browsers: [{ name: "firefox", minVersion: 117 }],
    devices: ["desktop"],
    operatingSystems: ["windows"],
  },
});

// Cookie handling
const { body } = await gotScraping.get("https://example.com", {
  cookieJar: new toughCookie.CookieJar(),
});

// Proxy support
const { body } = await gotScraping.get("https://example.com", {
  proxyUrl: "http://proxy:8080",
});
```

### With header-generator

```js
const { headerGenerator } = require("header-generator");

// Generate browser-like headers
const headers = headerGenerator({
  browsers: [
    { name: "chrome", minVersion: 120, maxVersion: 124 },
    { name: "firefox", minVersion: 117 },
  ],
  devices: ["desktop", "mobile"],
  operatingSystems: ["windows", "macos", "linux", "android", "ios"],
  locales: ["en-US", "en-GB"],
});

// Use with got-scraping
const { body } = await gotScraping.get("https://example.com", { headers });
```

## Fingerprint Signals Controlled

### HTTP Headers
- User-Agent (per browser/version/device)
- Accept (per browser)
- Accept-Language (per locale)
- Accept-Encoding (per browser)
- Sec-Fetch-* headers (per browser)
- Sec-Ch-UA-* headers (per browser)
- Upgrade-Insecure-Requests
- Connection header ordering
- DNT, TE, etc.

### Behavioral
- Cookie jar integration
- Redirect handling
- Retry logic
- Rate limiting
- Session persistence

### TLS (via separate library)
got-scraping does **not** control TLS fingerprints. For TLS fingerprinting:
- Pair with CycleTLS for raw TLS control
- Or use browsercore's TLS engine with got-scraping's header generation

## Unique Features

### 1. header-generator Integration

got-scraping's primary integration point is `header-generator`, a library that generates **realistic browser header sets** based on:
- Browser name and version range
- Device type (desktop/mobile)
- Operating system
- Locale

The generated headers include all the `Sec-Fetch-*`, `Sec-Ch-UA-*`, and other security headers that modern browsers send, with the correct values for each browser/version/device combination.

### 2. Behavioral Fingerprinting

Beyond headers, got-scraping considers **behavioral signals**:
- Cookie handling (persistent cookie jar)
- Redirect following behavior
- Retry patterns
- Rate limiting awareness

These behavioral signals are increasingly important as anti-bot systems move beyond static fingerprints to analyze request patterns.

### 3. Proxy Support

got-scraping has built-in proxy support with proxy rotation, session binding (keeping the same proxy for a session), and proxy error handling.

### 4. Higher-Level Abstraction

Unlike CycleTLS or browsercore, got-scraping operates at the HTTP layer. It doesn't provide raw TLS control — it focuses on the headers and behaviors that matter for scraping anti-bot systems. This makes it easier to use but less powerful for sites that do deep TLS fingerprinting.

## What browsercore Can Learn

- **header-generator as a separate concern** — got-scraping's separation of header generation (`header-generator`) from HTTP transport (`got`) is a clean architecture. browsercore's `@browsercore/profiles` package follows a similar pattern (profile data is separate from protocol logic), but the explicit `headerGeneratorOptions` API makes it easy to configure per-request.
- **Behavioral fingerprinting** — got-scraping's focus on behavioral signals (cookie handling, redirect following, retry patterns) is a reminder that fingerprinting extends beyond wire-level signals. browsercore's `crawl()` helper already handles cookies and redirects, but more behavioral signals (request timing, mouse movements) could be added.
- **The higher-level approach** — got-scraping is designed for ease of use, not maximum fingerprint fidelity. browsercore occupies the opposite end of the spectrum (maximum fidelity, more configuration). There's a middle ground that combines browsercore's TLS fidelity with got-scraping's ease of use.
- **Integration with separate TLS libraries** — got-scraping's pattern of being paired with a separate TLS library (CycleTLS) suggests that browsercore could be used as the TLS engine behind a higher-level scraping API.

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point — exports `gotScraping` |
| `src/index.ts` | `gotScraping` — extends `got` with browser-like defaults |
| `src/agent.ts` | HTTP agent with browser-like settings |
| `src/context.ts` | Request context (headers, cookies, options) |
| `src/hooks.ts` | got hooks for header generation, proxy, retries |
| `src/response.ts` | Response processing |
| `header-generator/src/index.ts` | `headerGenerator` — generates browser-like headers |
| `header-generator/src/data/` | Browser header data per version/device/os |
| `header-generator/src/browser-headers.ts` | Header generation logic per browser |

## References

- [GitHub](https://github.com/apify/got-scraping)
- [npm](https://www.npmjs.com/package/got-scraping)
- [header-generator](https://github.com/apify/header-generator) — separate header generation library
- [got](https://github.com/sindresorhus/got) — underlying HTTP client
- [apify docs](https://docs.apify.com/sdk-js/docs/guides/got-scraping)
- [Header generation](https://github.com/apify/got-scraping/blob/master/src/index.ts)
- [Browser header data](https://github.com/apify/header-generator/tree/master/src/data)
