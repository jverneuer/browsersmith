/**
 * `browsersmith/core` — the runtime-free surface.
 *
 * @packageDocumentation
 *
 * This subpath entry exports ONLY the platform-neutral API: the `fetch()`
 * composition, browser profiles, and the cookie jar, plus the
 * `@browsercore/contracts` types an edge consumer needs to assemble their own
 * {@link Platform}. It deliberately contains NO Node.js platform adapters —
 * zero Node built-in imports (the release gate greps the built entry for
 * the Node built-in module prefix and requires zero hits), no lazy
 * `platform` singleton, no `crawl()` helper (the crawler resolves platform
 * bundles, so it lives in the main entry only).
 *
 * WHY this entry exists (replaceability audit 2026-11-16, remediation item
 * #7): runtimes without Node APIs (Cloudflare Workers, browsers, Deno Edge)
 * cannot use browsersmith's Node adapters at all. Such consumers compose
 * their own Platform from runtime-native adapters and pass it to the
 * `@browsercore/*` protocol packages directly. For Workers specifically the
 * recipe is `@browsercore/fetch` + `@browsercore/platform-workers` — install
 * those two packages side by side (this entry does NOT re-export
 * platform-workers; cross-referenced, not bundled, so the Node adapters never
 * enter an edge bundle graph).
 *
 * Node consumers should use the main `browsersmith` entry — it additionally
 * provides the composed default platform, the Node adapters, and `crawl()`.
 */

// The headline API: a fetch() that composes TLS + profile + HTTP/1.1|HTTP/2.
export { fetch, createClient } from "@browsercore/fetch";
export type { FetchClient, FetchClientOptions } from "@browsercore/fetch";
export {
    FetchError,
    FetchProxyError,
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
export { getProfile, listProfiles, registerProfile } from "@browsercore/profiles";
export type {
    BrowserProfile,
    ProfileId,
    ProfileName,
    TlsProfile,
    Http1Profile,
    Http2Profile,
} from "@browsercore/profiles";

// Cookie jar — persists cookies across requests (session continuity).
export { createCookieJar, serializeJar, deserializeJar } from "@browsercore/cookies";
export type { CookieJar, CookieUrl, Cookie } from "@browsercore/cookies";

// The recommended starter profile ids (pure data).
export { PROFILES } from "./profiles.js";

// The contracts surface an edge consumer composes against — types only,
// zero runtime. Implement these with runtime-native adapters and thread the
// resulting Platform through the @browsercore/* protocol packages' options.
export type {
    Platform,
    PlatformOptions,
    Net,
    Socket,
    ConnectOptions,
    DnsResolver,
    IPAddress,
    Network,
    Crypto,
    Compression,
    UdpSocketFactory,
    DatagramTransport,
    DatagramCloseReason,
    UdpAddress,
    CryptoProvider,
    EventProvider,
    Telemetry,
    Time,
    Clock,
    TimerHandle,
} from "@browsercore/contracts";
