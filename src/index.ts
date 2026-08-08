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

// HTTP/3 over QUIC — QUIC transport + HTTP/3 framing + QPACK. Composes the
// same fetch() seam as HTTP/1.1 and HTTP/2; not yet wired into the default
// ALPN dispatch in @browsercore/fetch (opt-in via createHttp3Connection).
export { connectHttp3, Http3ConnectionImpl } from "@browsercore/http3";
export type {
    Http3Connection,
    Http3Options,
    Http3Request,
    Http3Response,
} from "@browsercore/http3";
export {
    FrameParseError as Http3FrameParseError,
    GoawayReceivedError,
    Http3Error,
    PushCancelledError,
    QpackDecodeError,
    SettingsAckTimeoutError,
    SettingsViolationError,
} from "@browsercore/http3";
export type {
    HeaderField as Http3HeaderField,
    HeaderBlock as Http3HeaderBlock,
    Http3SettingsMap,
    Http3StreamTypeValue,
    Http3FrameTypeValue,
} from "@browsercore/http3";

// QUIC transport — RFC 9000 packet headers, frames, packet protection,
// streams, and connection lifecycle over a datagram (UDP) transport. The
// transport layer HTTP/3 runs on.
export { connectQuic, QuicConnectionImpl } from "@browsercore/quic";
export type {
    QuicConnection,
    QuicOptions,
    QuicStream,
    QuicTransportParameters,
    DatagramTransport,
    DatagramCloseReason,
    ConnectionId,
    StreamId,
    StreamState,
    StreamCloseReason,
    UdpAddress,
} from "@browsercore/quic";
export {
    ConnectionClosedError,
    FlowControlError,
    FrameParseError as QuicFrameParseError,
    HandshakeTimeoutError,
    PacketParseError,
    QuicError,
    ResetStreamError,
    StopSendingError,
    TransportParameterError,
} from "@browsercore/quic";

// Convenience: the recommended starter profile ids.
export { PROFILES } from "./profiles.js";
export { crawl, type CrawlOptions, type CrawlResult } from "./crawl.js";

// Platform composition root — the single seam for all runtime dependencies.
// browsersmith is the ONLY package allowed node:* imports. The Platform is
// built once in wiring.ts and threaded down through options objects.
export { platform, createPlatform } from "./wiring.js";
export type { Platform, PlatformOptions } from "./platform/index.js";

// Platform adapters — Node.js implementations of the platform contracts.
// These are the only files in the stack that import node:net / node:dns /
// node:dgram / node:crypto / node:zlib / node:events. Consumers on other
// runtimes (Bun, Deno, ...) provide their own adapters via createPlatform().
export { nodeNet, nodeDns, nodeUdp } from "./platform/network/node/index.js";
export { nodeCryptoProvider } from "./platform/crypto/node/index.js";
export { nodeCompression } from "./platform/compression/node/index.js";
export { nodeEventProvider } from "./platform/events/node/index.js";
export { noOpTelemetry } from "./platform/telemetry/noop/index.js";
export { nodeTime } from "./platform/time/node/index.js";

// Re-export contracts so consumers can pull interfaces from one place.
export type { Net, Socket, DnsResolver, ConnectOptions, IPAddress } from "@browsercore/contracts";
export type { EventProvider } from "./platform/events/node/index.js";
export type { Telemetry } from "./platform/telemetry/noop/index.js";
export type { Time } from "./platform/time/node/index.js";
