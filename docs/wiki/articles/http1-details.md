# HTTP/1.1 Details

`@browsercore/http1` is a streaming HTTP/1.1 client over any duplex byte stream.
It serializes requests, parses responses, and manages the HTTP/1.1 protocol
state machine: keep-alive, chunked transfer-encoding, content-encoding
decompression, redirect following, and a cookie-header integration seam. It
knows nothing about TLS or TCP — it composes over `@browsercore/transport` and
`@browsercore/compression`.

## Header ordering — profile-enforced

HTTP/1.1 header order is a fingerprint signal. `fetch/src/profile.ts` applies
profile defaults via `applyHttp1Profile()`:

```ts
// fetch/src/profile.ts
export function applyHttp1Profile(headers: Map<string, string>, profile: BrowserProfile): void {
    for (const [name, value] of Object.entries(profile.http1.defaultHeaders)) {
        if (!headers.has(name)) {
            headers.set(name, value);  // explicit headers win
        }
    }
}
```

Each browser has a distinct `headerOrder` (`profiles/src/types.ts` → `Http1Profile`):

**Chrome 140 / Edge 120** (14 headers):
```
host → connection → sec-ch-ua → sec-ch-ua-mobile → sec-ch-ua-platform →
upgrade-insecure-requests → user-agent → accept → sec-fetch-site →
sec-fetch-mode → sec-fetch-user → sec-fetch-dest → accept-encoding →
accept-language
```

**Firefox 128** (11 headers):
```
host → user-agent → accept → accept-language → accept-encoding → connection →
upgrade-insecure-requests → sec-fetch-dest → sec-fetch-mode → sec-fetch-site →
sec-fetch-user
```

**Safari 17** (6 headers):
```
host → accept → accept-encoding → accept-language → user-agent → connection
```

The profile also supplies default header values. Chrome 140 sends:
```
sec-ch-ua: "Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "MacOS"
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...
```

`accept-encoding` is profile-supplied: `"gzip, deflate, br"` for all built-ins.
`connection` is `"keep-alive"` for all built-ins (`Http1Profile.connection` is
the literal union `"keep-alive" | "close"`).

## Default headers (profile-supplied `sec-ch-ua`, `user-agent`, `sec-fetch-*`)

The `Http1Profile.defaultHeaders` record is a `Readonly<Record<string, string>>`.
When you supply your own `FetchOptions.headers`, they overwrite the profile
defaults (explicit headers win). The `host` header is always set by the client
based on the URL.

## Request surface

```ts
// http1/src/types.ts
export interface HttpRequest {
    readonly method: HttpMethod;          // "GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"|"TRACE"|"CONNECT"
    readonly url: string;
    readonly headers: ReadonlyMap<string, string>;
    readonly body: HttpBodyKind;          // { kind: "empty" } | { kind: "bytes"; data: Uint8Array }
}

export interface HttpResponse {
    readonly statusCode: number;
    readonly statusText: string;
    readonly headers: ReadonlyMap<string, string>;
    readonly body: Uint8Array;
}
```

`serializeRequest()` in `http1/src/message.ts` turns an `HttpRequest` into wire
bytes. `parseResponse()` is the inverse — it returns the response plus the
bytes consumed so the caller can detect pipelining / keep-alive boundaries.

## Decompression — browser-tolerant deflate

`http1/src/decompress.ts` (`decompressBody`) decodes per `content-encoding`.
The `deflate` case is the notable one: it tries the RFC-mandated zlib-wrapped
form first and falls back to raw inflate, because servers disagree on framing
and browsers tolerate both. `isSupportedContentEncoding()` reports which tokens
the compression layer handles (`gzip`, `deflate`, `br`, `identity`).

## Redirect handling

`http1/src/redirect.ts` exports a standalone `followRedirects()` helper —
`Http1Connection` itself does **not** auto-follow redirects. `isRecognizedStatus`
matches 3xx codes; `resolveRedirectUrl()` resolves relative `Location` URLs.
`RedirectLimitError` fires when the chain exceeds `maxRedirects` (default 10,
carries the `trail` of visited URLs).

The `fetch` layer wraps this: `fetch/src/client.ts` follows redirects itself,
and converts 303 See Other to GET (stripping the body) unless the original
method was HEAD or GET (RFC 7231 §6.4.4).

## Cookie interceptor seam

`http1/src/types.ts` defines a `CookieInterceptor` — http1 performs no cookie
storage of its own. The caller (the fetch layer) supplies `addCookies(url)`
and `storeCookies(url, setCookieHeaders)`. This is the seam that wires the
cookie jar to requests/responses.

## Connection state machine

```ts
// http1/src/types.ts
export type Http1ConnectionState =
    | { readonly state: "idle" }
    | { readonly state: "in_flight"; readonly pending: number }
    | { readonly state: "closing" }
    | { readonly state: "closed"; readonly reason: Http1CloseReason };

export type Http1CloseReason =
    | { readonly kind: "client_close" }
    | { readonly kind: "remote_close" }
    | { readonly kind: "error"; readonly error: Error }
    | { readonly kind: "redirect_jump"; readonly to: string };
```

`Http1ConnectionId` is a branded string. The connection is strictly
request/response — no server push, no multiplexing. Connection reuse is owned by
the fetch layer's pool, not by http1 itself.
