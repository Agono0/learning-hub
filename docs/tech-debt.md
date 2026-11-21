# Technical-debt register (The Architect)

> Maintained by the architecture agent (`agent/zcode2-architect`). Prioritized,
> evidence-backed, and incremental: every item states the demonstrated problem
> and the smallest safe fix path. Nothing here asks for a rewrite.
>
> Companion documents: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (the "why"),
> [`../PROJECT_ARCHITECTURE.md`](../PROJECT_ARCHITECTURE.md) (the component
> map), [`plans/MASTER-FIX-PLAN.md`](plans/MASTER-FIX-PLAN.md) (the 2026-11-08
> audit, all 26 findings resolved — this register only tracks what is new or
> still open after it). Status vocabulary: **OPEN** / **FIXED** (commit noted).

## P1 — drift and correctness risks (fix first)

### TD-01 · FIXED (`590ddbb`) — "today / due / stats" aggregation re-implemented per host

The same SQL blocks live in 4 hosts and had already started to diverge
(response shapes differ, undo-filters differ):

| Query                                                                      | Copies                                                                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Due-count (`lte(cards.due, now) AND suspended = false`)                    | `apps/server/src/routes.ts:537`, `apps/mcp/src/index.ts` (~343), `apps/cli/src/index.ts` (~193, ~245), `apps/web/src/server/handlers/dashboard/route.ts:91` |
| Today tallies (revlog count/correct + revlog_undos exclusion + streak row) | server routes.ts (twice: today + stats), web `review/route.ts:135`, web `review/stats/route.ts:20`, MCP `index.ts` review_stats, CLI `stats()`              |
| Retention + forecast composition                                           | server routes.ts:579, web `review/stats/route.ts:8`, MCP index.ts:334, CLI index.ts:193                                                                     |
| Deck listing aggregate                                                     | server routes.ts:437 vs web `decks/route.ts:17` — byte-identical SQL, **response shapes already diverged** (web adds desiredRetention/hasCustomWeights)     |

**Demonstrated cost:** every fix to a tally had to be replicated ≤6×; the
deck-listing shapes already disagreed, so hosts reported different decks UIs.
**Fix shipped:** `repos/stats.ts` (getDueCardCount, getNewCardCount,
getTodayReviewTallies, getTrueRetention, getDueForecast, getStreakRow,
getXpTotals, getDeckSummaries) now backs web dashboard/review-stats/decks,
server today/stats/listDecks, MCP review_stats and CLI today/stats; the
aggregate deck SQL exists once and every host projects the same rows.
**Related, FIXED:** hypercorrection + metacognition JOL derivation was the
same disease — unified in commit `495b385` via `repos/cognitive-trials.ts`.

### TD-02 · PARTIAL (#81) — /cognitive/* payload schemas re-declared per host

~30 cognitive endpoints' zod input schemas exist three times: server
`routes.ts:124-400`, MCP tool arg shapes (`tools/*.ts`), CLI flag parsing
(`commands/advanced-learning.ts`). First increment shipped (PR #81): core owns the ZPD payload schemas (the
demonstrated default drift is fixed across server/MCP/CLI) and five
evaluate-route payloads reuse core submission schemas — including a fix
where the CER route had silently dropped core's `min()` constraints.
Remaining: ~20 route groups still without core input schemas, and the
inquiry/trial shape mismatch (route adds labId/previousSettings — an API
decision, not a refactor).
**Fix path:** each core engine exports its input schema (the pattern
`generationTrialInputSchema` already uses); hosts import instead of re-declare.
Add a structural test: every `/cognitive/*` route schema is imported from core.

### TD-03 · ACCEPTED (documented) — per-surface sampling windows are contracts

Web hypercorrection reads 2000 revlog rows, server/MCP read 200 — with more
than 200 rows of history the surfaces answer differently for the same learner.
Resolution: the window is part of each surface's contract (web is the product
UI with a long history; agent surfaces sample tightly) — documented in
ADR-0004 and enforced where it matters: the parity suite (TD-04) seeds below
the smallest window and asserts identical answers, so a divergence inside any
window still fails CI.

### TD-04 · FIXED (`549e0a3`) — cross-host parity suite

The drift in TD-01/TD-02 was invisible because each host is tested in
isolation with its own fixtures. **Fix shipped:** `tests/e2e/tier4-scenarios/cross-host-parity.test.ts` —
seeds one scripted history (corrections, armed miss, an undone review)
through the canonical web pipeline and asserts identical hypercorrection,
metacognition-trial, stats/today/forecast and deck-count answers through
the web handler, the headless server's node:http dispatch and the MCP
stdio subprocess. Delta-based assertions; runs in CI per the owner's
CI-only test policy.

## P2 — structural debt (schedule, don't scramble)

### TD-05 · OPEN — engines bundle zod schemas + scenario corpora + logic

25 engine files >800 LOC; the biggest (`dynamic-assessment/zpd-engine.ts`,
1,854) is ~80% hardcoded scenario data. The data is _content_, not logic — it
inflates diffs, merge conflicts, and review noise. **Fix path:** for engines
touched anyway, split `<domain>/content.ts` (scenario constants) from
`<domain>-engine.ts`. No big-bang split.

### TD-06 · PARTIAL (#PR-C) — duplicated micro-helpers inside core

`clamp` ×17 in 14 files (despite `math.ts`), day-key/ISO-slice helpers ×11,
calibration math ×5, `hashString` ×2. **Shipped:** `math.ts` now owns the
canonical `clamp` (3-arg) and `hashString` (FNV-1a 32-bit, verbatim from
motivation.ts) with invariants documented; 11 files migrated with zero
behavior change — elo, prototype-exemplar, spatial (re-export keeps the
subpath API), motivation, habits (inline FNV + day-key), curriculum/lhcf
slug, share checksum, notification-center (→ streaks `localDayKey`), fsrs
forecast, freshStart, exposure. **Intentionally kept:** fixed-bound
one-arg variants (`clamp01`, `clampPct`, spatial's rounded clamp, the
analytics [0,100] closure) — different semantics, not duplicates; the
calibration "×5" turned out to be five distinct domain functions, not
copies. Remaining `clamp` locals migrate on next touch of their files.

### TD-07 · FIXED (#78) — `practice` exported; barrel risk realized and contained

Name-collision risk grows with every domain; nothing is tree-shakeable.
`practice` is now exported from the barrel (PR #78) — and the predicted
collision immediately materialized: `normalizeAnswer` exists in both
`cards.ts` and `practice/text.ts`, so the root barrel needed an explicit
resolution (kept the pre-existing `./cards` binding; the
`@learning-hub/core/practice` subpath keeps its own). `export *` stays
(no demonstrated tree-shaking need).

### TD-08 · FIXED (#78 + #PR-C) — 6 of 7 wrapped, 1 documented exception

`analytics`, `achievements`, `journal/weekly`, `curriculum/skills`,
`images/[id]` (intentional: binary response), `review/stats`, `graph` — these
returned bare JSON without the ApiError envelope, so their failure shape
differed from every other route. **Shipped (PR #78):** analytics, achievements, journal/weekly,
curriculum/skills and graph now return the ApiError envelope. **Shipped
(#PR-C):** `review/stats` wrapped in `withRoute` (the last bare-JSON route);
`images/[id]` documented as the deliberate binary exception in the
`lib/api.ts` header — every `/api` route now either shares the
`{ error, detail? }` failure shape or is that one documented route.

### TD-09 · FIXED (#76) — typed query-key factory + 60 sites migrated

No key factory; `'decks'` appears as a literal in 22 files, invalidations
scattered. One factory exists (`lib/curriculum-api.ts` `curriculumKeys`) —
the model to replicate. **Fix path:** add `src/lib/query-keys.ts`, migrate
mechanically when feature agents are idle (wide but shallow).

### TD-10 · FIXED (#78) — zustand removed

Declared in `apps/web/package.json`, zero `create(` usage, no stores dir.
**Fix path:** remove it (or adopt it consciously); either way the stack
description in README/ARCHITECTURE stops advertising it.

### TD-11 · OPEN — `apps/server` routes.ts is a 2,361-line monolith with parity gaps

59 routes in one file; curriculum/focus/habits/notes/ideas are missing
entirely from the headless server while MCP/CLI/web serve them. **Fix path:**
TD-01 first (shared repos), then move route groups into `routes/<area>.ts`
modules with the same `Route[]` table pattern; add the missing domains only
after the parity test (TD-04) exists.

### TD-12 · FIXED (#78) — leaf-module types broke both cycles

`spatial/palace-engine.ts:14` and `knowledge-graph/traversal.ts:13` import
types from their own barrels (`./index` re-exports them back). Erased at
runtime, so `packages/core/tests/architecture.test.ts` (deliberately) does
not flag them — but they make hoisting order load-bearing for any future
value import. **Fix path:** move the imported types into leaf modules when
the files are touched anyway.

### TD-13 · FIXED (#PR-C) — architecture docs drift

All headline claims re-verified against code (counted, not guessed) and the
drifted numbers corrected across `PROJECT_ARCHITECTURE.md`,
`ARCHITECTURE.md`, `README.md`, `PROJECT_CONTEXT.md`, with a
"Verified against codebase: 2026-11-21" date: 128 MCP tools (was 51/93),
58 CLI commands (was 25/47), zustand removed from the stack description
(TanStack Query + React local state), 94 tables (was 92), 29 migrations (was
27), 47 repos (was 40), 10 card formats (was 8, list corrected), PBKDF2
210k iterations (was 100k), Node 24, AI SDK 7, 300+ test files. Where cheap,
doc claims stay next to registry tests that fail when the code moves.

## FIXED (evidence)

| Item                                                                                           | Commit    | Note                                                                                                       |
| ---------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Hypercorrection + metacognition JOL derivation drift (undo-exclusion, per-host inline mappers) | `495b385` | one repo (`repos/cognitive-trials.ts`) + one core mapper; server/MCP gained web's undo-exclusion semantics |
| fsrs.ts ↔ fsrs-optimizer.ts runtime cycle                                                      | `caaa764` | optimizer re-export moved to `src/index.ts`; guard test added                                              |
| generation engine ↔ own-barrel runtime cycle                                                   | `caaa764` | `generation/shared.ts` leaf module                                                                         |
| No acyclicity/dependency enforcement for core                                                  | `caaa764` | `packages/core/tests/architecture.test.ts` (verified to fail on planted cycles)                            |
