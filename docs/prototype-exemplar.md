# Prototype & Exemplar Categorization Studio

The categorization studio teaches the _internal structure_ of categories:
members are graded, not equal; prototypes can be abstracted from distortions
without ever being shown; and stored exceptions can outpredict a category
average exactly where the average is wrong. The learner studies exemplars,
rates typicality, classifies old and never-seen items — and the engine fits
**both formal representation models** to the learner's own responses.

- Studio page: `/prototype-exemplar` (`apps/web/src/components/PrototypeExemplarStudio.tsx`)
- Engine: `packages/core/src/prototype-exemplar/prototype-exemplar-engine.ts` (pure, deterministic)
- Study planner: `packages/core/src/prototype-exemplar/study-plan.ts` (pure, deterministic)
- Handler: `apps/web/src/server/handlers/prototype-exemplar/route.ts`
- Persistence: `packages/db` (`prototype_exemplar_sessions`, append-only)
- Hosts: web handler · MCP tools (`prototype_exemplar_*`) · CLI (`learning-hub prototype-exemplar`) · REST (`/cognitive/prototype-exemplar/*`)

## The science

| Source                                                           | What it contributes                                                                                             | Where in code                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Rosch (1975), _Cognitive Representations of Semantic Categories_ | Typicality norms on the 1-7 scale (robin 1.18 … ostrich 5.76); category-name priming                            | `BIRD_TYPICALITY_SET` norms, TSC                           |
| Rosch & Mervis (1975), _Family Resemblances_                     | Centrality = summed attribute-sharing with other category members; no defining feature                          | `familyResemblance()`, typicality prediction (binary sets) |
| Posner & Keele (1968, 1970)                                      | The never-seen prototype classifies as well as trained distortions                                              | `PROTOTYPE_DISTORTION_SET`, CTS transfer probes            |
| Reed (1972)                                                      | Prototype (averaging) vs stored-instance rules, head-to-head                                                    | `prototypeProbabilityA()`, `fitPrototypeParameters()`      |
| Medin & Schaffer (1978)                                          | The 5-4 binary structure; exemplar storage captures the A/B asymmetry                                           | `FIVE_FOUR_STRUCTURE_SET`, divergent items                 |
| Smith & Minda (2000, Table 1)                                    | The 5-4 coding used here (A = {1110, 1010, 1011, 1101, 0111}, B = {1100, 0110, 0001, 0000})                     | `FIVE_FOUR_STRUCTURE_SET` items                            |
| Nosofsky (1986), GCM                                             | Attention-weighted Minkowski distance, exponential similarity, exemplar-sum classification; grid-search fitting | `gcmProbabilityA()`, `fitGcmParameters()`                  |
| Shepard (1987)                                                   | The universal exponential similarity gradient η = exp(−c·d)                                                     | `exponentialSimilarity()`                                  |
| Ashby & Gott (1988)                                              | Rule-based (decision-bound) strategies as the third representation family                                       | `RULE_BOUNDARY_SET`, `ruleProbabilityA()`, `ruleFit`       |
| Landauer & Bjork (1978)                                          | Expanding retrieval practice: +1 → +3 → +7 → +14 day refresh ladder                                             | `planCategorizationStudy()`                                |
| Kang (2016)                                                      | Interleaving related categories beats blocking                                                                  | daily block interleaving in the planner                    |
| Roediger & Karpicke (2006)                                       | Retrieval, not re-reading, changes memory                                                                       | refresh blocks are classification trials                   |

## The metrics (telemetry on every evaluation)

| Metric                                       | Range | Meaning                                                                                                                                                                                                        |
| -------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TSC** — Typicality Sensitivity Correlation | 0-100 | Pearson r (×100) between the learner's 1-7 ratings and Rosch (1975) norms (≥3 normed ratings) or the engine's model-predicted gradient. The behavioral fingerprint of a probabilistic category representation. |
| **CTS** — Classification Transfer Score      | 0-100 | Accuracy on never-studied transfer items (falls back to overall accuracy when none classified). Generalization, not recognition.                                                                               |
| **MCD** — Model Consistency Diagnostic       | 0-100 | Share of the learner's choices reproduced by the better-fitting formal model. High MCD = a coherent strategy, not guesswork.                                                                                   |
| **CRI** — Categorical Representation Index   | 0-100 | `0.35·TSC + 0.40·CTS + 0.25·MCD`. Maps to four maturity bands: `featural_guesser` → `typicality_sensate` → `boundary_tracer` → `dual_model_theorist`.                                                          |

The model comparison reports log-likelihood, AIC and BIC for both the
prototype and the GCM fit (deterministic grid search — same input, same fit),
plus the explicit-rule fit for `rule_boundary` sets. The **divergent items**
list shows the trials where prototype and exemplar predictions split most —
those are the trials that can discriminate which representation the learner
uses, and they seed the review deck and the daily practice blocks.

## The study-plan algorithm

`planCategorizationStudy(sessions, options)` sequences study over days — pure
and deterministic given (sessions, `now`):

1. **Per-set summary.** Session count, last practice date, latest
   accuracy/CRI, mastery flag (≥ `minSessionsForMastery` sessions, latest ≥
   `masteryAccuracy`, defaults 2 / 80).
2. **Frontier.** The first not-yet-mastered canonical set (canonical order =
   pedagogical sequence). One **frontier block** per day re-runs
   `planDiscriminatingBlock` so every scheduled trial is model-diagnostic.
3. **Expanding refresh.** Each mastered set gets a refresh block on its
   expanding ladder: +1, +3, +7, +14 days after its last session (configurable),
   capped at the horizon; elapsed steps are skipped.
4. **Budget & interleave.** `dailyBlockBudget` (default 4) caps blocks per
   day; the frontier keeps its slot, overflowing refreshes defer to the next
   day (reported in `notes`, never dropped silently), and within a day blocks
   are arranged so no two consecutive blocks come from the same set (Kang 2016).
5. **Honest rest days.** Days without blocks are reported as rest days —
   spacing needs gaps.

Every block carries its actual trials (stimulus ids, model-divergence scores,
rationales), so web, MCP, CLI and REST render identical schedules from
identical history — the parity tests pin this byte-for-byte.

## Persistence schema

`prototype_exemplar_sessions` (migration 029, **append-only** — rule 8; the
structural guard in `packages/db/tests/rules-guard.test.ts` enforces that no
UPDATE/DELETE path exists):

| Column         | Type       | Meaning                                              |
| -------------- | ---------- | ---------------------------------------------------- |
| `id`           | INTEGER PK | Row id (insertion order)                             |
| `set_id`       | TEXT       | Canonical category set id                            |
| `phase`        | TEXT       | Lifecycle phase; always `'complete'` today           |
| `trials_json`  | TEXT       | The raw submission (ratings + classifications)       |
| `metrics_json` | TEXT       | The engine's `CategorizationEvaluation` telemetry    |
| `accuracy`     | REAL       | Overall accuracy 0-100, hoisted for day-bucket stats |
| `created_at`   | TEXT       | ISO timestamp; indexed (`*_created_idx`)             |

A session is a **completed event** — no update, no delete, no resume. The
repo (`packages/db/src/repos/prototype-exemplar.ts`) exposes `saveSession`,
`listSessions`, `getLastSession`, `statsByDay` (UTC `dayKey` buckets, zero-filled),
`countSessions` and `toStudyPlanSessions` (the shared planner-history mapper).
The handler re-evaluates every `saveSession` submission server-side, so stored
metrics are always the engine's own — never client-claimed.

## Host-parity contract

All four hosts call the same pure engine and return the same envelopes:

| Host        | Surface                                                                                                                                                   | Envelope                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web handler | `POST /api/prototype-exemplar` actions `evaluate` / `plan` / `deck` / `saveSession` / `listSessions`; `GET` returns scenarios + lastSession + 7-day stats | `{ ok, evaluation }`, `{ ok, plan, schedule? }`, `{ ok, deck }`, `{ ok, session }`, `{ ok, sessions, total }` |
| MCP         | `prototype_exemplar_list_scenarios`, `prototype_exemplar_evaluate`, `prototype_exemplar_plan`, `prototype_exemplar_deck`                                  | same JSON shapes as the web handler                                                                           |
| CLI         | `learning-hub prototype-exemplar scenarios                                                                                                                | evaluate                                                                                                      | plan  | deck` (`--data`/`--file`/stdin; `--json` for machine output) | same JSON shapes with `--json` |
| REST server | `GET /cognitive/prototype-exemplar/scenarios`, `POST .../evaluate                                                                                         | plan                                                                                                          | deck` | same JSON shapes as the web handler                          |

`apps/web/tests/host-parity-prototype-exemplar.test.ts` pins the contract: for
a canonical bird-set session, every host's `evaluation`, `plan`, `schedule`
and `deck` must deep-equal the pure engine's output (and each other).

## Dashboard widget

The `prototype-exemplar` widget (`apps/web/src/components/dashboard/widgets.tsx`)
reads the extended `GET /api/prototype-exemplar` and shows the last session's
accuracy, CRI and maturity band with a "Continue training →" deep link into
`/prototype-exemplar`. States: skeleton while loading, error surfaced via
`Callout` (message from the shared transport envelope), and an honest
`EmptyState` when no sessions exist — the deep link is the only action, since
a session cannot be resumed.
