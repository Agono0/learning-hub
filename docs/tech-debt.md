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

| Query | Copies |
| --- | --- |
| Due-count (`lte(cards.due, now) AND suspended = false`) | `apps/server/src/routes.ts:537`, `apps/mcp/src/index.ts` (~343), `apps/cli/src/index.ts` (~193, ~245), `apps/web/src/server/handlers/dashboard/route.ts:91` |
| Today tallies (revlog count/correct + revlog_undos exclusion + streak row) | server routes.ts (twice: today + stats), web `review/route.ts:135`, web `review/stats/route.ts:20`, MCP `index.ts` review_stats, CLI `stats()` |
| Retention + forecast composition | server routes.ts:579, web `review/stats/route.ts:8`, MCP index.ts:334, CLI index.ts:193 |
| Deck listing aggregate | server routes.ts:437 vs web `decks/route.ts:17` — byte-identical SQL, **response shapes already diverged** (web adds desiredRetention/hasCustomWeights) |

**Demonstrated cost:** every fix to a tally had to be replicated ≤6×; the
deck-listing shapes already disagreed, so hosts reported different decks UIs.
**Fix shipped:** `repos/stats.ts` (getDueCardCount, getNewCardCount,
getTodayReviewTallies, getTrueRetention, getDueForecast, getStreakRow,
getXpTotals, getDeckSummaries) now backs web dashboard/review-stats/decks,
server today/stats/listDecks, MCP review_stats and CLI today/stats; the
aggregate deck SQL exists once and every host projects the same rows.
**Related, FIXED:** hypercorrection + metacognition JOL derivation was the
same disease — unified in commit `495b385` via `repos/cognitive-trials.ts`.

### TD-02 · OPEN — /cognitive/* payload schemas re-declared per host
~30 cognitive endpoints' zod input schemas exist three times: server
`routes.ts:124-400`, MCP tool arg shapes (`tools/*.ts`), CLI flag parsing
(`commands/advanced-learning.ts`). One divergence already exists: the ZPD
`pre`/`post` defaults differ between the CLI flags and the server schema.
**Fix path:** each core engine exports its input schema (the pattern
`generationTrialInputSchema` already uses); hosts import instead of re-declare.
Add a structural test: every `/cognitive/*` route schema is imported from core.

### TD-03 · OPEN — same feature, different sampling windows
Web hypercorrection reads 2000 revlog rows, server/MCP read 200 — with
>200 rows of history the three surfaces answer differently for the same
learner. Deliberately left per-host in `495b385` (one behavior change per
commit); pick one window and centralize in the repo options default.

### TD-04 · OPEN — no cross-host parity test
The drift in TD-01/TD-02 was invisible because each host is tested in
isolation with its own fixtures. **Fix path:** one table-driven E2E suite
(`tests/e2e`, tier-4 style) that seeds one revlog fixture and asserts the
same canonical JSON from the web handler, the headless server route, and the
MCP tool for the shared query families (trials, stats, today, decks).

## P2 — structural debt (schedule, don't scramble)

### TD-05 · OPEN — engines bundle zod schemas + scenario corpora + logic
25 engine files >800 LOC; the biggest (`dynamic-assessment/zpd-engine.ts`,
1,854) is ~80% hardcoded scenario data. The data is *content*, not logic — it
inflates diffs, merge conflicts, and review noise. **Fix path:** for engines
touched anyway, split `<domain>/content.ts` (scenario constants) from
`<domain>-engine.ts`. No big-bang split.

### TD-06 · OPEN — duplicated micro-helpers inside core
`clamp` ×17 in 14 files (despite `math.ts`), day-key/ISO-slice helpers ×11,
calibration math ×5, `hashString` ×2. **Fix path:** opportunistically switch a
file to the shared helper when touching it; add the canonical names to
`math.ts` (`clamp`, `hashString`) so new code stops re-deriving.

### TD-07 · OPEN — core barrel exports 102 modules via `export *`
Name-collision risk grows with every domain; nothing is tree-shakeable.
`practice` is missing from the barrel while `types.ts` depends on it and six
domains import it (surface inconsistency; tests deep-import it).
**Fix path:** add `practice` to `src/index.ts` deliberately; keep `export *`
(no demonstrated tree-shaking need), add a duplicate-export guard test if a
collision ever lands.

### TD-08 · OPEN — 7 web handlers bypass `withRoute`
`analytics`, `achievements`, `journal/weekly`, `curriculum/skills`,
`images/[id]` (intentional: binary response), `review/stats`, `graph` — these
return bare JSON without the ApiError envelope, so their failure shape
differs from every other route. **Fix path:** wrap the six JSON ones;
document the images exception in `lib/api.ts`.

### TD-09 · OPEN — ad-hoc TanStack Query keys
No key factory; `'decks'` appears as a literal in 22 files, invalidations
scattered. One factory exists (`lib/curriculum-api.ts` `curriculumKeys`) —
the model to replicate. **Fix path:** add `src/lib/query-keys.ts`, migrate
mechanically when feature agents are idle (wide but shallow).

### TD-10 · OPEN — zustand is a dead dependency
Declared in `apps/web/package.json`, zero `create(` usage, no stores dir.
**Fix path:** remove it (or adopt it consciously); either way the stack
description in README/ARCHITECTURE stops advertising it.

### TD-11 · OPEN — `apps/server` routes.ts is a 2,361-line monolith with parity gaps
59 routes in one file; curriculum/focus/habits/notes/ideas are missing
entirely from the headless server while MCP/CLI/web serve them. **Fix path:**
TD-01 first (shared repos), then move route groups into `routes/<area>.ts`
modules with the same `Route[]` table pattern; add the missing domains only
after the parity test (TD-04) exists.

### TD-12 · OPEN — type-only cycles behind the acyclicity guard
`spatial/palace-engine.ts:14` and `knowledge-graph/traversal.ts:13` import
types from their own barrels (`./index` re-exports them back). Erased at
runtime, so `packages/core/tests/architecture.test.ts` (deliberately) does
not flag them — but they make hoisting order load-bearing for any future
value import. **Fix path:** move the imported types into leaf modules when
the files are touched anyway.

### TD-13 · OPEN — architecture docs drift
`PROJECT_ARCHITECTURE.md` rev 2.0 says "51+ MCP tools" (93 as of today), "25+
CLI command modules" (47 built-in commands), and lists zustand in the web
stack. Numbers corrected in this register's landing commit; **fix path:** add
a "verified against codebase" date + let the parity/registry tests assert doc
claims where cheap.

## FIXED (evidence)

| Item | Commit | Note |
| --- | --- | --- |
| Hypercorrection + metacognition JOL derivation drift (undo-exclusion, per-host inline mappers) | `495b385` | one repo (`repos/cognitive-trials.ts`) + one core mapper; server/MCP gained web's undo-exclusion semantics |
| fsrs.ts ↔ fsrs-optimizer.ts runtime cycle | `caaa764` | optimizer re-export moved to `src/index.ts`; guard test added |
| generation engine ↔ own-barrel runtime cycle | `caaa764` | `generation/shared.ts` leaf module |
| No acyclicity/dependency enforcement for core | `caaa764` | `packages/core/tests/architecture.test.ts` (verified to fail on planted cycles) |
