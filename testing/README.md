# browsercore testing assets

Golden packet captures and reference data absorbed from the (now-archived)
standalone `@browsercore/testing` repository. These are real browser
fingerprints the stack is verified against — the wire bytes a real Chrome or
Firefox sends, captured via `curl-impersonate`, used as the ground truth that
`@browsercore/tls`, `@browsercore/http2`, and `@browsercore/fetch` must
reproduce byte-for-byte (modulo randomized fields).

## What's here

```
testing/
  captures/
    README.md                      ← this file
    chrome-140/
      tls/client_hello.{bin,json}  ← Chrome 140 TLS 1.3 ClientHello
      http2/settings.{bin,json}    ← Chrome 140 first HTTP/2 SETTINGS frame
    firefox-128/
      tls/client_hello.{bin,json}  ← Firefox 128 TLS 1.3 ClientHello
```

Each capture is a raw `.bin` (the exact wire bytes) plus a `.meta.json`
sidecar describing it and listing the byte ranges that are intentionally
randomized per the protocol spec (client_random, ephemeral keys). Those ranges
must be masked before any golden comparison — two legitimate ClientHellos from
the same browser never match byte-for-byte because of those fields.

## How it's consumed

The runtime fingerprint verification is provided by the published
`@browsercore/testing` npm package (declared in `package.json`), which exports
`loadGolden`, `compareAgainstGolden`, `computeJa3`, and `computeJa4`. The
captures in this directory are the source of truth those functions compare
against — they ship with this repo so the e2e suite can assert
crawler-detection defeat deterministically and offline.

## Origin / archival note

These assets were moved here from `github.com/jverneuer/browsercore-testing`.
That standalone repo is being archived; its useful contents (captures, golden
loader, fingerprint math) now live as the `@browsercore/testing` npm package
(runtime) and this directory (data). Do not split them again.
