# Handoff — CI fix round (S3-15/60/19 regressions + fixtures)

**Worker:** W1 · **Status:** done · **Date:** 2026-11-22 · **Commits:** 289b4a9, 184b83e, f9f9ec0, 3eb0ca6

CI red on feature/mega-run; scoped-vitest protocol used (per-file runs, never
full suites). 125 scoped tests green after the fixes (72 db/core + 53 web).

## Fixes by group

1. **`packages/core/src/tasks/order.ts` (S3-60, commit 289b4a9)** — the four
   reorder functions returned `densify(...)` (indices `[0,1,2]`) instead of
   the moved ID list; `orderPatchFor` built its Map with later duplicate
   keys winning and emitted patches in task order instead of order-list
   order. Now: `moveTo`/`nudge`/`insertAt`/`removeId` return the reordered
   ID list (`densify` stays the ordinal producer for persistence),
   `orderPatchFor` iterates the order sequence with first-wins dedupe, and
   the type-only `import('./index')` cycle is now `import('./shared')`
   (architecture guard green).
2. **`packages/db/src/repos/tasks.ts` (commit 184b83e)** — bulk `skipped`
   missed not-found ids (`getTaskItem` returns null, not undefined);
   `listTaskItems` treated an explicit `null` scope as `'any'` via `??`
   (documented semantics: undefined = any, null = inbox/top-level — this
   also caused project-duplicate to copy children twice and would have
   shown subtasks on the Today page); subtask/nesting + archived-project
   violations now throw core `TaskDomainError` (`subtask-self`,
   `subtask-depth`, `project-archived`) so handlers map them to 400.
3. **Test fixtures (commit f9f9ec0)** — migration idempotency tests
   expected `applied=[]` after a DIRECT `up()` (bypasses runner
   bookkeeping; contract says the first runMigrations RECORDS it, second
   reports `[]`); the 032 index test's `LIKE '%_idx'` query missed
   `simple_counter_logs_day_uniq` (the migration DOES create it); the 032
   usage test needed batch-A tables + a seeded FK parent; focus-lock tests
   started a second session while the first was still open (lifecycle
   contract refuses) — now ended via `endMaxFocusSessionByReason` first,
   the standard-session fixture is closed (an open row blocks starts), and
   the `minutesAgo(1)` fixture is hoisted (two clock reads drifted 1ms).
4. **`apps/web` handlers (commit 3eb0ca6)** — core zod refines (reminder
   `at_time` needs remindAt) surfaced as 500: `taskErrorResponse` now maps
   `ZodError` → 400 with issue detail; the schedule read anchors
   deadline-only tasks (no due) on their deadline day so the timeline
   shows the hard date; attachment routes registered
   (`tasks/[id]/attachments` GET/POST, `tasks-attachments/[id]` DELETE).

## Verification

- Scoped vitest: `sp-tasks-repos` (30), `sp-tasks-migration` (4),
  `sp-views-migration` (5), `focus-lock-repo` (21), `tasks-order` (10),
  `architecture` (2), plus the five apps/web SP suites (53) — all green.
- Workspaces typecheck clean (core/db/web); ESLint scoped 0 problems;
  prettier green.

## Notes for downstream workers

- `expect(fn()).toThrow(...)` calls the function OUTSIDE expect — always
  `expect(() => fn())`. That was the projects "double guard" red herring.
- When a CI diagnosis names a migration/DDL gap, check the TEST's query
  first: the "missing 032 index" was a `LIKE '%_idx'` filter, not DDL.
- A raw `focus_sessions` fixture row without `endedAt` counts as OPEN and
  blocks `startMaxFocusSession` (no mode filter in `getOpenFocusSession`) —
  close fixtures you don't intend to be "in progress".
- `listTaskItems` scope contract: `undefined` = any, `null` = inbox /
  top-level, id = that row's children. Handlers pass zod defaults.
