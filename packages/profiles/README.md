# @network/profiles

Browser fingerprint definitions (TLS / HTTP/2 / HTTP/1.1). Pure data — no protocol implementation.

## Responsibility

Define WHAT a browser fingerprint looks like so that higher layers (tls, http1, http2) can translate it into bytes, header order, and SETTINGS frames. Adding a new Chrome version means adding a new entry here — protocol implementations never change.

## What it does NOT know about

- TLS handshakes or cryptography
- HTTP parsing or serialization
- Sockets or I/O
- Cookies

## Public API

```ts
import { getProfile, listProfiles, registerProfile } from "@network/profiles";

const chrome = getProfile("chrome-140" as ProfileId);
console.log(chrome.tls.cipherSuites); // ordered cipher list
console.log(chrome.http2.settings);   // HTTP/2 SETTINGS frame values

const all = listProfiles(); // ["chrome-120", "chrome-128", ...]

registerProfile(myCustomProfile); // extensibility hook
```

## Types

| Export | Kind | Purpose |
| --- | --- | --- |
| `BrowserProfile` | interface | Complete fingerprint across TLS + HTTP/2 + HTTP/1.1 |
| `TlsProfile` | interface | Cipher order, extensions, GREASE, signature algorithms |
| `Http2Profile` | interface | SETTINGS, window sizes, priority |
| `Http1Profile` | interface | Default headers, header order, accept-encoding |
| `ProfileId` | branded string | Opaque profile identifier |
| `ProfileName` | literal union | `"chrome" \| "firefox" \| "safari" \| "edge"` |
| `getProfile()` | function | Look up a profile by id |
| `listProfiles()` | function | List all registered ids |
| `registerProfile()` | function | Add a custom profile at runtime |
| `UnknownProfileError` | class | Thrown when a profile id is not found |

## Dependency graph

```
@network/profiles
```

No other `@network/*` packages and no Node built-ins are imported. This is a pure data package.
