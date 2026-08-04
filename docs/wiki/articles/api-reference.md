# API Reference

Concise listing of the browsercore public surface. All exports come from the
`browsercore` entrypoint (npm: `browsersmith`). Types are re-exported from the
underlying `@browsercore/*` packages.

## Top-level functions

```ts
/** One-shot convenience fetch — creates a default client, issues the request, closes. */
function fetch(input: string, options?: FetchOptions): Promise<FetchResponse>;

/** Build a reusable FetchClient with connection pooling + defaults. */
function createClient(options?: FetchClientOptions): FetchClient;

/** Batch URL fetcher with shared client + cookie jar + concurrency control. */
function crawl(urls: readonly string[], options?: CrawlOptions): Promise<CrawlResult[]>;
```

## Client

```ts
interface FetchClient {
    readonly id: FetchRequestId;
    fetch(input: string, options?: FetchOptions): Promise<FetchResponse>;
    close(): Promise<void>;
}

interface FetchClientOptions {
    readonly cookieJar?: CookieJar;
    readonly profile?: ProfileId;           // e.g. "chrome-140"
    readonly redirectPolicy?: RedirectPolicy;
    readonly timeoutMs?: number;            // default 30_000
    readonly idleTimeoutMs?: number;        // default 30_000
    readonly transportFactory?: (host: string, port: number) => Promise<Transport> | Transport;  // test seam
}
```

## Per-request options

```ts
interface FetchOptions {
    readonly method?: FetchMethod;                    // "GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD"|"OPTIONS"
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: Uint8Array | string;
    readonly profile?: ProfileId;
    readonly followRedirects?: boolean;
    readonly maxRedirects?: number;                   // default 20
    readonly timeoutMs?: number;                      // default 30_000
    readonly cookieJar?: CookieJar;
    readonly signal?: AbortSignal;
    readonly priority?: number;                       // HTTP/2 stream priority hint
}
```

## Response

```ts
interface FetchResponse {
    readonly url: string;          // final URL after redirects
    readonly status: number;
    readonly statusText: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly bodyUsed: boolean;
    body(): Promise<Uint8Array>;
    json(): Promise<unknown>;
    text(): Promise<string>;
    clone(): FetchResponse;        // clone so body can be consumed independently
}
```

## Redirect policy

```ts
type RedirectPolicy =
    | { readonly kind: "follow"; readonly maxRedirects: number }
    | { readonly kind: "manual" }
    | { readonly kind: "error" };
```

## Crawl

```ts
interface CrawlOptions {
    readonly profile?: ProfileId;          // default chrome-140
    readonly cookieJar?: CookieJar;
    readonly fetchOptions?: FetchOptions;
    readonly delayMs?: number;             // default 0
    readonly concurrency?: number;         // default 1 (serial)
    readonly timeoutMs?: number;           // default 30_000
}

interface CrawlResult {
    readonly url: string;
    readonly ok: boolean;
    readonly status?: number;
    readonly response?: FetchResponse;
    readonly error?: string;
}
```

## Browser profiles

```ts
const CHROME_140: ProfileId;    // "chrome-140" — headline Chrome
const FIREFOX_128: ProfileId;   // "firefox-128" — Firefox
const PROFILES: { "chrome-140": ProfileId; "firefox-128": ProfileId };

function getProfile(id: ProfileId): BrowserProfile;   // throws UnknownProfileError
function listProfiles(): ReadonlyArray<ProfileId>;    // insertion order
function registerProfile(profile: BrowserProfile): void;

type ProfileId = string & { __brand: "ProfileId" };
type ProfileName = "chrome" | "firefox" | "safari" | "edge";

interface BrowserProfile {
    readonly id: ProfileId;
    readonly name: string;
    readonly version: string;
    readonly tls: TlsProfile;
    readonly http2: Http2Profile;
    readonly http1: Http1Profile;
}
```

## Cookie jar

```ts
function createCookieJar(options?: CookieJarOptions): CookieJar;
function saveJar(jar: CookieJar, path: string): Promise<void>;
function loadJar(path: string): Promise<CookieJar>;

interface CookieJar {
    getCookies(url: CookieUrl, context?: SameSiteContext): Cookie[];
    setCookie(raw: string, url: CookieUrl): void;
    removeCookie(name: string, domain: string, path: string): void;
    clear(): void;
    serialize(): string;
    deserialize(json: string): void;
}

interface Cookie {
    readonly name: string;
    readonly value: string;
    readonly domain: string;
    readonly path: string;
    readonly expires: Date | undefined;
    readonly maxAge: number | undefined;
    readonly secure: boolean;
    readonly httpOnly: boolean;
    readonly sameSite: SameSite;     // "Strict" | "Lax" | "None"
    readonly partitioned: boolean;
    readonly hostOnly: boolean;
}

interface CookieUrl {
    readonly hostname: string;
    readonly pathname: string;
    readonly protocol: string;       // "http:" | "https:"
}

type SameSite = "Strict" | "Lax" | "None";

interface CookieJarOptions {
    readonly rejectDomainMismatch?: boolean;  // default true
}
```

## Errors

```ts
class FetchError extends Error { kind: "FetchError"; details; requestId; url; cause; }
class FetchTimeoutError extends Error { kind: "FetchTimeoutError"; timeoutMs; }
class RedirectError extends Error { kind: "RedirectError"; location; redirectCount; }
class ProtocolError extends Error { kind: "ProtocolError"; offeredProtocols; selectedProtocol; }
class UnknownProfileError extends ProfileError { kind: "UnknownProfileError"; profileId; }
class CookieDomainError extends CookieError { kind: "CookieDomainError"; domain; requestHost; }
class CookieParseError extends CookieError { kind: "CookieParseError"; raw; }
```

## Internal packages (advanced)

For direct access to lower-level layers:

```ts
// TLS
import { connectTls, resolveProfile, TlsHandshakeError } from "@browsercore/tls";

// HTTP/2
import { connectHttp2, GoawayReceivedError } from "@browsercore/http2";

// HTTP/1.1
import { connectHttp1, RedirectLimitError } from "@browsercore/http1";

// Transport
import { connect, TcpTransport } from "@browsercore/transport";

// Crypto
import { crypto, NodeCryptoProvider, CryptoProvider } from "@browsercore/crypto";

// Compression
import { compression, NodeZlibCompressionProvider, CompressionProvider } from "@browsercore/compression";

// Testing
import { compareAgainstGolden, computeJa3, computeJa4 } from "@browsercore/testing";
```

## Key defaults

| Setting | Default | Source |
| --- | --- | --- |
| Request timeout | 30 000 ms | `fetch/src/client.ts` |
| Idle pool eviction | 30 000 ms | `fetch/src/pool.ts` |
| Max redirects | 20 | `fetch/src/types.ts` |
| Crawl concurrency | 1 (serial) | `browsercore/src/crawl.ts` |
| HTTP/2 SETTINGS ACK timeout | 5 000 ms | `http2/src/connection.ts` |
| HTTP/2 max frame size | 16 384 | `http2/src/frame/frame.ts` |
| TLS handshake timeout | 10 000 ms | `tls/src/types.ts` |
| Transport connect timeout | 10 000 ms | `transport/src/types.ts` |
| Cookie domain mismatch | reject | `cookies/src/jar.ts` |
