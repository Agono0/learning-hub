# Product audit — Learning HUB (PRELIMINARY)

Living document. Started 2026-11-25 during the 100-PR quality mission at the
user's request. Status: PRELIMINARY — structural scans only. Few TODO
markers and resolvable API names do NOT establish defect-free behavior;
behavioral verification (runtime flows) and systematic performance checks
remain OPEN (backlog B3/B4). Rides a future PR once substantive; until then
it is maintained untracked in the working tree.

**How to read this:** every entry is either **INSPECTED** (verified against
the code on `main` or an open PR branch, with file references) or
**PROPOSED** (an addition, with the evidence that motivates it). Nothing
here is a guess presented as fact. Verification criteria are stated per
backlog item.

## 1. Scope inventory (INSPECTED)

- ~90 Next.js page surfaces under `apps/web/app/*` (decks, review, planner,
  palace, palace-3d, world, leagues, shared, studios, exam-sim, feynman,
  debate, …).
- 103 web API handler groups under `apps/web/src/server/handlers/*`.
- ~200 core domain modules in `packages/core/src`, db repos in
  `packages/db/src/repos`, optional headless REST host in `apps/server`,
  MCP surface in `apps/mcp`, CLI in `apps/cli`.
- three.js (`three@^0.187`) powers `/palace-3d` (walkable memory palace with
  room archetypes + core spatial-audio distance/gain/pan model) and `/world`.

## 2. Flow connectivity (INSPECTED)

Page → API naming is aliased, not broken: sampled pages without same-named
handlers all resolve to real handlers (`/palace-3d` → `/api/palace` +
`/api/spatial`; `/exam-sim` → `/api/curriculum`; `/feynman` → `/api/ai`,
`/api/cards`, `/api/decks`; `/boards` → `/api/tasks`; `/debate` →
`/api/dialectic`). No dangling `/api/*` references found in the sample.
Full-runtime flow verification happens in CI e2e; a dedicated audit pass
that walks every page's apiGet/apiSend targets against the handler table is
backlog item B4.

TODO/FIXME markers: 7 hits repo-wide, all benign (iCal VTODO vocabulary).
No marker-tracked known defects.

## 3. Known UX gaps

### G1 — Guided material sharing (INSPECTED on PR #129, carried forward)
Publishing/subscribing to shared-material channels requires pasting raw
JSON manifests. Rendering is verified (screenshots incl. dark-contrast
fix), but the end-to-end flow is power-user-only — against the user's
"easy to understand" product bar.
**Proposal:** pick-a-deck → publish wizard; paste-a-link → subscribe flow;
manifests become an advanced fallback.
**Verify:** e2e drives publish + subscribe without touching JSON;
screenshots inspected on light AND dark themes.

### G2 — Leagues UX maturity (INSPECTED on feat/competitive-leagues)
/leagues has Overview/Standings/Duels/Tournaments tabs, player profiles,
h2h panel, achievements badges, transfer panel. Division drill-down (one
division's standings + history as a focused view) is missing.
**Proposal:** division detail views (backlog B2).

## 4. Competitive 3D assessment (parent question: study value, not novelty)

INSPECTED: `/palace-3d` implements method of loci — a mnemonic technique
with strong evidence (repo cites Dresler 2017); prompts attach to loci with
real card links. Retrieval practice (the testing effect) is separately one
of the highest-effect-size study techniques, and leagues already implement
it as duels.

**Assessment (hypothesis, not established):** method of loci and retrieval
practice each have independent research support (repo cites Dresler 2017
for loci; testing effect is well replicated). Whether a COMPETITIVE duel
layer inside the 3D walk improves learning is an untested interaction —
combining two supported techniques does not prove the combination helps.
Proposal: build "palace duel" (both players walk the same palace, prompts
at loci, scoring REUSES the duel engine) as an optional mode and treat any
learning benefit as a hypothesis to probe (e.g. compare retention on
palace-duel vs standard-duel prompts in a later analytics pass), never as
a claimed improvement. A generic leaderboard overlay on the 3D walk is
novelty and is rejected.
**Risk:** walk time inflates time-per-retrieval vs plain review. Mitigation:
optional mode, short 5-prompt format (existing duel defaults), never the
default review path.
**Verify:** duel engine reuse (no forked scoring); e2e palace-duel flow;
prompt count and timing comparable to standard duels.

## 5. Performance / algorithm notes

INSPECTED patterns: db repos consistently gather with one query then map in
memory (`listLeaguePlayers` et al.); leagues effects run inside single
transactions; Elo is O(1) per duel (K=32, clamped). No quadratic hotspots
identified in the leagues/duels/tournament paths at expected scale
(≤ hundreds of players per league).
OPEN: no systematic pass over the other ~200 modules yet — backlog B3.

## 6. Prioritized backlog

- **B1 (in flight):** finish leagues PR #2 — division detail views, e2e
  additions. Verify: CI green, screenshots inspected, ≥10k unique ins.
- **B2:** division detail views (with B1).
- **B3:** systematic performance pass over hot read paths (review queue,
  planner, dashboard): count queries per render, flag N+1 and whole-table
  scans. Verify: before/after query counts on seeded fixtures.
- **B4:** automated flow-connectivity audit: extract every apiGet/apiSend
  path from pages, assert a handler exists (script + CI check). Verify:
  script exits non-zero on a dangling path.
- **B5:** 3D world expansion (candidate PR #3): palace-duel mode per §4,
  new room archetypes, guided publish/subscribe UX (G1) riding the same
  multi-feature PR. Verify per §3/§4 criteria.
- **B6:** this audit document committed with B5's PR.
