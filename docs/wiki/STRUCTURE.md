# browsercore Wiki — Structure

Deep-dive and reference articles for the browsercore documentation wiki.
All articles are written against the actual source code — types, defaults,
and error kinds are quoted from the real implementation.

## Articles

### Deep-dive

| Slug | Title | Status |
| --- | --- | --- |
| [tls-fingerprinting](articles/tls-fingerprinting.md) | TLS Fingerprinting (JA3/JA4) | **DONE** |
| [http2-details](articles/http2-details.md) | HTTP/2 Details (SETTINGS, frames, streams) | **DONE** |
| [http1-details](articles/http1-details.md) | HTTP/1.1 Details (header ordering, keep-alive) | **DONE** |
| [browser-profiles](articles/browser-profiles.md) | Browser Profiles (what each is, how to choose) | **DONE** |
| [cookie-management](articles/cookie-management.md) | Cookie Management (jar, persistence, SameSite) | **DONE** |
| [error-handling](articles/error-handling.md) | Error Handling (typed errors, hierarchy) | **DONE** |
| [architecture-and-providers](articles/architecture-and-providers.md) | Architecture & Provider Abstraction | **DONE** |

### Reference

| Slug | Title | Status |
| --- | --- | --- |
| [api-reference](articles/api-reference.md) | API Reference (public surface listing) | **DONE** |

## Source coverage

Each article reads from:

- `tls/src/` — `index.ts`, `types.ts`, `errors.ts`, `handshake/client-hello.ts`, `profiles/profiles.ts`, `extensions/extensions.ts`
- `http2/src/` — `index.ts`, `types.ts`, `errors.ts`, `connection.ts`, `frame/frame.ts`, `hpack/hpack.ts`, `stream/stream.ts`
- `http1/src/` — `index.ts`, `types.ts`, `errors.ts`, `connection.ts`, `message.ts`, `redirect.ts`, `decompress.ts`
- `profiles/src/` — `index.ts`, `types.ts`, `registry.ts`, `errors.ts`, `profiles/{chrome,firefox,safari,edge}.ts`
- `cookies/src/` — `index.ts`, `types.ts`, `jar.ts`, `cookie.ts`, `errors.ts`, `persistence.ts`
- `compression/src/` — `index.ts`, `types.ts`, `compression.ts`, `errors.ts`
- `crypto/src/` — `index.ts`, `provider.ts`, `types.ts`, `errors.ts`, `crypto.ts`
- `fetch/src/` — `index.ts`, `client.ts`, `dispatch.ts`, `profile.ts`, `errors.ts`, `types.ts`, `pool.ts`, `response.ts`, `redirect.ts`, `tls-adapter.ts`, `url.ts`
- `transport/src/` — `index.ts`, `types.ts`, `errors.ts`, `transport.ts`
- `testing/src/` — `index.ts`, `fingerprint/{ja3,ja4}.ts`, `golden/golden.ts`
- `testing/captures/` — `chrome-140/`, `firefox-128/`, `safari-17/`, `chrome-131/`, `firefox-133/`
- `browsercore/src/` — `index.ts`, `profiles.ts`, `crawl.ts`

## Conventions

- Every error table lists the `kind` discriminator — match on it, not the message.
- Code examples use the real API: `createClient({ profile: "chrome-140" })`,
  `jar.getCookies({ hostname, pathname, protocol })`, etc.
- Defaults quoted from source (e.g. timeout 30_000, max frame size 16_384).
- No fluff — dense but readable, 200–500 words each.
