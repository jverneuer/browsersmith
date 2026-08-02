# @network — a modular TypeScript networking stack

A complete, modular networking stack written entirely in TypeScript. Every protocol layer
above the transport is owned and implemented in user space, giving you full observability and
control — and the ability to reproduce the observable behavior of real browsers.

> **Scope note.** Because the stack owns every layer down to the transport, it is capable of
> interacting with website security mechanisms at the protocol level by design. The packages
> are also intended to be composed into higher-level browser-automation and rendering systems.
> See [VISION.md](./VISION.md).

## Packages

Implemented bottom-up. Each package is independently testable, versionable, and documented.

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@network/transport` | Byte-stream transport (TCP, DNS, backpressure) | `node:net` |
| `@network/crypto` | Crypto primitives abstraction | `node:crypto` |
| `@network/tls` | TLS 1.3/1.2 client (record layer, handshake, key schedule) | `transport`, `crypto` |
| `@network/http1` | HTTP/1.1 over any duplex stream | `transport` |
| `@network/http2` | HTTP/2 framing + HPACK + flow control | `transport` |
| `@network/profiles` | Browser fingerprint definitions (Chrome, Firefox, Safari, Edge) | _(none)_ |
| `@network/cookies` | RFC 6256 cookie jar | _(none)_ |
| `@network/fetch` | Developer-facing API composing everything above | all of the above |
| `@network/testing` | RFC compliance, golden packets, benchmarking | all packages |
| `@network/devtools` | Packet inspector, visualizers, CLI | all packages |

### Dependency graph

```
@network/fetch
  └─ @network/http2   @network/http1   @network/cookies   @network/profiles
        └─ @network/tls
              └─ @network/crypto   @network/transport
                    └─ node:net / node:crypto
```

Edges point upward only — a package never imports from anything above it.

## Quick start

```ts
import { fetch } from "@network/fetch";

const response = await fetch("https://example.com", {
    profile: "chrome-140",
});

console.log(response.status, await response.text());
```

## Repository layout

```
.
├── package.json            # npm workspaces root
├── tsconfig.base.json      # strict compiler settings shared by all
├── vitest.workspace.ts     # vitest workspace config
├── CODING_STANDARDS.md     # TypeScript rules every package follows
├── VISION.md               # project vision and scope
└── packages/
    ├── transport/   # @network/transport
    ├── crypto/      # @network/crypto
    ├── tls/         # @network/tls
    ├── http1/       # @network/http1
    ├── http2/       # @network/http2
    ├── profiles/    # @network/profiles
    ├── cookies/     # @network/cookies
    ├── fetch/       # @network/fetch
    ├── testing/     # @network/testing
    └── devtools/    # @network/devtools
```

## Conventions

Every package follows [`CODING_STANDARDS.md`](./CODING_STANDARDS.md):

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- No `any` — unknown external data is validated at the boundary (Zod)
- Branded/opaque ID types, discriminated unions, `readonly` data
- Exhaustive switches via `assertNever`
- Typed errors that are part of the API
- ESM, NodeNext resolution, `.js` extension on relative imports

## Scripts (root)

```bash
npm install            # install across all workspaces
npm run build          # tsc --build every package
npm test               # vitest run across all packages
npm run typecheck      # tsc --build --force
```
