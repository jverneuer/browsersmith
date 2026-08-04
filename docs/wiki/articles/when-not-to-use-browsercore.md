# When NOT to Use browsercore

browsercore is a networking client, not a browser. It has no JavaScript
engine, no DOM, no rendering, and no user-facing UI. Those are intentional
design choices — they are what make it fast, lightweight, and free of the
telltales that headless browsers leak. But they also mean there are scenarios
where browsercore is the wrong tool.

This page is the honest counterpart to
[When to Use browsercore](when-to-use-browsercore.md). If your use case appears
below, browsercore alone will not solve it.

---

## Single-Page Applications (SPAs)

browsercore cannot render JavaScript. Many modern sites ship an empty HTML
shell — `<div id="root"></div>` — and fetch data and markup client-side via
`fetch()` or XHR inside a bundled JS application. browsercore receives the
shell and has no way to execute the code that populates it. The content you
want simply never arrives.

**What to use instead:** Playwright, Puppeteer, or any headless browser with a
JS engine.

## JavaScript challenges

Sites that challenge visitors with Cloudflare Turnstile, reCAPTCHA,
proof-of-work puzzles, or any behavior computed in JavaScript require a JS
runtime to solve. browsercore has none. It can pass a network fingerprint
check; it cannot pass a computation check.

**What to use instead:** A real browser, or a dedicated CAPTCHA-solving service
in front of browsercore (though most challenge the network fingerprint *and*
the computation, so browsercore alone rarely helps here).

## Screenshots and visual regression testing

browsercore does not render. It has no compositor, no layout engine, no pixel
output. If your test asserts what a page *looks like*, browsercore cannot help.

**What to use instead:** Playwright, Puppeteer, or a screenshot service.

## User interaction (click, type, scroll, drag)

browsercore is a request / response client. It sends HTTP requests and returns
responses. There is no event system, no element tree, no concept of "click this
button" or "scroll to the next page." Infinite scroll, lazy-loaded content
behind a "load more" button, and multi-step wizards are out of scope.

**What to use instead:** Playwright, Puppeteer, or similar browser automation.

## Authenticated sessions behind a login wall (no pre-existing cookies)

browsercore can persist and replay cookies via its jar — but it cannot acquire
them from a JavaScript login flow. If logging in requires evaluating JS to
compute a CSRF token, solving a challenge, or submitting a form that depends
on client-side logic, browsercore cannot complete the authentication.

This is a key distinction: browsercore *replays* sessions, it does not *create*
them from a login page. If you already have cookies (exported from a real
browser, obtained via an API token endpoint, or handed off from a headless
browser's `storageState`), browsercore carries them forward. If you do not, it
cannot get them.

**What to use instead:** Use Playwright / Puppeteer (or BrowserKit) to log in
once, export the cookies into browsercore's jar via `createCookieJar` /
`setCookie` / `loadJar`, then hand off to browsercore for the high-volume work.

## WebGL / Canvas / WebAudio fingerprinting

Some advanced bot detectors probe the client's WebGL renderer string, Canvas
fingerprint, or WebAudio stack. browsercore does not implement any of these —
it has no GPU stack, no audio stack, no canvas. A detector that expects a
response to those probes will see silence, which itself is a signal of a
non-browser client.

**What to use instead:** A real browser that renders and responds to these
probes naturally.

## Extension-mode access to your real browser sessions

BrowserKit's extension mode (Playwriter) attaches to your running Chrome
profile — the one with your logged-in LinkedIn, your Gmail, your internal
tools. browsercore cannot attach to or drive your existing browser. It manages
its own cookie jar from scratch.

**What to use instead:** BrowserKit, or Playwright with a persistent context.

## MCP server for AI agents

browsercore is a library. It does not expose an MCP server, does not register
tools, and does not speak the Model Context Protocol. If you are building an
AI-agent-facing tool server, browsercore is not it.

**What to use instead:** BrowserKit, or build your own MCP server on top of
browsercore's `fetch` / `createClient` primitives.

## HTTP/3

`@browsercore/http3` and `@browsercore/quic` exist as packages but are **not
wired into the entrypoint**. ALPN dispatch currently branches to HTTP/2 or
HTTP/1.1 only (see `fetch/src/dispatch.ts`, `establishConnection`). If your
target requires HTTP/3 (QUIC), browsercore cannot negotiate it today.

**What to use instead:** A client with working HTTP/3 support.

## Cookie acquisition is manual

Related to the login-wall limitation above: browsercore's cookie jar is a
precise, RFC 6265-compliant store, but it is populated manually. There is no
built-in flow for "log in via this form and capture the resulting session."
You must obtain cookies elsewhere and load them in.

**Workaround:** Log in with a real browser, export the cookies, and load them
with `loadJar`. browsercore then replays them faithfully.

## TLS 1.2-only targets

The TLS layer rejects TLS 1.2-only handshakes up front with a typed error
rather than falling back silently. If your target only accepts TLS 1.2 and
you cannot get it to negotiate TLS 1.3, browsercore will not connect.

## Node >= 26 only, ESM only

browsercore requires Node >= 26 and is ESM-only (`"type": "module"`). There is
no browser build, no Deno support documented. The default backends depend on
Node built-ins (`node:net`, `node:crypto`, `node:zlib`) behind provider
interfaces — the interfaces are swappable, but the shipped implementations are
Node-only. If you run in a non-Node runtime, browsercore is not an option.

---

## The rule of thumb

If the thing you need requires **rendering, JavaScript, pixels, or a human at
the keyboard**, browsercore cannot do it. That is not a flaw — it is the
trade-off that lets browsercore run a hundred concurrent requests in a single
Node process with no browser binary. Use the right tool for the job, and reach
for browsercore when the job is "make an HTTP request that looks exactly like
Chrome 140."
