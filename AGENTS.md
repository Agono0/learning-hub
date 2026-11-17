# AGENTS.md — operating manual for Learning HUB

**Read this before changing anything.** It is written for AI coding agents and
applies equally to humans. It tells you what this project is, the rules that
keep it from breaking, and the exact recipes for common changes. When this file
and your instincts disagree, this file wins; when this file and the code
disagree, the code wins — then fix this file in the same change.

---

## 1. What this project is

Learning HUB is an all-in-one, research-backed learning system: spaced
repetition (FSRS-6), curricula you can import from any AI, a practice engine,
mastery tracking (BKT + Elo), focus/habit/motivation tools, notes, reading and
AI tutors. It ships as:

| Target            | Runs                                        | Backend                                   | Database                               |
| ----------------- | ------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| Web               | `npm run dev`                               | Next.js route shims → handlers (Node)     | better-sqlite3, `data/learning-hub.db` |
| Windows / Android | Tauri 2 (`apps/native`)                     | **same handlers** in a webview Web Worker | sqlite-wasm on OPFS                    |
| Agents            | `apps/mcp` (MCP), `apps/cli`, `apps/server` | same `packages/*`                         | same DB                                |

One codebase, every platform. Why: [docs/adr/0001](docs/adr/0001-one-codebase-hub-worker.md).

## 2. Repo map

```
packages/core         Pure domain logic + zod schemas. NO I/O. Bottom of the graph.
  src/<domain>/        New domains live in folders…
  src/<domain>.ts      …with a thin public entry → @learning-hub/core/<domain>
packages/db           The ONLY SQLite writer: schema.ts, migrations/, repos/, review-service.ts
packages/ai-adapters  The ONLY AI-SDK importer (providers, networkFetch seam)
apps/web
  app/<page>/page.tsx  Pages (client components)
  app/api/**/route.ts  Thin shims → src/server/handlers (web target only)
  src/server/handlers  Runtime-neutral backend (Request → Response)
  src/hub/             In-webview backend for native apps (worker, registry, protocol)
  src/lib/transport.ts THE only way UI talks to the backend
  src/ui/              Shared UI kit — use it
  src/components/      App shell + navigation model (nav.ts)
apps/native           Tauri 2 shell (thin Rust: dialogs, fs, http, notifications)
apps/mcp | cli | server  Other hosts over the same packages
apps/worker          Cloudflare worker: rooms, boss raids, library share (deploy: npm run worker:deploy)
apps/extension       Browser extension: quick-add cards, save-to-read, friction capture (M21)
docs/                 Architecture, ADRs, native, curriculum, learning science
scripts/              Build/dev tooling (new-feature, tauri-web, tauri-android…)
```

**Dependency rule** (never invert it):
`apps/* → packages/{core,db,ai-adapters}`, `db → core`, `ai-adapters → core`,
`plugins → core` only. `core` imports nothing app-specific and never `ai`.
`apps/worker` uses `packages/db`-adjacent types only.

## 3. Hard rules — never break these

1. **No raw `fetch` in UI code.** Use `apiGet / apiSend / apiUpload / apiStream / apiDownload`
   from `@/lib/transport`. Raw fetch silently breaks the native apps.
2. **Handlers are runtime-neutral.** No static `node:*`, `fs`, `path`, `better-sqlite3`
   imports in `src/server/handlers`, `src/hub`, `src/lib` (ESLint-enforced). Node-only work
   goes behind a dynamic `import()` + runtime check, or an injected port (see `src/server/storage.ts`).
3. **Every API route is registered** in `apps/web/src/hub/handlers-registry.ts`
   (test-enforced by `apps/web/tests/hub-registry.test.ts`).
4. **Schema changes = `schema.ts` + a migration** in `packages/db/src/migrations/`.
   Never edit/renumber a shipped migration. Never drop/rename a column without an ADR.
5. **zod at every boundary** (HTTP bodies/queries, MCP args, imports, AI replies, plugin defs).
6. **Multi-row writes are transactional** (`withTransaction`) — async work before, events after commit.
7. **One grading path.** Card/exercise grades go through `executeReview` /
   `executeBatchReview` (`packages/db/src/review-service.ts`). Never update FSRS/XP/mastery by hand.
8. **Append-only tables stay append-only:** `revlog`, `xp_events`, `friction_events`, `elo_events`.
9. **Every AI feature has a manual mode** (works with provider `none`; test-enforced).
10. **Never change the native origin**: `identifier` or `useHttpsScheme` in
    `apps/native/src-tauri/tauri.conf.json` — users' data lives in OPFS scoped to it.
11. **Untrusted content never renders as HTML.** Use `<Markdown>` from `@/ui` (no raw HTML).
12. **Never commit secrets or build output** — keystores, `.env`, `target/`, `.next*/` (see `.gitignore`).
13. **Don't weaken tests to make them pass.** Fix the code, or explain in the PR why the test was wrong.
14. **Autonomous push & zero breakage.** Always push changes autonomously without waiting for routine confirmation. Strictly verify that code does not break (`npm run check` and `npm run build`) before pushing.
15. **CI completion before merge.** Before merging any pull request, wait for all GitHub Actions CI checks to finish and verify that they succeed. Never merge while CI is running, failing, or cancelled.
16. **Continuous pipelined productivity.** While CI runs, do not wait idly. Immediately advance to the next priority task, feature, or verification on the project in parallel.

### Rule enforcement table

| Rule | Statement                           | Enforcement mechanism                                                                                          |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | No raw `fetch` in UI code           | ESLint `no-restricted-syntax` on `apps/web/{app,src/{components,ui,platform}}`                                 |
| 2    | Handlers runtime-neutral            | ESLint `no-restricted-imports` (Node builtins banned in web handlers/hub/lib)                                  |
| 3    | API routes registered in hub        | Test: `apps/web/tests/hub-registry.test.ts`                                                                    |
| 4    | Schema changes = migration          | Idempotent migration runner (`packages/db/src/migrations/index.ts`) + DDL clone tests                          |
| 5    | zod at every boundary               | Zod validation in `readJson`, `readQuery`, MCP argument schemas, CLI inputs                                    |
| 6    | Multi-row writes transactional      | `withTransaction` sync wrapper + SQLite `BEGIN IMMEDIATE`                                                      |
| 7    | One grading path                    | Structural guard (`packages/db/tests/rules-guard.test.ts`) + `review-service.ts` / `mastery-service.ts`        |
| 8    | Append-only tables stay append-only | Structural guard (`packages/db/tests/rules-guard.test.ts` asserts no UPDATE/DELETE on revlog, xp_events, etc.) |
| 9    | Every AI feature has manual mode    | Test: `apps/web/tests/manual-mode-surface.test.ts` & `apps/web/tests/search-nl-api.test.ts`                    |
| 10   | Never change native origin          | Code review + OPFS storage scope invariant                                                                     |
| 11   | Untrusted content never raw HTML    | `<Markdown>` sanitizer from `@/ui` (ReactMarkdown with no dangerous HTML)                                      |
| 12   | Never commit secrets                | Pre-commit git hooks, `.gitignore`, secret-stripping in `backupAll`                                            |
| 13   | Don't weaken tests to pass          | CI pull request review & conventional commits                                                                  |
| 14   | Autonomous push & zero breakage     | Local verification gate (`npm run check`, `npm run build`) before push                                         |
| 15   | CI completion before merge          | Automated check via `gh pr checks` / `gh run watch` ensuring green status gate                                 |
| 16   | Continuous pipelined productivity   | Overlap active development cycles while remote CI verifies previous PR batches                                 |

## 4. Workflow

1. **Understand first.** Read the files you'll touch and their tests. Search for an existing
   helper before writing one (`packages/core/src`, `src/lib/api.ts`, `src/ui`).
2. **Plan small, atomic steps** — each one builds and passes on its own.
3. **Implement** following the recipes below. Pure logic in `core`, persistence in `db`,
   transport in handlers, presentation in pages.
4. **Document as you go:** JSDoc on every export (what + why + units/invariants; cite the
   research for learning-science rules). Update the relevant `docs/*.md`.
5. **Test** (see §6) — add tests for every new function/route.
6. **Commit atomically** with Conventional Commits (commitlint-enforced):
   `feat(core/curriculum): add LHCF slug validation` — one logical change per commit.
7. **Pre-merge checklist:** `.github/pull_request_template.md`.
8. **Autonomous push & verification:** Verify locally (`npm run check`, `npm run build`), then push branch directly and open PR autonomously.
9. **Wait for CI green gate:** Verify remote GitHub Actions CI completion (`gh pr checks`) before merging. Never merge while CI is running or failing.
10. **Pipelined productivity:** While remote CI executes on a pending PR, immediately begin the next task or feature in parallel.

## 5. Recipes

### Add a feature (page + API + logic)

```bash
npm run new:feature -- habits-v2 --title "Habits v2" --group Discipline
```

Generates the core domain + test, handler, route shim, page, and wires the hub registry +
navigation. Then replace the TODOs. Without the scaffolder, do these by hand:
`packages/core/src/<d>/index.ts` + `<d>.ts` → `src/server/handlers/<d>/route.ts` →
`app/api/<d>/route.ts` → registry `import` + `add()` → `app/<d>/page.tsx` → `nav.ts` entry.

### Add an API route to an existing feature

1. Handler in `src/server/handlers/<feature>/<sub>/route.ts`, exporting
   `withRoute(...)`-wrapped `GET/POST/...`; validate with `readJson(req, schema)`.
2. Shim: `app/api/<feature>/<sub>/route.ts` → `export { POST } from '@/server/handlers/...'`.
3. Registry: `import * as x from '../server/handlers/...'` + `add('<feature>/<sub>', x)`.
4. Call it from the UI via `apiGet/apiSend`.

### Change the database

- **New table:** add it to `schema.ts` (it's created on fresh DBs by drizzle-kit and by the
  native worker's runtime DDL automatically). Add a migration only if you also need indexes
  or data on existing DBs.
- **New column on an existing table:** add it to `schema.ts` **and** a migration:
  ```ts
  // packages/db/src/migrations/00N-short-name.ts
  export const shortName: Migration = {
    id: N,
    name: 'short-name',
    up(ctx) {
      ctx.addColumn('lessons', 'est_minutes', 'INTEGER')
    },
  }
  ```
  then append it to `MIGRATIONS` in `migrations/index.ts`.
- **Non-drizzle objects** (FTS5 virtual tables, triggers, views): a migration using
  `ctx.raw.exec` — see `migrations/003-fts-search.ts` for the idempotent pattern
  (feature-detect, `IF NOT EXISTS`, backfill by DELETE+INSERT). Exclude such names from
  DDL-cloning test helpers; backups whitelist drizzle tables already.
- Put reusable queries in `packages/db/src/repos/<domain>.ts` so web, MCP and CLI share them.
- Why it works this way: [docs/adr/0002](docs/adr/0002-versioned-idempotent-migrations.md).

### Add an AI feature

1. Prompt + zod output schema in `packages/core/src/ai/` (`prompts.ts`, `transport.ts` `AI_FEATURES`).
2. A manual mode in `ai/manual.ts` (required — test-enforced).
3. Handler uses `requireAI()` and returns `aiErrorResponse` / `needsSetup` when no provider.
4. UI offers `<TransportPanel>` (copy prompt → paste reply) for provider-less users.

### Curriculum / exercises

The curriculum format (LHCF) and exercise types are a **public contract** others' AIs
produce — change them additively. See [docs/adr/0003](docs/adr/0003-curriculum-format-lhcf.md)
and `docs/curriculum/`. New exercise type = schema + `grade()` in
`packages/core/src/practice/` + renderer in `apps/web/src/ui/exercises/` + tests.

### UI

- Build pages from `@/ui` (`PageHeader`, `Panel`, `Button`, `TextField`, `Tabs`, `Sheet`,
  `EmptyState`, `ProgressBar`, `Markdown`…). Add to the kit when a pattern repeats twice.
- Mobile-first: works at 360px wide, no horizontal page scroll, touch targets ≥ 44px,
  wide content inside `.scroll-x`. Navigation comes only from `src/components/nav.ts`
  (exception: detail pages reached by in-app links, e.g. `/courses/new`, `/courses/course`,
  `/courses/exam`, `/courses/lesson`, `/courses/certificate` — they must be link-reachable,
  never orphaned).
- Calm by default: one primary action per screen, honest empty states, no dark patterns.

## 6. Commands

| Purpose                     | Command                                                    |
| --------------------------- | ---------------------------------------------------------- |
| Install                     | `npm install`                                              |
| Dev (web)                   | `npm run db:push && npm run db:seed && npm run dev`        |
| Typecheck / lint            | `npm run typecheck` · `npm run lint`                       |
| Unit tests (all workspaces) | `npm test`                                                 |
| E2E                         | `npm run test:e2e`                                         |
| Native web bundle           | `npm run web:tauri` (then `npm run preview:tauri` → :4173) |
| Windows app                 | `npm run app:dev` / `npm run app:build`                    |
| Android                     | `npm run android:dev` / `npm run android:build`            |
| Scaffold a feature          | `npm run new:feature -- <name>`                            |

Before you say "done": typecheck, lint (0 errors), the tests for what you touched, and —
for UI — check it at phone width. Report honestly what you did **not** verify.

## 7. Where to learn more

Start from the [docs/README.md](docs/README.md) index, then:
[ARCHITECTURE.md](ARCHITECTURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) ·
[docs/learning-science.md](docs/learning-science.md) (every technique → code link) ·
[docs/curriculum/](docs/curriculum/) (LHCF contract; regenerate with `npm run docs:curriculum`) ·
[docs/native.md](docs/native.md) · [docs/adr/](docs/adr/README.md) ·
[docs/ENGINE-REFERENCE.md](docs/ENGINE-REFERENCE.md) · [docs/TEST_INFRA.md](docs/TEST_INFRA.md) ·
[docs/ai-providers.md](docs/ai-providers.md) · [docs/plugins.md](docs/plugins.md)
