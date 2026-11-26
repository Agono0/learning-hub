# Elaborative Interrogation

Elaborative interrogation (EI) asks the learner to explain **why** a stated fact is true instead of re-reading it.

## Research basis

- Pressley, McDaniel, Turnure, Wood & Ahmad (1987): "why" questions roughly doubled factual recall in adults and children.
- Woloshyn, Pressley & Schneider (1992): the gain depends on prior knowledge. With little knowledge the effect shrinks, so low-prior-knowledge facts start at the easiest prompt level.
- Dunlosky et al. (2013): rated "moderate utility" among common study techniques.
- Bjork, Dunlosky & Kornell (2013), Dunning & Kruger (1999): learners overrate shallow understanding, which is why the page asks for a prediction before grading and reports calibration.

## What is on main after this change

| Surface     | Where                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine      | `packages/core/src/elaborative-interrogation/` (`index.ts`, `calibration.ts`, `scheduler.ts`, `authoring.ts`, `report.ts`), public entry `@learning-hub/core/elaborative-interrogation` |
| Web handler | `apps/web/src/server/handlers/elaborative-interrogation/route.ts` (`/api/elaborative-interrogation`)                                                                                    |
| Page        | `apps/web/app/elaborative-interrogation/page.tsx`                                                                                                                                       |
| CLI         | `ei prompt                                                                                                                                                                              | grade | lint | styles` |
| MCP         | `ei_prompt`, `ei_grade`, `ei_extract`, `ei_lint`, `ei_calibration`                                                                                                                      |

## Engine

1. **Fact kinds.** A statement is classified as `causal`, `contrast`, `quantitative`, `categorical` or `general` by wording. The kind picks the prompt templates.
2. **Ten prompt styles**, unlocked by level 1 to 4: why-true (1); prerequisite, mechanism (2); why-not-otherwise, analogy, predict-outcome (3); contrast-case, counterexample, transfer, teach-back (4).
3. **Rubric grading (100 points, six visible items).** Length 15, causal reasoning 25, key-idea coverage 20, own words 20, links to prior knowledge 10, specificity 10. Copying the statement (80% overlap and under 25% new wording) is flagged and scores 0 on own words. Hedges cost specificity points. It is a heuristic coach. It does not check that the explanation is true.
4. **Bands.** restating, shallow (under 42), developing (42 to 61), solid (62 to 79), deep (80+).
5. **Adaptive state per fact.** Two solid or deep answers in a row raise the level. Restating or shallow drops it. Interval grows x2.2 after a good answer, x0.8 after a developing one, and resets to 1 day after a weak one.
6. **Queue.** Overdue facts first (most overdue first), then new facts with the lowest prior knowledge first. Facts not yet due are skipped.
7. **Scheduler bridge.** `gradeToFsrsRating` maps a grade to FSRS 1 to 4 (copied answers are always 1). `blendIntervals` takes the shorter of the EI and FSRS intervals unless the answer was deep. `newFactBudget` and `dueForecast` keep daily load bounded.
8. **Calibration.** Predicted vs actual score gives mean bias (with a +-8 point dead zone), mean absolute error, Brier score and resolution. `calibratedLevel` lowers the level for overconfident learners and raises it for underconfident ones after 5 attempts.
9. **Authoring lint.** Flags short, long, relation-less, bare-definition and duplicate facts (Jaccard similarity of 0.7 or more).

## Data and persistence

Two routes share the same core logic:

- `/api/elaborative-interrogation` is stateless. The page keeps facts, per-fact state and calibration points in browser `localStorage` (`lh.ei.v1`) and sends them with each call.
- `/api/elaborative-interrogation/bank` is database-backed. `GET ?today&limit` returns facts, states, the queue, calibration and recent attempts. `POST` takes `add`, `import`, `attempt` (grades, then writes the attempt and the updated state in one transaction) and `archive`. Stored facts use ids like `db12`.

Tables (created at open from `schema.ts`, no migration needed): `ei_facts`, `ei_fact_states` (one row per fact, cascade delete) and `ei_attempts` (append-only, listed in the sync append-only set). Archiving a fact keeps its attempts. Repo: `packages/db/src/repos/elaborative-interrogation.ts`.

## Free Recall (brain dump)

`@learning-hub/core/free-recall`, `/api/free-recall`, page `/free-recall`, CLI `ei recall <passage> <recall>`, MCP `free_recall_score`.

The learner studies a passage, hides it and writes what they remember (Roediger & Karpicke 2006; Karpicke & Blunt 2011: retrieval practice beats re-reading and concept mapping). The passage is split into idea units (sentences and semicolon clauses with at least 4 content words), each weighted by how rare its terms are inside the passage. A unit is recalled at 60% term coverage, partial at 30%, otherwise missed. The report adds weighted recall score, precision, sentences that match nothing (possible intrusions or errors), order fidelity (longest in-order run of matched units) and a band. `gapsToEiFacts` turns missed and partial units into Elaborative Interrogation facts, and `nextStep` and `suggestedDelayMinutes` plan the next round (retry, explain, or done; 10 minutes to 24 hours by score). Matching is lexical, so a paraphrase that shares no words is not credited.

## Limits

- Answers are capped at 4000 characters, banks at 200 facts, pasted text at 60,000 characters.
- Grading uses English wording cues. Other languages will score low on the causal-marker item.
