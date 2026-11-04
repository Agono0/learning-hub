# STATUS — build report (2026-11-04, ~01:30)

**Learning HUB is built and verified.** 3 build agents + orchestrator. Everything below was executed and observed live — nothing is projected.

## Verification results

| Check | Result |
|---|---|
| Core test suite (vitest + fast-check) | **214/214 green** (15 files: FSRS golden + property tests, linter, review, math, language, memory, games, focus state machine, motivation, physio, analytics, ideas, curriculum, notes) |
| Typecheck `tsc --noEmit` apps/web | **exit 0, zero errors** |
| Production build `npm run build` | **success** — 20 pages + ~40 API routes |
| Production server boot + homepage | rendered: Due now / Daily quote / Daily Loop / streak / XP |
| **Full review pipeline (live)** | card 23 (MATH-333 cloze) reviewed via API: FSRS stability 0→2.3065, revlog row inserted, +7 XP, streak 0→1, Elo 1000→1008.5, mastery.elo synced |
| MCP server (JSON-RPC probe) | initialize → **14 tools listed** → `review_stats` executed against real DB (due 23→22 after review) |
| CLI | `stats` renders ASCII panel with live data; `review`/`today`/`capture`/`quote`/`focus` implemented |
| Seed | 122 quotes, 15 achievements, settings, 6 distraction apps, Major 0-9 — idempotent (ran 4×) |
| MATH-333 pilot import | idempotent: 1 track/course, 2 units, 7 lessons, 6 skills + DAG, 22 cards, exam date, 3 reading sources (from your real lecture PDFs) |

## What exists (26 systems)

**Learning core** — FSRS-6 engine (`packages/core/src/fsrs.ts`, canonical bridge used by web + MCP + CLI) · 8 card formats incl. image occlusion (normalized-rect editor + renderer) · 20-Rules linter (10 automated checks) · review session with hypercorrection queue, pretest/cram modes, energy, worked-example fade, undo buffer, keyboard 1-4/space/e · Elo ladder · matching games · memory palace + Major/PAO · sentence mining (1T) + grammar cards · notes-as-flashcards with bullet sync · Feynman teach-back (graded, gap-cards) · Socratic tutor (guardrail ladder, RAG, reveal-gated) · incremental reading + PDF upload (unpdf) + highlight triage + daily resurfacing · canvas · force-graph

**Curriculum** — backward-design courses with Bloom-verb objectives, prerequisite DAG gating, BKT mastery + Khan levels, skill tree, mock exams with expressive-writing prompt + cram warning, AI course generator

**Human systems** — XP/levels (RuneScape curves) · streaks + 2 freezes + weekend amulet + emergency saver · deterministic daily quests · 15 white-hat achievements · WOOP goals + if-then plans · commitment contracts · habit loops/stacking/solidifying + dopamine menu · **friction gate** (pure reducer: 10s countdown → 3×4-7-8 breathing → reflection; invalid transitions throw) · Page-Visibility leak logging · 10-step detox wizard · task player with finish-time visibility · journal + weekly review + AI coach · quotes (FNV-1a daily pick) · physiology tracker with sleep-vs-retention correlation · analytics (forecast histogram, true retention via SQL view, calibration, heat map, learning score, leak trend)

**Agent access** — MCP stdio server (14 tools + 3 resources, Windows-safe config in README) · REST mirroring · CLI · one shared core

## Known limitations (honest)

- Calibration buckets fill `n=0` until enough reviews exist (revlog has no per-review predicted-retrievability column; retrospective reconstruction possible later)
- FSRS optimizer integration deferred (revlog collected from first review; `@open-spaced-repetition/binding` is the path)
- ts-fsrs 6.0.0 input-type skew handled with documented `as never` casts in `core/fsrs.ts` (runtime-verified)
- AI features are dormant until a provider key is set in **Settings** (everything degrades gracefully to manual)
- `npm audit`: 8 low/moderate advisories in the dependency tree (dev-chain); no `audit fix --force` was run to avoid major bumps
- 8 noun-quotes in the seed carry "commonly attributed" context flags (honesty over legend)

## How to use (tomorrow morning)

```bash
npm run dev        # http://localhost:3000
```
Dashboard → **Review 22 cards** (your real MATH-333 definitions/theorems) → streak + XP + quests update live → **Focus** block (try breaking it early to meet the friction gate) → **Curriculum** → your imported course + skill tree → set an AI key in **Settings** to unlock tutor/Feynman/generators. Connect Claude Desktop/Cursor via the MCP snippet in README.md.

Backups: `data/backup-pre-agents.db` (pre-integration snapshot). DB lives at `data/learning-hub.db`.
