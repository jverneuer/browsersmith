# Browser Profiles

A **browser profile** is a complete, versioned fingerprint across TLS, HTTP/2,
and HTTP/1.1. Pick a profile and browsercore reproduces that browser's exact
wire signals — cipher order, extension order, SETTINGS frame, header order,
default headers.

## The data model

`profiles/src/types.ts` defines the core types:

```ts
export type ProfileId = string & { __brand: "ProfileId" };  // e.g. "chrome-140"

export type ProfileName = "chrome" | "firefox" | "safari" | "edge";

export interface BrowserProfile {
    readonly id: ProfileId;        // "chrome-140"
    readonly name: string;         // "chrome"
    readonly version: string;      // "140.0.7339.18"
    readonly tls: TlsProfile;
    readonly http2: Http2Profile;
    readonly http1: Http1Profile;
}
```

`TlsProfile` carries `cipherSuites`, `extensionOrder`, `supportedVersions`,
`keyShareGroups`, `signatureAlgorithms`, `grease`, and optional
`recordSizeLimit`. `Http2Profile` carries `settings`, `initialWindowSize`,
`maxFrameSize`, `headerTableSize`, `weight`, and optional `priority`.
`Http1Profile` carries `defaultHeaders`, `headerOrder`, `connection`, and
`acceptEncoding`.

## Built-in profiles

Registered at module evaluation in `profiles/src/registry.ts` from
`ChromeProfiles`, `FirefoxProfiles`, `SafariProfiles`, `EdgeProfiles`:

| id | name | version | GREASE | h2 initial window | max concurrent streams |
| --- | --- | --- | --- | --- | --- |
| `chrome-120` | chrome | 120.0.6099.71 | yes | 6291456 | 100 |
| `chrome-128` | chrome | 128.0.6613.137 | yes | 6291456 | 100 |
| `chrome-140` | chrome | 140.0.7339.18 | yes | 6291456 | 100 |
| `firefox-120` | firefox | 120.0 | no | 12582912 | 100 |
| `firefox-128` | firefox | 128.0 | no | 12582912 | 100 |
| `firefox-135` | firefox | 135.0 | no | 12582912 | 128 |
| `safari-17` | safari | 17.6 | yes | 1048576 | 100 |
| `safari-18` | safari | 18.1 | yes | 1048576 | 100 |
| `edge-120` | edge | 120.0.2210.91 | yes | 6291456 | 100 |
| `edge-128` | edge | 128.0.2739.70 | yes | 6291456 | 100 |

## How to choose

- **Default / headline**: `chrome-140` (`CHROME_140`). Most widely tested against
  bot detectors. Use unless you have a reason to mimic a different browser.
- **Firefox**: `firefox-128` (`FIREFOX_128`). Use when a target specifically
  fingerprint-matches Firefox, or when you want a non-GREASE TLS signature.
- **Safari**: `safari-17`. Distinct cipher order (prioritizes AES-GCM over
  ChaCha20), smaller HTTP/2 initial window (1048576 vs Chrome's 6291456).
- **Edge**: `edge-120` / `edge-128`. Chromium-based, so TLS fingerprint is close
  to Chrome's — differs in the `sec-ch-ua` brand list (includes
  `"Microsoft Edge"`) and user-agent string.

The curated starter constants live in `browsercore/src/profiles.ts`:

```ts
export const CHROME_140: ProfileId = profile("chrome-140");
export const FIREFOX_128: ProfileId = profile("firefox-128");
export const PROFILES = { "chrome-140": CHROME_140, "firefox-128": FIREFOX_128 } as const;
```

## Using profiles

```ts
import { fetch, createClient, PROFILES, getProfile, listProfiles, registerProfile } from "browsercore";

// One-shot with a profile id:
await fetch("https://example.com", { profile: PROFILES["chrome-140"] });

// Reusable client (profile applied to every request, overridable per-call):
const client = createClient({ profile: "firefox-128" });

// Discover what's registered:
listProfiles();   // ["chrome-120", "chrome-128", "chrome-140", "firefox-120", ...]
getProfile("chrome-140");  // returns the full BrowserProfile
```

`getProfile(id)` throws `UnknownProfileError` (carries `profileId`) if the id
is not in the registry.

## Custom profiles

`registerProfile(profile)` adds or overwrites a profile at runtime. Build a
`BrowserProfile` matching the structure in `profiles/src/profiles/chrome.ts`
and register it before making requests. This is how you add private or future
browser fingerprints without waiting for a release.

## How profiles reach the wire

The translation seam is `fetch/src/profile.ts`:
- `profileToTlsConfig(profile, serverName)` → `ClientHelloConfig` (validates
  and narrows string arrays to literal unions).
- `profileHttp2Settings(profile)` → `Http2SettingsMap` (named → numeric keys,
  `enablePush` boolean → 0/1).
- `applyHttp1Profile(headers, profile)` → merges default headers (explicit
  headers win).

Invalid values in any profile field throw a `FetchError` at this boundary —
never deeper in the stack.
