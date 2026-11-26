# Feedback Studio — Feedback Literacy & Formative Assessment

Route: `/feedback-studio` · API: `/api/feedback-studio` · Core: `@learning-hub/core/feedback-studio`

## What it is

A studio for learning to give (and receive) feedback that actually teaches.
It operationalizes three converging research programs:

1. **Hattie & Timperley (2007), _The Power of Feedback_.** Feedback works when
   it answers three questions — Where am I going? How am I going? Where to
   next? — and it operates at four levels: **task**, **process**,
   **self-regulation**, and **self**. Process and self-regulation feedback
   drive transfer; self-level feedback (person-directed praise) is the least
   effective.
2. **Kluger & DeNisi (1996), Feedback Intervention Theory.** Meta-analysis of
   3,000+ observations: mean effect d ≈ 0.41, but over a third of feedback
   interventions _reduced_ performance — typically those that moved attention
   from the task to the self. The studio's FIT risk detector flags the four
   mechanisms: trait praise, normative comparison, content-free praise, and
   ego threat.
3. **Shute (2008), _Focus on Formative Feedback_.** Seven enforceable
   guidelines: focus on the task, be specific, stay nonevaluative, keep the
   volume manageable, scaffold instead of giving the answer, include
   process-level feedback, prompt self-regulation. The audit scores a body of
   feedback against all seven.

Hypercorrection (Butterfield & Metcalfe 2001) rounds out the loop: errors made
with high confidence are corrected more thoroughly later, so the practice tab
flags high-confidence errors for prioritized review instead of hiding them.

## The three tabs

- **Practice** — misconception-tagged formative scenarios across mathematics,
  physics, statistics, programming and language learning. Commit an answer
  with a confidence rating; receive three-level feedback (task / process /
  self-regulation) written for the specific misconception you surfaced.
- **Analyzer** — paste any feedback (yours, a teacher's, an AI tutor's), one
  statement per line. The transparent cue classifier assigns each statement a
  level with per-level evidence, flags FIT risks, audits the set against
  Shute's guidelines, and reports the Feedback Quality Index:
  `FQI = 0.4·FormativeAlignment + 0.3·LevelBalance + 0.3·SelfFocusSafety`.
- **Deck** — the FSRS-6 bridge: one concept card per scenario plus one
  misconception-diagnosis card per tagged distractor, exportable as text.

## Classifier transparency

The level classifier is deliberately not a black box: it scores text against
an explicit cue lexicon (`FEEDBACK_CUE_LEXICON` in
`packages/core/src/feedback-studio/content.ts`) and returns the per-level
evidence with every classification, so a teacher can audit or contest any
automated label. A statement with no cue evidence defaults to `task` with
confidence 0.

## Multi-host parity

| Host   | Surface                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Web    | `/feedback-studio` page; `GET/POST /api/feedback-studio` (actions: `classify`, `grade_response`, `generate_deck`, `audit`)               |
| Native | same handlers through the hub registry (`handlers-registry.ts`)                                                                          |
| MCP    | `feedback_list_scenarios`, `feedback_classify`, `feedback_audit`, `feedback_grade_response`, `feedback_generate_deck`, `feedback_timing` |
| CLI    | `feedback-scenarios`, `feedback-classify`, `feedback-audit`, `feedback-grade`, `feedback-deck`, `feedback-timing`                        |
| Server | `GET /cognitive/feedback/scenarios`, `POST /cognitive/feedback/{classify,audit,grade,deck,timing}`                                       |

## Honest limits

- The classifier is lexical, not semantic: it reads surface cues. That is a
  feature for auditability and a limit for subtle text — the per-level
  evidence is there precisely so a human can override it.
- Research constants (d ≈ 0.41, >⅓ negative) are documented anchors, not
  multipliers; the engine never inflates a score with them.
- Everything runs locally and works with AI provider `none`.
