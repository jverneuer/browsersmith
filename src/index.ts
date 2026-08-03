/**
 * browsercore — customer-facing entrypoint.
 *
 * One install composes the entire browsercore networking and impersonation
 * stack: browser-identical TLS + HTTP/2 fingerprints, cookie jar, redirect
 * handling, and content negotiation behind a single `fetch()` call.
 *
 * Most consumers only need {@link fetch} and {@link createClient}; pass a
 * browser profile (`"chrome-140"`, `"firefox-128"`, …) and the stack reproduces
 * the wire fingerprint a real browser would emit. See `examples/` for crawling,
 * crawler-detection defeat, and protocol selection.
 *
 * @packageDocumentation
 */

// The headline API: a fetch() that composes TLS + profile + HTTP/1.1|HTTP/2.
export { fetch, createClient } from "@browsercore/fetch";
export type {
    FetchClient,
    FetchClientOptions,
} from "@browsercore/fetch";

export {
    FetchError,
    FetchTimeoutError,
    ProtocolError,
    RedirectError,
} from "@browsercore/fetch";

export type {
    FetchMethod,
    FetchOptions,
    FetchRequestId,
    FetchResponse,
    ParsedUrl,
    RedirectPolicy,
} from "@browsercore/fetch";

// Browser profiles — pick a real browser's TLS/HTTP fingerprint.
export {
    getProfile,
    listProfiles,
    registerProfile,
} from "@browsercore/profiles";
export type {
    BrowserProfile,
    ProfileId,
    ProfileName,
    TlsProfile,
    Http1Profile,
    Http2Profile,
} from "@browsercore/profiles";

// Cookie jar — persists cookies across requests (session continuity).
export { createCookieJar, saveJar, loadJar } from "@browsercore/cookies";
export type { CookieJar, CookieUrl, Cookie } from "@browsercore/cookies";

// Convenience: the recommended starter profile ids.
export { PROFILES } from "./profiles.js";
export { crawl, type CrawlOptions, type CrawlResult } from "./crawl.js";
