# HTTP/2 Details

`@browsercore/http2` is a full HTTP/2 framing implementation over any duplex
byte stream. It knows nothing about TLS, TCP, or DNS — it composes over the
`@browsercore/transport` `Transport` interface. Browsercore seeds its SETTINGS
from the selected browser profile so the connection preface matches that
browser's real frame layout.

## Connection preface

`Http2ConnectionImpl` (`http2/src/connection.ts`) starts by writing the fixed
24-byte client preface (RFC 7540 §3.5):

```
PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n
```

immediately followed by a SETTINGS frame whose values come from the browser
profile. The handshake completes when the peer's SETTINGS ACK arrives, or
throws `SettingsAckTimeoutError` after the configurable timeout (default
`5000ms`, via `Http2Options.settingsAckTimeoutMs`).

## SETTINGS — profile-seeded

`fetch/src/profile.ts` translates the profile's named settings to the wire's
numeric identifiers (RFC 9113 §6.5.1):

| Profile field | Wire id | Chrome 140 | Firefox 128 | Safari 17 |
| --- | --- | --- | --- | --- |
| `headerTableSize` | `0x1` (HEADER_TABLE_SIZE) | 65536 | 65536 | 65536 |
| `enablePush` | `0x2` (ENABLE_PUSH) | false (0) | false (0) | false (0) |
| `maxConcurrentStreams` | `0x3` (MAX_CONCURRENT_STREAMS) | 100 | 100 | 100 |
| `initialWindowSize` | `0x4` (INITIAL_WINDOW_SIZE) | 6291456 | 12582912 | 1048576 |
| `maxFrameSize` | `0x5` (MAX_FRAME_SIZE) | 16384 | 16384 | 16384 |

The mapping lives in `profileHttp2Settings()` — the profile uses the human-readable
`Http2Settings` names; the wire uses the numeric keys from the `Http2Settings`
const object in `http2/src/types.ts`. `enablePush` is a boolean in the profile but
becomes `0` or `1` on the wire.

The `Http2Settings` const object exported from `http2/src/types.ts`:

```ts
export const Http2Settings = {
    HEADER_TABLE_SIZE: 0x1,
    ENABLE_PUSH: 0x2,
    MAX_CONCURRENT_STREAMS: 0x3,
    INITIAL_WINDOW_SIZE: 0x4,
    MAX_FRAME_SIZE: 0x5,
    MAX_HEADER_LIST_SIZE: 0x6,
} as const;
```

## Frame model

Every frame is parsed/serialized through `http2/src/frame/frame.ts`. The fixed
9-byte header (RFC 7540 §4.1) is `length(24 bits) || type(8) || flags(8) ||
reserved + streamId(31)`. `FRAME_HEADER_LENGTH = 9` and the default max payload
is `DEFAULT_MAX_FRAME_SIZE = 16384` (16 KiB).

The `Frame` discriminated union (`http2/src/types.ts`) covers all ten RFC 7540
frame types — `DATA (0x0)`, `HEADERS (0x1)`, `PRIORITY (0x2)`,
`RST_STREAM (0x3)`, `SETTINGS (0x4)`, `PUSH_PROMISE (0x5)`, `PING (0x6)`,
`GOAWAY (0x7)`, `WINDOW_UPDATE (0x8)`, `CONTINUATION (0x9)` — with a
per-variant payload shape.

## Stream multiplexing + flow control

Streams are managed by `http2/src/stream/stream.ts` (`createStreamManager`).
Outbound streams are client-initiated odd numbers, bounded by the peer's
`MAX_CONCURRENT_STREAMS`. `request()` waits for a concurrency slot to free
(honest backpressure) rather than throwing.

`FlowControlWindow` tracks send/receive credit per stream and per connection.
Sending more than the peer's window throws `FlowControlError` (carries
`windowSize`, `attempted`, `streamId`). The connection reacts to `WINDOW_UPDATE`
frames to replenish credit.

Stream lifecycle is the RFC 7540 §5.1 state machine expressed as a
discriminated union:

```ts
export type StreamState =
    | { readonly state: "idle" }
    | { readonly state: "local_reserved" }
    | { readonly state: "remote_reserved" }
    | { readonly state: "open" }
    | { readonly state: "local_half_closed" }
    | { readonly state: "remote_half_closed" }
    | { readonly state: "closed"; readonly reason: StreamCloseReason };
```

## HPACK header compression

`http2/src/hpack/` implements RFC 7544 HPACK: `HpackEncoder`, `HpackDecoder`,
a `DynamicTable`, Huffman coding, and integer/decoding. Request headers pass
through `encodeHeaders()` before being framed as HEADERS.

## The request surface

```ts
// http2/src/types.ts
export interface Http2Request {
    readonly method: string;
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly headers: ReadonlyMap<string, string>;
    readonly body: Uint8Array | undefined;
}

export interface Http2Response {
    readonly statusCode: number;
    readonly headers: ReadonlyMap<string, string>;
    readonly body: Uint8Array;
}
```

The `fetch` layer (`fetch/src/dispatch.ts`) maps pseudo-headers: `:method`,
`:path`, `:scheme`, `:authority`. HTTP/2 leaves `content-encoding` bodies
compressed — `dispatchHttp2()` decompresses via the compression layer using the
response's `content-encoding` header.

## Known limitations

From the docstring on `Http2ConnectionImpl`:
- Request HEADERS are sent in a single frame (no CONTINUATION splitting). Real
  request header blocks are well under the 16 KiB max-frame size.
- Server push is decoded and surfaced via `"push"` / `"pushResponse"` stream
  events but is **not** exposed through the `Http2Connection` interface.
- PRIORITY frames are accepted but do not reorder the send queue.
