# Learning HUB — Architecture

This document describes how the monorepo fits together, the one canonical review pipeline every surface shares, the event bus that lets the product grow, and the extension points (plugins, AI providers). The verified API details live in [`docs/ENGINE-REFERENCE.md`](docs/ENGINE-REFERENCE.md); the science in [`docs/PLAN-RESEARCH.md`](docs/PLAN-RESEARCH.md).

## The monorepo map

npm workspaces: `packages/*` + `apps/*`.

```
learning-HUB/
├── packages/
│   ├── core/           # Pure domain logic. No I/O. No AI SDK. No app imports.
│   │   ├── fsrs.ts         # ts-fsrs 6 wrapper (FSRS-6, desired retention 0.9)
│   │   ├── bkt.ts / elo.ts # Bayesian Knowledge Tracing + Puzzle-Elo
│   │   ├── xp.ts / streaks.ts / motivation.ts / physio.ts
│   │   ├── cards.ts / linter.ts   # 8 card formats + 20-Rules linter
│   │   ├── curriculum.ts / review.ts / analytics.ts / games.ts / memory.ts / language.ts / ideas.ts / notes.ts / reading.ts / journal.ts / weekly.ts / habits.ts / focus.ts / media.ts
│   │   ├── anki.ts / anki-export.ts    # Anki import (.apkg/.txt) + export
│   │   ├── ai.ts / ai/             # AIClient port, prompt library, manual modes
│   │   ├── events.ts / plugin.ts / plugin-loader.ts   # ← the extension points
│   │   └── types.ts        # zod-validated shared shapes
│   ├── db/             # Persistence. Owns every transaction.
│   │   ├── schema.ts       # 45 tables, JSON columns typed, append-only logs
│   │   ├── index.ts        # WAL pragmas, ensureSchema migrations, stat views
│   │   ├── review-service.ts  # ← THE canonical review pipeline
│   │   ├── transaction.ts  # withTransaction (BEGIN IMMEDIATE, sync-only)
│   │   ├── backup.ts       # live snapshot + JSON archive + restore
│   │   └── paths.ts        # $LEARNING_HUB_DB or walk-up → data/learning-hub.db
│   └── ai-adapters/    # The ONLY package that imports ai / @ai-sdk/*
│                       # anthropic · openai · openai-compatible · ollama · custom-endpoint
├── apps/
│   ├── web/            # Next.js 16 App Router (React 19, Tailwind 4, TanStack Query, zustand)
│   │   ├── app/api/**/route.ts  # REST route handlers (zod boundary, withRoute)
│   │   └── src/components/      # client islands, command palette, transport panel…
│   ├── server/         # Headless REST server — Node 22+ native node:http, no framework
│   ├── mcp/            # MCP stdio server: 14 tools + 3 resources (@modelcontextprotocol/sdk)
│   └── cli/            # terminal adapter
├── plugins/            # loaded by EVERY host at boot (example-echo is the reference)
├── tests/e2e/          # opaque-box E2E suite (helpers + tiers 1-4) — see docs/TEST_INFRA.md
└── docs/               # reference documentation (see the table below)
```

### The dependency rule

```
apps/*  →  packages/{core,db,ai-adapters}
packages/db  →  packages/core
packages/ai-adapters  →  packages/core  (+ the AI SDK)
plugins/*  →  packages/core only
```

- `packages/core` is the bottom of the graph: pure functions + zod schemas + the event bus + the plugin contract. `grep "from 'ai'" packages/core/src` must always come back empty (test-enforced).
- `packages/db` is the only writer of SQLite; every multi-row write goes through `withTransaction` or the review service.
- `packages/ai-adapters` is the only AI-SDK importer; hosts import it once and its factories register into core's registry.
- Hosts (web / server / mcp / cli) are thin: they adapt transport (HTTP / stdio / terminal) and delegate to the same brain. That is why the MCP tool, the CLI command, the REST route and the headless server endpoint all produce identical outcomes for the same grade.

### Reference documentation

| Document | Contents |
| --- | --- |
| [`docs/ENGINE-REFERENCE.md`](docs/ENGINE-REFERENCE.md) | Verified third-party APIs (ts-fsrs 6, AI SDK 7, MCP SDK) + DB/project conventions |
| [`docs/TEST_INFRA.md`](docs/TEST_INFRA.md) | The E2E harness: isolation strategy, tiers, execution commands |
| [`docs/ai-providers.md`](docs/ai-providers.md) | AI port + registry, custom-endpoint HTTP contract, prompt transport, manual modes |
| [`docs/plugins.md`](docs/plugins.md) | Plugin contract, event catalog, MCP/CLI contributions, distribution, testing |
| [`docs/api-server.md`](docs/api-server.md) | Headless server: endpoints, env config, webhooks, auth model |
| [`docs/PLAN-RESEARCH.md`](docs/PLAN-RESEARCH.md) | The research behind each subsystem, with primary sources |

## The canonical review pipeline

Every surface — Web UI, headless REST server, MCP tool, CLI, matching games — grades a card through the **same** entry point: `executeReview()` in `packages/db/src/review-service.ts` (`executeBatchReview()` for N cards). There is exactly one place where a grade mutates state:

1. **Load & validate** — the card row and the user's desired retention; payload zod-validated at each transport boundary before it reaches the service.
2. **Snapshot** — the pre-review card state (returned alongside the result so UIs can diff).
3. **One atomic transaction** (`withTransaction`, `BEGIN IMMEDIATE`, strictly synchronous — async work happens before it, an async callback is a compile-time error):
   - FSRS-6 scheduling via ts-fsrs (`DefaultScheduler`, FSRS-6, retention 0.9) → next card state,
   - append-only `revlog` row (with predicted retrievability for calibration),
   - XP event (`xp_events`) + level-ups,
   - streak update (existing `current`/`best` preserved, freezes/amulet rules applied),
   - Elo ladder + BKT mastery updates for the card's skills (`elo_events` append-only),
   - commitment-contract / quest bookkeeping where applicable.
   Any failure rolls the whole grade back — a review either fully lands or not at all.
4. **After the commit** — `review.completed` (per card) and `review.batch.completed` are emitted on the event bus. Listeners therefore always observe durable state and can never corrupt the transaction that produced the fact.

This is also the reason the append-only tables exist: `revlog`, `xp_events`, `friction_events`, `elo_events` are INSERT-only, and the derived stat views (`v_true_retention`, `v_daily_reviews`, `v_xp_daily`) are computed over them by SQL — true retention is never an editable number.

## The event bus

`packages/core/src/events.ts` defines a typed, synchronous, in-process bus over the `HubEventMap` catalog. Design rules:

- **Facts, not commands.** Payloads are small serializable facts committed by their emitter (`review.completed` `{ cardId, grade, xpEarned }`, `streak.updated`, `streak.broken`, `card.created`, `focus.completed`, `quest.completed`, `goal.completed`, `habit.checked`, `achievement.unlocked`, `review.batch.completed`). An emitter publishes *after* its transaction commits.
- **Adding a catalog entry is how a new extension point is born.** The emitter lives in the subsystem that commits the fact; never repurpose an existing event's payload shape — add a new event.
- **Synchronous dispatch, listener isolation.** `emit` returns after every listener has run; a throwing listener is caught, logged (`[events] listener for "<event>" threw:`) and never breaks the emitter, the transaction, or the other listeners. Listeners added during an emit take effect on the next emit (snapshot iteration).
- **Consumers:**
  - plugins, via `ctx.events` (`on` / `off` / `once` only — plugins never `emit`),
  - the headless server, which forwards subscribed events as webhook POSTs (`LEARNING_HUB_WEBHOOKS`, 3 s timeout, failures are logged and never fatal) — see [`docs/api-server.md`](docs/api-server.md).

## Plugin extension points

Hosts load plugins at boot (web exposes `ensurePluginsLoaded()` cached on `globalThis`; MCP, CLI and the server call `loadPlugins(['plugins'])` in `main()`). A plugin is one `setup(ctx)` function validated by zod at load time; failures are isolated (logged with a `[plugins]` prefix, the host still boots, duplicates are skipped by name).

Inside `setup(ctx)` a plugin can:

- **react to platform events** — `ctx.events.on('review.completed', …)`,
- **contribute MCP tools** — push `{ name, description, inputSchema (zod raw shape), handler }` into `ctx.mcpTools`; the MCP server registers built-ins first and wraps throwing handlers as `isError` results,
- **contribute CLI commands** — push `{ name, description, run(args) }` into `ctx.cliCommands`.

Distribution is a folder in `plugins/` or an npm package passed to `registerPlugin`. The full contract, the versioning guidance and the testing recipe are in [`docs/plugins.md`](docs/plugins.md).

## AI extension points

The AI architecture is port-and-adapter around one interface (`AIClient`: `generateJSON` with a zod schema, `generateText`, optional `streamChat`):

- **The port + registry** live in `packages/core` (`registerAIProvider` / `getAIProvider` / `listAIProviders`). `provider: 'none'` is the default and returns null — callers then show the manual mode.
- **The adapters** live in `packages/ai-adapters` — the only module allowed to import the AI SDK — registering `anthropic`, `openai`, `openai-compatible`, `ollama` and `custom-endpoint` at import time. `custom-endpoint` turns any HTTP service into a provider through a documented JSON envelope (`{ v, feature, system, prompt, schema }` → `{ result }`).
- **Prompt transport** — every AI feature's prompt can be fetched as a self-contained envelope (`GET /api/ai/transport?feature=…`) and its reply POSTed back for validation (`POST /api/ai/transport { feature, result }`) — the same zod schema an in-process provider must satisfy, so "copy-paste into any chatbot" is a first-class provider.
- **Manual modes** — `packages/core/src/ai/manual.ts` defines, for every entry in `AI_FEATURES`, a structured manual alternative; `assertEveryFeatureHasManualMode()` makes drift impossible. This is why AI is optional rather than merely disabled.

Extension recipes (new provider, new feature, new Settings fields) are in [`docs/ai-providers.md`](docs/ai-providers.md).

## Toolchain note: TypeScript side-by-side

TypeScript 7.0 ships **no JS API** — the native compiler (`tsc`) only. JS-API-based tooling (`typescript-eslint`, drizzle-kit, Next's build-time checks) therefore runs against **TypeScript 6.0.3** through Microsoft's official side-by-side package: the `typescript` module name is aliased to `@typescript/typescript6` in the root manifest (with a matching `overrides` entry so every workspace resolves the same API). `tsc` is provided by the same TS 6.0.3 package, and the whole repo typechecks cleanly under it — see `docs/ENGINE-REFERENCE.md` for the exact installed versions. If a future TypeScript release (7.1+) restores a stable JS API, the alias can be dropped.

## Data conventions

- SQLite in WAL mode at `data/learning-hub.db` (override with `LEARNING_HUB_DB`; the path resolver walks up from cwd to the repo root). Images under `data/images/`.
- Dates are ISO-8601 strings; day keys are `YYYY-MM-DD` (UTC-bucketed, `dayKey(date, offsetMinutes)` honors a local tz offset where a surface needs local days, e.g. the weekly report).
- JSON columns are typed with drizzle's `mode: 'json'` + `$type<T>()`.
- Schema evolution is idempotent (`ensureSchema` adds columns/indexes on first connection; fresh machines create the schema with `npm run db:push`).

## Testing strategy

- **Unit / property** — `packages/core/tests` (vitest + fast-check where the logic is mathematical: FSRS golden values, Elo, BKT, streaks, linter, …).
- **Opaque-box E2E** — `tests/e2e` invokes route handlers through standard `Request`/`Response`, the CLI as a subprocess (`node --import tsx`, no `.cmd` assumptions — Windows and Linux CI both work), the MCP server over JSON-RPC stdio, and DB pragmas/views directly. Each file gets a unique DB clone under `data/test-dbs/`; the developer database is never mutated. See [`docs/TEST_INFRA.md`](docs/TEST_INFRA.md).
- **CI** — `.github/workflows/ci.yml` runs typecheck, lint, workspace unit tests, the full E2E suite and the production build on Node 22 / ubuntu-latest for every push and PR.
