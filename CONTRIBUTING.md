# Contributing to BrowserCore

Thank you for wanting to contribute — this project is MIT-licensed and every kind of contribution is welcome: **bug reports, fingerprint reproductions, docs, golden captures, and code**. This guide is written to keep the entry bar low on purpose. You don't need to understand the whole 18-repo architecture to fix one typo, one bug, or file one great report.

> **TL;DR**
> - **Found something broken?** [Open an issue](#filing-issues) — a template guides you, and most fields are optional.
> - **Have a question?** [Start a Discussion](https://github.com/jverneuer/browsersmith/discussions) — no wrong questions.
> - **Want to change code?** [Dev setup takes ~10 minutes](#your-first-code-contribution-dev-setup), per repo.
> - **Security issue?** Never in public — see [SECURITY.md](SECURITY.md).

## Ways to contribute (no code required)

Some of the most valuable contributions here don't touch source at all:

- **Fingerprint reproductions** — run a real browser and BrowserCore against the same endpoint and compare (TLS ClientHello, HTTP/2 SETTINGS, header order…). Even one output pair can nail down a divergence. Captures of real browsers become **golden captures** in `@browsercore/testing` and drive the whole project's parity gates.
- **Bug reports** — a rough report beats no report. The templates make it easy; don't polish, just file.
- **Docs** — READMEs, `docs/`, the knowledge base in browsersmith's `docs/kb/`. If something confused you, the next person will be confused too — fix it.
- **Profile data** — new or corrected browser impersonation profiles (`@browsercore/profiles`) are data contributions; a PR that only touches profile JSON is very welcome.
- **Triage** — confirm ("this reproduces for me on Node 26"), or add detail to existing issues. That's real signal for the maintainer.
- **Ideas** — open a Discussion. Ideas in issues get lost; ideas in Discussions become roadmap items.

## Code of Conduct

Be decent. In short: be kind, assume good faith, criticize code not people, no harassment. The full text is in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and applies to issues, PRs, Discussions and every project space.

## Filing issues

Every repo in the family has issue templates (**bug report**, **feature or idea**, **question**) with mostly-optional fields, and blank issues are still enabled — file whatever you have.

What makes a report actionable in *this* project specifically:

- **The protocol layer** (TLS / HTTP/1.1 / HTTP/2 / HTTP/3) or "fetch/cookies" — the templates give you a dropdown
- **The browser profile involved**, if any (e.g. `chrome-131`) — or say it's profile-independent
- **A real-browser comparison** — the golden question of this project is *"what does actual Chrome/Firefox/Safari do here?"* If you can paste both outputs, that's usually 80% of the debugging done
- **Package versions** — `npm ls @browsercore/<pkg>`

Look for the [`good first issue`](https://github.com/jverneuer/browsersmith/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/jverneuer/browsersmith/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) labels across the repos if you want to pick something up.

## Your first code contribution (dev setup)

**Prerequisites:** Node ≥ 26 and npm (we use plain npm — no pnpm, no yarn), and git. That's all.

**The key fact that keeps this easy:** all `@browsercore/*` dependencies resolve from npm, so each repo builds and tests standalone. You do **not** need to clone the whole family, set up workspaces, or link packages to contribute to a single repo.

```sh
git clone https://github.com/jverneuer/browsercore-http2   # whichever repo your issue is about
cd browsercore-http2
npm install
npm run typecheck && npm run lint && npm test && npm run build
```

Every repo has the same script set (`build`, `typecheck`, `lint`, `test` — plus occasional extras), so this loop works identically everywhere.

Then:

1. Create a branch (naming below), fix the thing, add a test.
2. Run the loop above until green.
3. Push and open a PR. CI runs the same checks plus a coverage gate.

## The project at a glance (18 repos, 6 layers)

BrowserCore is a family of small, focused packages with a strict dependency DAG — a package may only import from layers **below** its own. `browsersmith` (this repo) wires everything into one browser-impersonated HTTP client.

| Layer | Repo | npm package | What it is |
|---|---|---|---|
| 0 | [browsercore-contracts](https://github.com/jverneuer/browsercore-contracts) | `@browsercore/contracts` | Shared types & branded IDs; zero runtime |
| 0 | [browsercore-compression](https://github.com/jverneuer/browsercore-compression) | `@browsercore/compression` | Compression as browsers use it |
| 0 | [browsercore-crypto](https://github.com/jverneuer/browsercore-crypto) | `@browsercore/crypto` | Browser-identical crypto primitives |
| 0 | [browsercore-cookies](https://github.com/jverneuer/browsercore-cookies) | `@browsercore/cookies` | Cookie jar with browser semantics |
| 0 | [browsercore-profiles](https://github.com/jverneuer/browsercore-profiles) | `@browsercore/profiles` | Impersonation profiles (the fingerprint data) |
| 0 | [browsercore-dev](https://github.com/jverneuer/browsercore-dev) | `@browsercore/dev` | Shared tooling & CI presets (internal) |
| 1 | [browsercore-proxy](https://github.com/jverneuer/browsercore-proxy) | `@browsercore/proxy` | SOCKS5/HTTP proxy support |
| 1 | [browsercore-transport](https://github.com/jverneuer/browsercore-transport) | `@browsercore/transport` | Low-level socket transport |
| 2 | [browsercore-tls](https://github.com/jverneuer/browsercore-tls) | `@browsercore/tls` | Browser-identical TLS (ClientHello, JA3/JA4) |
| 2 | [browsercore-http1](https://github.com/jverneuer/browsercore-http1) | `@browsercore/http1` | HTTP/1.1 with browser header ordering |
| 2 | [browsercore-http2](https://github.com/jverneuer/browsercore-http2) | `@browsercore/http2` | HTTP/2 with profile-seeded SETTINGS & HPACK |
| 2 | [browsercore-crawlee](https://github.com/jverneuer/browsercore-crawlee) | `@browsercore/crawlee` | Crawlee integration (impersonated scraping) |
| 3 | [browsercore-fetch](https://github.com/jverneuer/browsercore-fetch) | `@browsercore/fetch` | `fetch()` with browser semantics |
| 3 | [browsercore-quic](https://github.com/jverneuer/browsercore-quic) | `@browsercore/quic` | QUIC transport with browser handshakes |
| 4 | [browsercore-http3](https://github.com/jverneuer/browsercore-http3) | `@browsercore/http3` | HTTP/3 over QUIC |
| 4 | [browsercore-testing](https://github.com/jverneuer/browsercore-testing) | `@browsercore/testing` | Golden captures & E2E traffic gates |
| 4 | [browsercore-devtools](https://github.com/jverneuer/browsercore-devtools) | `@browsercore/devtools` | Debugging & inspection tools |
| 5 | **browsersmith** (here) | `browsersmith` | Composition root — the full client |

Deeper background: [PACKAGES.md](PACKAGES.md), the [architecture doc](docs/architecture.md), and the [glossary](docs/glossary.md).

## Making changes

### Branch names

`type/slug`, lowercase with hyphens — e.g. `fix/hpack-overflow`, `feat/quic-0rtt`, `docs/preface`. Valid types: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`.

### Commit messages — Conventional Commits

`feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `test:`, `ci:`, `chore:`, optionally scoped — `fix(http2): reject SETTINGS frame larger than 14,557,376`. These are **load-bearing**: GitHub Release notes and changelogs are generated from them on every release.

### Tests & coverage

Tests use vitest, living in `tests/`. CI enforces each repo's coverage gate (≈93–94% statements/branches/functions/lines — see the repo's `vitest.config.ts`). A behavior change should come with a test; if the gate dips, either cover the new code or the PR won't merge. If you're unsure how to test something, open the PR anyway and ask — that's a solvable problem, not a rejection.

### Code style

The canonical standard is [`CODING_STANDARDS.md` in browsercore-dev](https://github.com/jverneuer/browsercore-dev/blob/main/CODING_STANDARDS.md) (copies live in most repo roots). The short version:

- Strict TypeScript always — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are non-negotiable
- **No `any`** — external data is `unknown`, then validated
- Discriminated unions for state, branded types for IDs, `readonly` everywhere, exhaustive switches with `assertNever`
- Lint is `oxlint --type-aware` with zero warnings (CI runs `--deny-warnings`); style rules are intentionally off — correctness only

### Docs

If a PR changes public behavior or API, update the README in the same PR. It's in the checklist; nobody's going to reject over it, but it keeps the docs true.

## Opening the pull request

- **Title in Conventional Commits style** (`fix: …`, `feat: …`) — the template reminds you.
- CI runs: typecheck → lint → tests + coverage gate → build. Green there means the review is about the code, not the mechanics.
- **Reviews:** the maintainer aims to respond within a few days. Keep PRs small when you can; a 30-line focused PR beats a 900-line epic.
- **You will never be asked for a CLA or signing.** MIT in, MIT out.

### Version bumps & auto-publish (or: why CI asks about versions)

Merging to `main` **with a bumped `package.json` version** triggers an automatic npm publish (via OIDC provenance — no tokens), a git tag, and a GitHub Release whose notes are generated from the conventional commits. Project rules:

- **Patch-only by default** — and never skip a number (`0.2.1 → 0.2.3` is forbidden)
- Minor/major bumps are a maintainer decision — just ask
- **Docs/tests/CI-only PRs: don't bump.** Publish skips and nothing happens.

**First-time contributor?** Ignore all of this. Focus on the change; if a bump is needed, the maintainer will handle or guide it. The PR checklist marks it optional for non-code changes.

## Multi-repo changes (advanced)

Sometimes a fix spans two repos (say, a contract change in `@browsercore/contracts` plus its use in `@browsercore/http2`).

1. Clone both repos. Point the downstream at your local upstream with `file:` refs in `package.json` and develop/test locally.
2. **Before opening PRs, revert the `file:` refs to published semver.** CI (and the maintainer's `validate-pr` tooling) rejects local refs — they're scratch-space only.
3. Releases cascade **bottom-up through the DAG (layer 0 → 5)**: an upstream package must be published before a downstream can depend on the new version.
4. If your PR depends on an unpublished upstream PR, say so in the body and **don't bump your downstream version yet** — the maintainer sequences the merges.

Maintainers can pre-flight a PR with the repo-graph validator: `npx tsx scripts/validate-pr.ts --repo ../<repo> --branch <branch>` from a `browsercore-dev` clone.

## AI-assisted contributions

Explicitly welcome — this project itself is largely built with AI agents, so contributions are judged on the result, not the tooling. One line of disclosure in the PR description ("written with Claude/GPT/…") is enough. The review bar is identical: correct code, tests, no credential leakage, honest commit history.

## Where to ask, and what happens next

- **Questions / ideas / "am I doing this right?"** → [Discussions](https://github.com/jverneuer/browsersmith/discussions)
- **Bugs** → issue templates in the relevant repo
- **Security** → [SECURITY.md](SECURITY.md), privately

After you open an issue or PR: triage within a few days, CI feedback within minutes, and a real human (well — a human *driving* agents) reading your report. Contributors are credited in the release notes of every release their work lands in; your PR is the ledger.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) — same as the project, no strings.
