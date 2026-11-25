# Review Arena (3D)

A colosseum run over the real review queue. The arena is a presentation and
motivation layer over spaced repetition — it never invents its own learning
economy.

## What it is

- The queue comes from `GET /api/arena`, which reuses the same `buildSession`
  engine as `/api/review` (weak-first priority, FSRS untouched, semantic
  interleaving when embeddings exist).
- Every grade is a real review. At settlement (`POST /api/arena`) each
  exchange runs through the canonical `executeReview()` path — the same
  atomic transaction as the normal queue: FSRS reschedule, append-only
  revlog, streak, mastery. Daily quest progress picks these reviews up
  automatically because quest progress is evaluated live from revlog.
- The guardian IS the queue. Its HP bar is session progress; clearing every
  card is victory, regardless of damage math. Learner HP only cuts a run
  short (defeat) when repeated "Again" grades land counters.

## Anti-cheat and integrity

- The server recomputes the outcome from the raw grade log
  (`summarizeGradeLog`). Client-supplied score, combo and result fields are
  telemetry only — a forged `bestCombo: 999` changes nothing.
- Coins are capped by the engine (`correct + victory bonus + combo bonus`,
  never more than `rounds + 8`) and minted at most once per grade log via a
  deterministic idempotency key (FNV-1a over the exchange list). A retried
  double-submit mints zero additional coins.
- Arena bonus XP follows the app's small-award convention (5 XP per correct
  retrieval + 15 for victory) and lands as a distinct `arena` XP source, so
  economy audits can separate it from per-grade review XP.
- "Guessed" (confidence 0) halves strike damage and can never crit: honest
  self-reporting costs less than pretending to know. Confidence feeds the
  same hypercorrection tracking as the review queue.

## Accessibility

- The 3D canvas is decorative. With reduced motion (or e-ink) it never
  mounts; the DOM HUD carries the entire session — HP, shield, combo, score,
  guardian progress, card, grade controls.
- The canvas is `aria-hidden`; all state lives in labelled DOM (progressbar
  roles via the kit ProgressBar).

## Surfaces

| Surface       | Path                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Page          | `apps/web/app/arena-3d/page.tsx`                                           |
| 3D scene      | `apps/web/src/lib/three/ArenaSceneManager.ts` (+ `src/ui/ArenaCanvas.tsx`) |
| API handler   | `apps/web/src/server/handlers/arena/route.ts`                              |
| Engine        | `packages/core/src/arena/index.ts`                                         |
| Handler tests | `apps/web/tests/arena-api.test.ts`                                         |
| Engine tests  | `packages/core/tests/arena.test.ts`                                        |
| Browser spec  | `apps/web/tests/ui/arena-3d.spec.ts`                                       |

## Learning-benefit posture

The arena's motivational effect is a hypothesis (product audit §4), not a
claim: it reuses proven retrieval practice, but no evidence yet shows the
combat layer improves retention. It is never the default review path.
