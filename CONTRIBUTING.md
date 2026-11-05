# Contributing to Learning HUB

Thanks for considering a contribution! This document covers dev setup, where things live, the code standards every PR is held to, and the paths to contribute a feature, a plugin or an AI provider.

## Dev setup

Requirements: **Node ≥ 22** (CI runs on Node 22), npm 11.

> Toolchain note: the `typescript` module resolves to the TS 6 JS API (`@typescript/typescript6` — TS 7.0 ships no JS API, so linters need the 6.x API side-by-side). You don't have to do anything; this is already wired up in the root manifest.

```bash
git clone <your fork> && cd learning-HUB
npm install
npm run db:push    # create the SQLite schema at data/learning-hub.db (optional: ensureSchema self-creates)
npm run db:seed    # quotes + achievements + defaults (idempotent)
npm run dev        # http://localhost:3000
```

Before opening a PR, run the checks (the CI runs exactly these):

```bash
npm run check              # typecheck + unit tests across all workspaces
npm run lint               # ESLint
npm run test:e2e           # opaque-box E2E suite — see docs/TEST_INFRA.md
npm run build              # production build
```

The E2E suite never touches your real database: each test file runs against a unique clone under `data/test-dbs/`.

## Workspace map

| Path | What it is | Rules of thumb |
| --- | --- | --- |
| `packages/core` | Pure domain logic: FSRS-6 wrapper, BKT/Elo, XP, streaks, card linter, AI prompt library, **event bus + plugin loader** | No I/O, no app imports. Zero AI SDK imports (test-enforced). zod-validate exported shapes. |
| `packages/db` | better-sqlite3 + drizzle-orm schema, canonical review service, transaction helpers, backup | Owns every transaction. Writes are atomic and synchronous (`withTransaction`). |
| `packages/ai-adapters` | AI SDK factories: anthropic / openai / openai-compatible / ollama / custom-endpoint | The **only** package allowed to import `ai` / `@ai-sdk/*`. Registers into core's provider registry at import time. |
| `apps/web` | Next.js 16 App Router UI + REST API (`app/api/**/route.ts`) | Server components query `db` directly; client islands fetch `/api/...` via TanStack Query. |
| `apps/mcp` | MCP stdio server — 14 agent-accessible tools + resources | Tools validate args with zod raw shapes. |
| `apps/server` | Headless REST server over Node `node:http` | Same brain, no web framework; zod at every boundary. |
| `apps/cli` | Terminal adapter | Reuses core + db; no direct SQL beyond the shared services. |
| `tests/e2e` | Opaque-box E2E harness (API, CLI, MCP, DB) | Helpers spawn children as `node --import tsx <path>` — never bare `npx` (Windows-safe, works on Linux CI). |
| `plugins/` | Loaded by every host at boot | `example-echo` is the reference. |

`docs/` holds the living docs — start from the [index](docs/README.md): [`ENGINE-REFERENCE.md`](docs/ENGINE-REFERENCE.md) (verified APIs), [`TEST_INFRA.md`](docs/TEST_INFRA.md) (E2E harness), [`learning-science.md`](docs/learning-science.md) (technique → code map), [`PLAN-RESEARCH.md`](docs/PLAN-RESEARCH.md) (the science), [`ai-providers.md`](docs/ai-providers.md), [`plugins.md`](docs/plugins.md), [`api-server.md`](docs/api-server.md). Design rationale lives in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Code standards

The codebase is held to four hard rules — reviewers will ask for them:

1. **Strict TypeScript.** `tsc --noEmit` must pass in every workspace. No `any` at new boundaries; prefer `unknown` + narrowing or a zod-validated type.
2. **JSDoc on exports.** Every exported symbol carries a JSDoc comment saying what it does and (where it matters) its units and invariants. This is how the codebase documents itself for MCP surfaces and agents.
3. **zod at every boundary.** Anything crossing a trust boundary — HTTP bodies, query params, MCP tool arguments, plugin definitions, AI provider replies — is parsed with zod before use. Route errors should surface zod issue details (`400` + per-field issues), never raw provider errors.
4. **Transactional writes.** Multi-row writes go through `withTransaction` (`packages/db/src/transaction.ts`, `BEGIN IMMEDIATE`) or the canonical review service — never a sequence of bare `db.update`s. Async work happens *before* the transaction; the bus emits only *after* the commit.

Also: dates are ISO-8601 strings, `revlog`/`xp_events`/`friction_events`/`elo_events` are append-only, and every AI feature must have a manual mode (test-enforced) so the app works with `provider: 'none'`.

## PR flow

1. Fork / branch off `main` (name it `feat/…`, `fix/…`, or `docs/…`).
2. Keep PRs focused; one feature or fix per PR.
3. Add or extend tests: unit tests in `packages/core/tests` (vitest + fast-check where the logic is mathematical), E2E coverage in `tests/e2e/` for new API/CLI/MCP surfaces.
4. Update docs when you change behavior: the README section, the relevant `docs/*.md`, and [`CHANGELOG.md`](CHANGELOG.md) under *Unreleased*.
5. Run `npm run check && npm run lint` locally; CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, the E2E suite and the build on every PR — all must be green.
6. Open the PR with a short description of *what changed and why*; link the issue it closes (`Closes #123`).

## Contribution paths

### A. Regular feature / bug fix

- **A learning-engine change** (scheduling, gamification math, analytics) belongs in `packages/core` as a pure function with property/unit tests; the DB layer or a route consumes it.
- **A new API surface**: route handler in `apps/web/app/api/**` (zod boundary, `withRoute`), mirrored into `apps/server` when it is a core learning surface, plus an E2E test.
- **A schema change**: update `packages/db/src/schema.ts`, then `npm run db:push`. Additive columns only for existing tables (see `ensureSchema` for the idempotent migration pattern); never mutate append-only tables.

### B. Plugin (no fork required)

A plugin is one `setup(ctx)` function that can react to events, push MCP tools and push CLI commands — nothing in the kernel changes. Drop it in `plugins/` (or publish it to npm) and every host loads it at boot.

Read [`docs/plugins.md`](docs/plugins.md) for the contract, the event catalog, failure isolation and the test recipe. Start from `plugins/example-echo`. New platform events are added to `HubEventMap` in `packages/core/src/events.ts` and emitted *after* the fact commits.

### C. AI provider

The AI port (`AIClient`) and its registry live in `packages/core`; the SDK adapters live in `packages/ai-adapters` (the only AI-SDK importer). A new provider is a factory `(settings) => AIClient` registered via `registerAIProvider(name, factory)` — in your own package via npm, or as a PR in `@learning-hub/ai-adapters`.

If you are adding an HTTP service, consider `custom-endpoint` instead — it already speaks a documented envelope and may need no code at all. Every new AI *feature* (not provider) must be added to `AI_FEATURES` **and** `MANUAL_MODES` — the pair is the contract. Full checklist: [`docs/ai-providers.md`](docs/ai-providers.md).

## Reporting bugs and proposing features

Use the templates under `.github/ISSUE_TEMPLATE/`. Include reproduction steps and what you expected to happen. Security issues are handled separately — see [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the repository's [MIT License](LICENSE).
