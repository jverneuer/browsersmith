# Cookie Management

`@browsercore/cookies` is an RFC 6265-compliant cookie library: parsing, a jar,
domain/path/Secure/expiry matching, RFC 6265bis SameSite enforcement, CHIPS
partitioning, and JSON persistence. It performs no I/O of its own (persistence
uses `node:fs`) — higher layers (`http1`, `http2`, `fetch`) compose through its
exports.

## The jar

```ts
import { createCookieJar, type CookieJar, type CookieUrl } from "browsercore";

const jar = createCookieJar();  // options: { rejectDomainMismatch?: boolean }
```

`createCookieJar()` (`cookies/src/jar.ts`) returns a `CookieJar` backed by a
`Map` keyed by `domain\0path\0name` (O(1) lookups, stable insertion order).

The `CookieJar` interface:

```ts
export interface CookieJar {
    getCookies(url: CookieUrl, context?: SameSiteContext): Cookie[];
    setCookie(raw: string, url: CookieUrl): void;
    removeCookie(name: string, domain: string, path: string): void;
    clear(): void;
    serialize(): string;          // JSON
    deserialize(json: string): void;
}
```

`getCookies()` scans all stored cookies, applies RFC 6265 §5 matching
(domain, path, Secure, expiry) plus SameSite, and sorts per §5.4 (longer path
first, then earlier creation time).

`CookieUrl` is the subset of URL info matching needs:
```ts
export interface CookieUrl {
    readonly hostname: string;
    readonly pathname: string;
    readonly protocol: string;  // "http:" | "https:"
}
```

## Cookie model

```ts
// cookies/src/types.ts
export interface Cookie {
    readonly name: string;
    readonly value: string;
    readonly domain: string;
    readonly path: string;
    readonly expires: Date | undefined;    // mutually exclusive with maxAge
    readonly maxAge: number | undefined;
    readonly secure: boolean;
    readonly httpOnly: boolean;
    readonly sameSite: SameSite;           // "Strict" | "Lax" | "None"
    readonly partitioned: boolean;         // CHIPS
    readonly hostOnly: boolean;
    readonly creationTime: number;         // ms epoch
    readonly lastAccessTime: number;       // ms epoch
}
```

Cookies are immutable values — the jar replaces them wholesale on update.

## Matching rules

`cookieMatchesUrl()` returns a `CookieMatchResult` discriminated union that
explains *why* a cookie matched or didn't:

```ts
export type CookieMatchResult =
    | { readonly matched: true; readonly reason: "ok" }
    | { readonly matched: false; readonly reason: "domain_mismatch" }
    | { readonly matched: false; readonly reason: "path_mismatch" }
    | { readonly matched: false; readonly reason: "secure_required" }
    | { readonly matched: false; readonly reason: "expired" }
    | { readonly matched: false; readonly reason: "same_site" };
```

Domain matching follows RFC 6265 §5.1.3. When `rejectDomainMismatch` is `true`
(the default), `setCookie()` rejects a cookie whose domain doesn't domain-match
the request host by throwing `CookieDomainError` (carries `domain`,
`requestHost`).

`defaultPath()` (RFC 6265 §5.1.4) derives the default path from the request
path. `normalizeDomain()` lowercases and strips the leading dot per §5.1.2.
`isExpired()` checks Max-Age / Expires.

## SameSite enforcement

`sameSiteAllows(cookie, url, context)` implements RFC 6265bis §5.3.7 / §8.8.2:

| SameSite | Behavior |
| --- | --- |
| `Strict` | Send only on same-site requests. |
| `Lax` | Send on same-site + safe cross-site top-level navigations (GET, HEAD, OPTIONS, TRACE). |
| `None` | Always send (Secure-ness is enforced separately). |

`SameSiteContext` supplies the decision:

```ts
export interface SameSiteContext {
    readonly topLevelSite: string;       // hostname of initiator site
    readonly isTopLevelNavigation?: boolean;
    readonly method?: string;
}
```

`isSameSiteHost()` approximates the registrable-domain comparison: same-site
when hosts are equal or one is a suffix of the other. `SAFE_METHODS` =
`GET`, `HEAD`, `OPTIONS`, `TRACE`.

## Parsing

`parseSetCookieHeader(raw, url)` parses a `Set-Cookie` header value into a
`Cookie`. Throws `CookieParseError` (carries `raw`, `reason`) on an unparseable
header.

## Persistence

```ts
import { saveJar, loadJar } from "browsercore";

// Serialize to a file (async, uses node:fs):
saveJar(jar, "./session.json");

// Restore in a later process:
const jar = loadJar("./session.json");
```

`saveJar` writes `jar.serialize()` (JSON with `expires` as ISO string or null);
`loadJar` builds a fresh jar and calls `deserialize()`. This is how you resume
an authenticated session across process restarts.

## Integration with fetch

The fetch layer wires the jar to requests/responses via `CookieInterceptor`
(`http1/src/types.ts`): `addCookies(url)` injects the `Cookie` header before
serialization; `storeCookies(url, setCookieHeaders)` stores any `Set-Cookie`
from the response. Domain-mismatch cookies are silently dropped per RFC 6265
§5.3 step 11; other errors re-throw.
