# @browsercore/compression — Implementation Plan

Abstraction wrapping `node:zlib` for gzip/deflate/brotli so HTTP layers never
import `node:zlib` directly. Each step is independently testable.

## Step 1 — Provider interface + errors (DONE)

Define `CompressionProvider` (gzip/gunzip, deflate/inflate/inflateRaw,
brotliCompress/brotliDecompress, decompress) and typed errors
(`CompressionError`, `UnsupportedEncodingError`, `DecompressionError`).
Done when `tsc --build` is clean.

## Step 2 — NodeZlibCompressionProvider + singleton (DONE)

Implement the `node:zlib`-backed provider and export a default `compression`
singleton. Canonicalize `Buffer` → `Uint8Array` at the boundary; wrap zlib
failures as typed errors. Done when round-trip tests pass.

## Step 3 — Browser-tolerant `deflate` decoding (DONE)

`decompress()` maps a `content-encoding` token to the right decoder. For
`deflate`, try zlib-wrapped inflate first, fall back to raw inflate (servers
disagree on framing; browsers tolerate both). Done when both framings decode.

## Step 4 — Wire into http1 + fetch (DONE)

Replace the direct `node:zlib` usage in `@browsercore/http1` and the stub in
`@browsercore/fetch` with calls to `@browsercore/compression`. Done when both
packages delegate and their tests still pass.

## Definition of done

- [x] gzip / deflate / brotli round-trip for sample payloads.
- [x] `deflate` decodes both zlib-wrapped and raw streams.
- [x] `decompress()` throws `UnsupportedEncodingError` for unknown tokens.
- [x] `decompress()` throws `DecompressionError` on corrupt input.
- [x] `http1` and `fetch` delegate to `@browsercore/compression`.
- [x] Every test in `tests/` passes; `tsc --build` is clean.
