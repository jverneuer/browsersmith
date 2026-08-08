# Running in AWS Lambda

Packaging and running browsersmith on serverless runtimes — Lambda, Cloudflare Workers, Vercel Edge — including the HTTP/3 caveats.

## Why browsersmith fits serverless

browsersmith is pure TypeScript, ESM-only, and has zero runtime dependencies outside the `@browsercore/*` namespace. The full stack — TLS 1.3, HTTP/2, HPACK, AES-GCM, X25519 — is JavaScript that calls Node's global WebCrypto. No native modules to compile, no BoringSSL build to ship, no Go subprocess to spawn, no `LD_PRELOAD` tricks. Cold start is just module load plus WebCrypto initialization that the Node 26 runtime has already done for you.

That profile matters on Lambda. The two main alternatives both fail the serverless test: curl-impersonate ships a native binary linked against BoringSSL and there is no published Lambda Layer for it — you end up building your own container image. CycleTLS spawns a Go subprocess listening on a localhost port, which adds ~50-100ms of cold-start overhead and breaks under Lambda's freeze/thaw cycle because the IPC channel doesn't survive. See [comparison.md](./comparison.md) for the full matrix. browsersmith just bundles.

## Packaging for Lambda

Use the `nodejs26.x` runtime (Node 26 is browsersmith's minimum). Bundle with esbuild into a single ESM file, zip, and upload — no Lambda Layer needed.

```sh
esbuild src/handler.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=node26 \
  --outfile=dist/index.mjs \
  --minify
```

browsersmith bundles cleanly with no `--external` flags — there are no native modules to leave out and no dynamic `require()` calls to preserve. Expect a minified-plus-gzipped artifact in the low-hundreds-of-KB range (an order of magnitude smaller than a Chromium-based Lambda package). Zip `dist/index.mjs` plus any static assets and upload. A minimal SAM template:

```yaml
MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    Runtime: nodejs26.x
    Handler: index.handler
    CodeUri: ./dist
    MemorySize: 512
    Timeout: 30
```

## Cold start

On a cold start, the Lambda runtime loads `dist/index.mjs`, the ESM module graph resolves browsersmith and its `@browsercore/*` dependencies, and the first `fetch()` call lazy-loads the TLS and HTTP/2 code paths. WebCrypto's `subtle` is already initialized as part of the Node 26 runtime — there is no BoringSSL init step, no Go runtime spin-up, no Chromium process to launch.

The cold-start overhead attributable to browsersmith is qualitatively fast: module load plus a few milliseconds of WebCrypto warmup. We are not committing to a specific number here — measure on your own account and configuration — but it lands in the tens-of-milliseconds range, not the seconds that a puppeteer-extra Lambda pays to boot Chromium. Warm invocations skip the module load entirely; the per-request cost is just the TLS handshake and the HTTP request. See [examples.md](./examples.md) for recipes that pair browsersmith with the standard fetch-shaped response handling.

## An example Lambda handler

A complete handler that fetches a URL with the chrome-140 profile and returns status plus the first N bytes of the body. If you are using Lambda as a scraper backend, see [scraping.md](./scraping.md) for the broader session-and-concurrency pattern.

```typescript
import {
  createClient,
  PROFILES,
  FetchError,
  FetchTimeoutError,
} from "browsersmith";

// Module-scoped client — reused across invocations in the same
// execution context. createClient() is synchronous, no await.
const client = createClient({
  profile: PROFILES["chrome-140"],
  timeoutMs: 10_000, // shorter than the default 30s for Lambda
});

interface Event {
  url: string;
  bytes?: number;
}

export async function handler(event: Event) {
  const limit = event.bytes ?? 4096;
  try {
    const res = await client.fetch(event.url);
    const body = await res.text();
    return { statusCode: res.status, body: body.slice(0, limit) };
  } catch (err) {
    if (err instanceof FetchTimeoutError) {
      return { statusCode: 504, body: "timeout" };
    }
    if (err instanceof FetchError) {
      return { statusCode: 502, body: String(err) };
    }
    throw err;
  }
}
```

## HTTP/3 caveat

HTTP/3 over QUIC runs over UDP. **AWS Lambda does not support UDP egress** — as of late 2026, Lambda only allows TCP outbound connections. So `crawl({ http3: factory })`, `connectQuic()`, and `connectHttp3()` all fail at runtime in Lambda: the UDP socket bind fails on the sandboxed network namespace. Verify against current AWS docs before relying on this, but lean toward "does not work" until AWS ships UDP egress generally.

The default path — `fetch()` and `createClient().fetch()` — is TCP + TLS + HTTP/1.1|HTTP/2 (ALPN-negotiated), and works as-is in Lambda with no code changes. If you genuinely need HTTP/3, run on a runtime that supports UDP egress: EC2, ECS, EKS, or a container on Fargate. See [architecture.md](./architecture.md) for how the HTTP/3 path is structured and why it is a separate code path from default `fetch()`.

## Connection reuse across invocations

Lambda execution contexts are reused across invocations — the "warm" path. Creating a `FetchClient` at module scope (as the handler above does) lets the underlying TCP+TLS connection pool survive across invocations, saving the handshake cost on warm requests. Three caveats:

1. A fresh cold start pays the handshake cost again — the pool is per-execution-context.
2. Lambda can freeze the context at any point, killing any in-flight request mid-flight. Always consume or cancel the response body; an abandoned response can leak the connection.
3. Don't assume the client survives. Wrap calls in `try/catch` and re-create on a `ProtocolError` so the next invocation starts with a fresh pool:

```typescript
import {
  createClient,
  PROFILES,
  ProtocolError,
} from "browsersmith";

let client = createClient({ profile: PROFILES["chrome-140"] });

export async function handler(event: { url: string }) {
  try {
    const res = await client.fetch(event.url);
    return res.status;
  } catch (err) {
    if (err instanceof ProtocolError) {
      // The pool may have been killed by a freeze — re-create for
      // the next invocation, then surface this failure to Lambda.
      client = createClient({ profile: PROFILES["chrome-140"] });
    }
    throw err;
  }
}
```

## Cloudflare Workers and Vercel Edge

browsersmith is Node-only. It imports `node:net`, `node:crypto`, `node:zlib`, `node:dns`, and `node:fs/promises` transitively through `@browsercore/{transport,crypto,compression,fetch}`. Cloudflare Workers and Vercel Edge run on V8 isolates that do not expose those builtins — WebCrypto is available (which matches `@browsercore/crypto`'s assumption), but `node:zlib` is not, so `@browsercore/compression` will throw on the first gzip, deflate, or brotli response. UDP egress for QUIC is also unsupported on both platforms.

For full browsersmith compatibility, stay on a Node 26 Lambda or a Node container on Fargate. If you need a Workers or Edge deployment, plan to swap the compression layer (and probably the transport) for V8-isolate-compatible implementations — see [packages.md](./packages.md) for the swappable-interface contract.

## Footprint summary

| Runtime | Bundle size | Cold start | HTTP/3? | Notes |
|---|---|---|---|---|
| AWS Lambda (Node 26) | Low hundreds of KB min+gz | Module load only | No (no UDP egress) | Primary target. No Lambda Layer needed. |
| AWS Fargate (Node container) | Same bundle | Same, plus container pull | Yes | Use when you need HTTP/3 or long-running sessions. |
| Cloudflare Workers | n/a — V8 isolate | n/a | No | `node:zlib` / `node:net` unavailable. Not supported. |
| Vercel Edge | n/a — V8 isolate | n/a | No | Same constraints as Workers. Not supported. |

## Sources

- Worklog: Task `1-repo-browsersmith` — `package.json` is ESM-only, Node ≥ 26, zero non-`@browsercore` runtime deps; `createClient()` is synchronous; `FetchError` / `FetchTimeoutError` / `ProtocolError` re-exported from `@browsercore/fetch`.
- Worklog: Task `1-repo-compression` — wraps `node:zlib` sync APIs; fails on V8 isolates without `node:zlib`.
- Worklog: Task `1-repo-crypto` — wraps `node:crypto`; Node-only.
- Worklog: Task `1-repo-transport` — TCP-only transport; no UDP support in the default transport layer.
- Worklog: Task `1-repo-quic` — QUIC runs over UDP via an injected `DatagramTransport`; incompatible with runtimes that block UDP egress.
- Worklog: Task `1-R2` — curl-impersonate (native binary + BoringSSL, no Lambda Layer published), CycleTLS (Go subprocess, does not survive Lambda freeze/thaw), puppeteer-extra-stealth (1-3s Chromium cold start on Lambda).
