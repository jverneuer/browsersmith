# @browsercore/compression

A clean abstraction wrapping Node's native zlib APIs. HTTP layers — never
`node:zlib` directly — call these methods so the backend is replaceable
(WebCompressionStream, wasm brotli, test double).

## Responsibility

Provide compression primitives: gzip, deflate (zlib-wrapped + raw), and brotli
in both directions, plus a `decompress()` helper that maps a `content-encoding`
header token to the right decoder. All I/O-free and unit-testable.

The `decompress()` helper implements browser-tolerant `deflate` decoding: it
tries the RFC-mandated zlib-wrapped form first and falls back to raw inflate,
because servers disagree on framing and browsers tolerate both.

## What it does NOT know about

- HTTP requests, responses, or `content-encoding` negotiation policy
- TLS, transport, or sockets
- Browser profiles or cookies

Higher layers compose exclusively through the `CompressionProvider` interface.
The production HTTP implementations **never** call `node:zlib` directly — they
call `compression.gzip(...)`, `compression.decompress(...)`, etc. This makes the
backend swappable.

## Public API

```ts
import {
    compression,
    NodeZlibCompressionProvider,
    CompressionProvider,
} from "@browsercore/compression";

// Use the default singleton (backed by node:zlib):
const compressed = compression.gzip(body);
const plain = compression.decompress(body, headers.get("content-encoding")!);

// Or inject a custom provider (e.g. for tests):
const provider: CompressionProvider = new NodeZlibCompressionProvider();
const encoded = provider.brotliCompress(body);
```

## Types

| Export | Kind | Purpose |
| --- | --- | --- |
| `CompressionProvider` | interface | Pure compression primitive abstraction higher layers depend on |
| `NodeZlibCompressionProvider` | class | `node:zlib`-backed implementation |
| `compression` | singleton | Default backend higher layers call into |
| `ContentEncoding` | literal union | `gzip \| deflate \| br \| identity` |
| `SUPPORTED_ENCODINGS` | const array | Runtime list of supported tokens |
| `CompressionError` | class | Base typed error |
| `UnsupportedEncodingError` | class | Unrecognized content-encoding token |
| `DecompressionError` | class | Corrupt / truncated stream |

## Dependency graph

```
@browsercore/compression
  └─ node:zlib
```

No other `@browsercore/*` packages are imported.
