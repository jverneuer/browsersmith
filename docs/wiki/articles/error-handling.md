# Error Handling

Every `@browsercore/*` package defines typed errors with a `kind` literal
field. Callers match on `kind` instead of parsing messages. Lower-level errors
are wrapped via `cause` so the full chain is inspectable.

## The pattern

Each package follows the same convention:
- A base class carrying `kind` + `details` + `cause`.
- A subclass per failure domain, narrowing `kind` to its own literal.
- An `ensure*Error()` wrapper that narrows a caught value or wraps it.

## Fetch errors (`fetch/src/errors.ts`)

The top-level errors your application catches:

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `FetchError` | `"FetchError"` | `details`, `requestId`, `url`, `cause` | Base class for all fetch failures. |
| `FetchTimeoutError` | `"FetchTimeoutError"` | `timeoutMs` | Request exceeded the configured timeout. |
| `RedirectError` | `"RedirectError"` | `location`, `redirectCount` | Redirect loop or limit exceeded. |
| `ProtocolError` | `"ProtocolError"` | `offeredProtocols`, `selectedProtocol` | ALPN negotiation failed. |
| `AbortError` | (extends `FetchError`) | — | Request aborted via AbortSignal. |

```ts
import { fetch, FetchError, FetchTimeoutError, RedirectError, ProtocolError } from "browsercore";

try {
    await fetch("https://example.com", { profile: "chrome-140" });
} catch (err) {
    if (err instanceof FetchTimeoutError) {
        console.error("timed out after %dms", err.timeoutMs);
    } else if (err instanceof RedirectError) {
        console.error("redirect loop at %s (count=%d)", err.location, err.redirectCount);
    } else if (err instanceof ProtocolError) {
        console.error("ALPN failed: offered=%j selected=%s", err.offeredProtocols, err.selectedProtocol);
    } else if (err instanceof FetchError) {
        console.error("fetch failed: %s (url=%s)", err.message, err.url);
    }
}
```

`ensureFetchError(e, options)` wraps an unknown rejection as a `FetchError`
(passing through existing typed errors with `cause`).

## Transport errors (`transport/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `TransportError` | `"TransportError"` | `details`, `cause` | Base class. |
| `ConnectTimeoutError` | `"ConnectTimeoutError"` | `timeoutMs`, `host`, `port` | TCP connect timed out. |
| `DnsResolutionError` | `"DnsResolutionError"` | `host`, `cause` | DNS lookup failed. |
| `IdleTimeoutError` | `"IdleTimeoutError"` | `idleMs` | No data flowed within idle timeout. |
| `ReadTimeoutError` | `"ReadTimeoutError"` | `timeoutMs` | No data arrived within per-read timeout. |

## TLS errors (`tls/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `TlsError` | `"TlsError"` | `details`, `cause` | Base class. |
| `TlsHandshakeError` | `"TlsHandshakeError"` | `phase` | Handshake failed at `client_hello` / `server_hello` / `certificate` / `finished`. |
| `TlsDecryptError` | `"TlsDecryptError"` | `algorithm`, `cause` | Record decryption / auth failure. |
| `TlsAlertError` | `"TlsAlertError"` | `level`, `description`, `cause` | TLS alert received (level: `warning` / `fatal`). |
| `TlsProfileError` | `"TlsProfileError"` | `profile` | Unknown TLS profile name. |
| `TlsKeyScheduleError` | `"TlsKeyScheduleError"` | `hash`, `cause` | HKDF-Expand overflow. |
| `TlsPemError` | `"TlsPemError"` | `cause` | Malformed PEM block. |
| `NotImplementedError` | `"NotImplementedError"` | `feature`, `cause` | Unimplemented code path. |

`ensureTlsError(e)` narrows or wraps.

## HTTP/2 errors (`http2/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `Http2Error` | `"Http2Error"` | `cause` | Base class. |
| `GoawayReceivedError` | `"GoawayReceivedError"` | `lastStreamId`, `errorCode`, `debugData` | Peer sent GOAWAY. |
| `RstStreamError` | `"RstStreamError"` | `streamId`, `errorCode` | Peer reset a stream. |
| `FlowControlError` | `"FlowControlError"` | `streamId`, `windowSize`, `attempted` | Send exceeded window. |
| `FrameParseError` | `"FrameParseError"` | `offset`, `cause` | Malformed frame. |
| `SettingsAckTimeoutError` | `"SettingsAckTimeoutError"` | `timeoutMs` | SETTINGS ACK timed out. |

## HTTP/1.1 errors (`http1/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `Http1Error` | `"Http1Error"` | `cause` | Base class. |
| `RedirectLimitError` | `"RedirectLimitError"` | `limit`, `trail` | Redirect chain exceeded. |
| `InvalidResponseError` | `"InvalidResponseError"` | `rawPreview`, `cause` | Unparseable response bytes. |
| `ContentEncodingError` | `"ContentEncodingError"` | `encoding`, `cause` | Unsupported/corrupt content-encoding. |
| `ChunkEncodingError` | `"ChunkEncodingError"` | `offset`, `cause` | Malformed chunked encoding. |

## Cookie errors (`cookies/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `CookieError` | (base) | `cause` | Base class. |
| `CookieDomainError` | `"CookieDomainError"` | `domain`, `requestHost` | Domain mismatch. |
| `CookieParseError` | `"CookieParseError"` | `raw`, `reason` | Unparseable Set-Cookie. |

## Crypto errors (`crypto/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `CryptoError` | `"CryptoError"` | `algorithm`, `cause` | Base class. |
| `UnsupportedAlgorithmError` | `"UnsupportedAlgorithmError"` | `algorithm` | Unknown algorithm. |
| `DecryptError` | `"DecryptError"` | `algorithm`, `cause` | AEAD auth failure. |

## Profile errors (`profiles/src/errors.ts`)

| Error | `kind` | Carries | When |
| --- | --- | --- | --- |
| `ProfileError` | (base) | `cause` | Base class. |
| `UnknownProfileError` | `"UnknownProfileError"` | `profileId` | No profile for the given id. |

## Error wrapping chain

Errors bubble up with `cause` preserved. A `FetchTimeoutError` caught at the
top may wrap a `ConnectTimeoutError` from the transport layer, which itself may
wrap a Node socket error. Every layer's `ensure*Error()` passes through
existing typed errors and wraps unknowns, so the chain is always inspectable.
