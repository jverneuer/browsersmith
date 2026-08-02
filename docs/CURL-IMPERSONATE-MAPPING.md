# curl-impersonate → @browsercore/* mapping

[curl-impersonate](https://github.com/lwthiker/curl-impersonate) is a patched build of
`curl` that replays a real browser's TLS + HTTP/2 handshake so that automated clients
bypass anti-bot services (Cloudflare, Akamell, Datadome, PerimeterX) that fingerprint
the wire protocol. It impersonates Chrome, Edge, Safari and Firefox by swapping in each
browser's actual TLS library (BoringSSL for Chrome/Edge, NSS for Firefox), reordering
TLS extensions, and replaying browser-specific HTTP/2 SETTINGS.

**We do not need it.** Our `@browsercore/*` stack generates those same bytes natively from a
`BrowserProfile`. This document maps every curl-impersonate use case and capability to the
construct in our stack that replaces it, so the project can drop the external binary
dependency with zero loss of fingerprinting coverage.

---

## 1. The fingerprint surfaces curl-impersonate controls

From its README, the project replicates these network-visible surfaces. Every one is a
field our `BrowserProfile` already carries (see `packages/profiles/src/types.ts`):

| Fingerprint surface | curl-impersonate mechanism | Our construct |
|---|---|---|
| TLS library flavor (BoringSSL vs NSS vs SecureTransport) | per-browser build | `BrowserProfile.tls` — the profile *is* the library's fingerprint |
| Cipher suite offer order | `--ciphers` / `CURLOPT_SSL_CIPHER_LIST` | `TlsProfile.cipherSuites` (ordered) |
| Supported groups (curves) order | `--curves` / `CURLOPT_SSL_EC_CURVES` | `TlsProfile.keyShareGroups` (ordered) |
| Signature algorithms | `CURLOPT_SSL_SIG_HASH_ALGS` | `TlsProfile.signatureAlgorithms` |
| TLS extension order | `CURLOPT_SSL_PERMUTE_EXTENSIONS` | `TlsProfile.extensionOrder` |
| supported_versions | patched curl | `TlsProfile.supportedVersions` |
| GREASE (RFC 8701) | patched curl | `TlsProfile.grease` |
| record_size_limit | patched curl | `TlsProfile.recordSizeLimit` |
| ALPN protocols | `CURLOPT_SSL_ENABLE_ALPN` | `ClientHelloConfig.alpnProtocols` |
| SNI | standard curl | `ClientHelloConfig.serverName` |
| HTTP/2 SETTINGS frame | `CURLOPT_HTTP2_*` | `Http2Profile.settings` |
| HTTP/2 WINDOW_PUSH / window size | patched curl | `Http2Profile.initialWindowSize` |
| HTTP/2 max frame size | patched curl | `Http2Profile.maxFrameSize` |
| HTTP/2 header table size | patched curl | `Http2Profile.headerTableSize` |
| HTTP/2 stream priority/weight | patched curl | `Http2Profile.weight` / `Http2Profile.priority` |
| HTTP/2 pseudo-header order | `CURLOPT_HTTP2_PSEUDO_HEADERS_ORDER` | `@browsercore/http2` frame builder |
| HTTP/1.1 default headers + order | `-H` wrapper flags | `Http1Profile.defaultHeaders` + `headerOrder` |
| Accept-Encoding | `-H` wrapper flags | `Http1Profile.acceptEncoding` |
| Connection header | `-H` wrapper flags | `Http1Profile.connection` |

---

## 2. Use cases, mapped

### UC-1. Bypass a WAF / anti-bot that fingerprints TLS (JA3/JA4)

**curl-impersonate:** run `curl_chrome110 https://target` — the handshake is byte-identical
to Chrome's, so the JA3/JA4 hash matches a real browser and the request is allowed.

**Our stack:** build the handshake from the matching profile and send it over a real socket.

```
import { chrome140 } from "@browsercore/profiles";
import { connectTls } from "@browsercore/tls";

const conn = await connectTls({
  transport: tcpSocket,
  serverName: "target.com",
  profile: chrome140.tls,   // cipher order, extensions, GREASE, key share → exact JA3/JA4
  alpnProtocols: ["h2", "http/1.1"],
});
```

The bytes on the wire come from `buildClientHello(profile)` (`packages/tls/src/handshake`),
which we implement against the profile fields above. The resulting JA3/JA4 is whatever the
profile says it is — and profiles are authored to match real browsers, validated against the
golden captures in `packages/testing/captures/`.

### UC-2. Evade HTTP/2 fingerprinting (SETTINGS, WINDOW_UPDATE, frame order)

**curl-impersonate:** `curl_ff109` sends Firefox's exact HTTP/2 SETTINGS payload and
WINDOW_UPDATE cadence.

**Our stack:** the profile's HTTP/2 section is serialized by `@browsercore/http2`.

```
import { buildClientHello } from "@browsercore/tls";
import { connectHttp2 } from "@browsercore/http2";

// settings frame bytes are deterministic from the profile:
const settings = chrome140.http2.settings; // { headerTableSize, initialWindowSize, ... }
const conn = await connectHttp2({ socket: tlsConn, profile: chrome140.http2 });
```

`@browsercore/http2` already serializes SETTINGS frames byte-identical to the layout Node's own
http2 stack accepts (verified by `compare-node-http.test.ts`). The profile supplies the
browser-specific numbers; the serializer supplies correct framing.

### UC-3. Impersonate a specific browser+version pair

**curl-impersonate:** ships `curl_chrome{99..116}`, `curl_ff{91..117}`,
`curl_safari{15.3,15.5}`, `curl_edge{99,101}` — one binary alias per version.

**Our stack:** each version is a data object, not a binary. `packages/profiles` exports one
`BrowserProfile` per browser version. Adding chrome-141 is adding a data file, not compiling
a patched curl.

```
import { chrome140, chrome139, firefox128, firefox135, safari18, edge140 } from "@browsercore/profiles";
```

The profile is pure data (`cipherSuites: [...]`, `extensionOrder: [...]`, `settings: {...}`),
so it is diffable, reviewable, and testable — unlike a patched TLS library.

### UC-4. Scrape a site that serves different content to different clients

**curl-impersonate:** the site checks the TLS/HTTP fingerprint and serves the "browser" HTML
only to recognized clients.

**Our stack:** same capability, controlled by which profile you attach to the connection.
`@browsercore/fetch` (`packages/fetch/src/client.ts`, just implemented) applies the profile end to
end — TLS handshake, ALPN-driven protocol selection, and HTTP/1.1 vs HTTP/2 header application
— from a single `BrowserProfile`.

```
import { FetchClient } from "@browsercore/fetch";
const client = new FetchClient({ profile: chrome140 });
const res = await client.fetch("https://example.com"); // full impersonation, no binary
```

### UC-5. Drop-in `curl` replacement / retrofit existing libcurl apps

**curl-impersonate:** ships `libcurl-impersonate.so` + `LD_PRELOAD` / `CURL_IMPERSONATE`
env var so existing libcurl-based programs impersonate without code changes.

**Our stack:** not a use case we target. We are a TypeScript networking stack, not a C ABI
shim. If a JS/TS program wants impersonation it uses `@browsercore/fetch` directly (UC-4). If a
non-JS program needs it, that program's concern is outside this monorepo's scope — and
curl-impersonate remains the right tool for retrofitting *C* programs.

### UC-6. Python scraping scripts (`curl_cffi`)

**curl-impersonate**: via [curl_cffi](https://github.com/yifeikong/curl-cffi),
`requests.get(url, impersonate="chrome110")`.

**Our stack:** the equivalent is a thin Python→TS bridge (or re-exporting profiles as JSON and
consuming them from any language). The profile data is language-agnostic; we expose it as
typed JS objects and as JSON. A Python client can `json.load` the same profile and feed it to
its own impersonation client. The *definition* of the fingerprint lives once, in
`packages/profiles`.

---

## 3. What curl-impersonate does that we do NOT replicate (and why)

| Capability | Reason we omit it |
|---|---|
| Swap the actual TLS library (BoringSSL/NSS) at runtime | We don't need to *be* the browser's TLS stack — we need to *emit the same bytes*. Our `buildClientHello` produces the byte layout; the record layer uses `node:crypto` AEAD. The bytes are what get fingerprinted, not the library that made them. |
| LD_PRELOAD retrofitting of C programs | Out of scope — we are a TS stack. |
| Live TLS session-ticket / cert-compression state across connections | Not a fingerprinting surface for initial handshake detection; can be added to the profile/state machine later if a target checks it. |

---

## 4. Validation strategy (replaces the binary as oracle)

Without curl-impersonate as a runtime oracle, how do we know a profile is correct?

1. **Golden captures** (`packages/testing/captures/`) — the existing chrome-140 and firefox-128
   captures (originally produced by curl-impersonate against real servers) become the expected
   answer. `compareGolden(profile, capture)` masks the randomized fields
   (`CaptureMeta.randomizedFields`) and asserts byte equality on the rest.
2. **JA3/JA4 assertion** — derive the expected hash from the golden capture's bytes, then assert
   that `buildClientHello(profile)` produces bytes whose JA3/JA4 matches. This is the property
   that actually matters to the WAF.
3. **node-reference oracle for primitives** — crypto, DNS, zlib, and wire-format serialization
   are already tested for byte-equivalence to Node in `packages/testing/tests/compare-node-*.test.ts`.
4. **Real-browser spot check** — for a new profile, capture a real browser's ClientHello once,
   add it as a golden, and let the comparison suite lock it in. This is the same workflow as
   curl-impersonate's `browsers.json`, but data-driven.

---

## 5. Bottom line

curl-impersonate conflates two things: **(a)** a *database of browser fingerprints* and
**(b)** a *mechanism to replay them*. Our stack splits these cleanly:

- **(a) the fingerprint database** → `BrowserProfile` objects in `packages/profiles`, one per
  browser/version, validated against golden captures.
- **(b) the replay mechanism** → `@browsercore/tls` `buildClientHello`, `@browsercore/http2` SETTINGS
  serialization, `@browsercore/http1` header application, composed by `@browsercore/fetch`.

The binary is redundant. Drop `CurlImpersonateProvider` to optional, keep the frozen captures
as goldens, and add a `buildExpectedCapture(profile)` path that constructs the reference bytes
directly from the profile. Total coverage, no external dependency.
