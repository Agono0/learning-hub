# Interface contracts (The Architect)

> The stable seams other agents and hosts build against. Each contract states:
> where it lives, what crosses it, its invariants, and how it is enforced.
> If you add a parameter, a payload field or a route here, change this file in
> the same commit. The short version of every contract: **pure logic in core,
> one query layer in db, runtime-neutral handlers, thin hosts.**

## C1 · Package dependency graph (never invert)

```
apps/* → packages/{core, db, ai-adapters}     db → core     ai-adapters → core
plugins/* → core only
core → (nothing app-specific, nothing AI-SDK)
```

Enforced by ESLint + `packages/core/tests/architecture.test.ts` (imports) and
`packages/db/tests/rules-guard.test.ts` (grading path). Importing a workspace
package from `core` fails the architecture guard; importing `ai`/`@ai-sdk/*`
anywhere but `packages/ai-adapters` fails both.

## C2 · One grading path

`executeReview` / `executeBatchReview` (`packages/db/src/review-service.ts`)
are the only writers of FSRS state, `revlog`, `xp_events`, streak, Elo and BKT.
Mastery/Elo writes outside `mastery-service.ts` fail `rules-guard.test.ts`.
Append-only tables (`revlog`, `xp_events`, `friction_events`, `elo_events`) are
INSERT-only; undo is tombstone rows in `revlog_undos`, and **every** derived
query must exclude undone reviews via the shared repos (see C3) — not by
hand-writing the `NOT EXISTS` clause again.

## C3 · Shared queries live in `packages/db/src/repos/`

The contract for any query needed by two hosts:

- Function lives in `packages/db/src/repos/<domain>.ts`, exported via
  `repos/index.ts` → `@learning-hub/db`.
- Signature convention: plain (sync) function, `database?: LearningHubDB` last
  parameter defaulting to `getDb()`, zod-free (validation belongs to
  transports), returns plain row objects.
- Undo-exclusion, joins and filters are defined ONCE here.
- Current canonical query families: cognitive trials
  (`getRevlogTrialRows`, `reconstructCorrectionTrials`) — see
  `repos/cognitive-trials.ts` for the reference implementation.

Reference consumers: web handlers, `apps/server/src/routes.ts`, MCP tools,
CLI commands.

## C4 · Runtime-neutral handlers (web backend)

`apps/web/src/server/handlers/**/route.ts` export `withRoute`-wrapped
`GET/POST/...`; bodies parsed with `readJson(req, schema)` (`@/lib/api`);
errors always map to the ApiError JSON envelope. No `node:*`, `fs`, `path`,
`better-sqlite3` imports (ESLint-enforced); Node-only work goes behind an
injected port (`src/server/storage.ts`, `src/server/net.ts`). Every route
module is registered in `src/hub/handlers-registry.ts` (test-enforced:
`apps/web/tests/hub-registry.test.ts`), and `app/api/**/route.ts` files are
1–2-line re-export shims only.

## C5 · Transport seam (UI → backend)

UI code calls **only** `apiGet / apiSend / apiUpload / apiStream / apiDownload`
from `apps/web/src/lib/transport.ts`. The transport decides browser-fetch vs
Tauri hub-worker RPC at runtime; raw `fetch` in UI breaks native builds and
fails ESLint. Client query keys: prefer a typed key factory per feature
(`lib/curriculum-api.ts` `curriculumKeys` is the reference); no new ad-hoc
string keys for shared resources.

## C6 · Event bus

`packages/core/src/events.ts` — typed, synchronous, in-process. Emitters
publish **facts after commit**; payloads are small and serializable; adding a
catalog entry is the way to create an extension point (never repurpose an
existing payload shape). Plugins get `on/off/once` only — never `emit`.
Listener exceptions are isolated by design; do not rely on listener ordering.

## C7 · AI port and manual modes

Consumers know only `AIClient` (`packages/core/src/ai/port.ts`) +
`requireAI()`; providers are registered by `packages/ai-adapters` at import
time (`provider: 'none'` → manual mode). Every AI feature MUST have a manual
mode entry in `packages/core/src/ai/manual.ts` (`assertEveryFeatureHasManualMode()`
is test-enforced) and prompts live in `packages/core/src/ai/prompts.ts`
(`AI_FEATURES`). Schemas for AI replies are zod, shared with the prompt
transport endpoint.

## C8 · Cross-host input schemas come from core

Engine input schemas (e.g. `generationTrialInputSchema`) are exported from the
core domain and re-used by every host — a host MUST NOT re-declare a payload
schema that a core domain already defines (drift example: ZPD defaults).
New cognitive endpoints: add the schema next to the engine, import it in the
web handler, the server route table, the MCP tool and the CLI flags.

## C9 · Plugin contract

`definePlugin({ name, version, setup(ctx) })`, zod-validated at load,
failures isolated; `ctx.events` (C6), `ctx.mcpTools`, `ctx.cliCommands`
contributions. Package may depend on `@learning-hub/core` only. Reference:
`plugins/example-echo`.

## C10 · Schema and migration discipline

Schema changes = `packages/db/src/schema.ts` + a migration in
`packages/db/src/migrations/` appended to `MIGRATIONS` (never renumber);
append-only tables stay append-only (ADR 0002). LHCF curriculum JSON is a
public, additive-only contract (ADR 0003).

## C11 · Native origin invariants

Never change `identifier` or `useHttpsScheme` in
`apps/native/src-tauri/tauri.conf.json` — user data lives in OPFS scoped to
the origin. UI never renders untrusted HTML (use `<Markdown>` from `@/ui`).
