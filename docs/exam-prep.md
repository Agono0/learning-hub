# Exam prep

A day-by-day review schedule toward an exam date. It uses the same FSRS memory
model as [exam readiness](./readiness.md) and is read-only: it never
schedules, reviews or changes a card.

## What it does

For each study day from today up to the day before the exam, the planner asks,
for every studied card: "if I review this card on that day and remember it, how
much higher is its recall on exam day?" It takes the best `perDay` cards that
clear `minGain`, in that order, then moves each chosen card's simulated state
forward so later days see the spacing already chosen.

- Rest weekdays (UTC, 0 = Sunday) get no reviews.
- A card appears at most `maxReviewsPerCard` times in the whole plan.
- Suspended cards are skipped. New cards you have not studied are counted
  separately and are never planned or treated as forgotten.
- A bare exam date counts through the end of that day (UTC).
- Output is deterministic for fixed inputs: ties break on card id.

## What the numbers mean

- They are model estimates, not validated exam scores, and carry no statistical
  interval.
- The no-review baseline and the scenario are reported apart. The scenario
  assumes every planned review is made on its day and answered Good.
- The schedule is a greedy heuristic, not an optimal plan.
- The figures measure recall on the exam day only. A smaller plan is not
  evidence of better learning, and a bigger one is not a promise.
- Every API, CLI and MCP result carries these assumptions. The headline
  sentence in the page carries the model qualifier, the as-of date, the exam
  date and the baseline inside the sentence itself.

## Surfaces

| Surface | Entry |
| --- | --- |
| Page | `/exam-prep` |
| API | `GET /api/exam-prep?examId=3` or `?date=2026-12-01&title=Final` |
| CLI | `learning-hub exam-prep plan --exam 3 --per-day 30 --rest 0,6` |
| MCP | `exam_prep_plan` |

API options: `target` (0.5-0.99), `perDay` (0-100), `minGain` (0-0.5),
`maxReviewsPerCard` (1-10), `rest` (comma list of 0-6), `deckIds`. Bad input is
a 400, an unknown exam is a 404. All three surfaces call one function,
`runExamPrep` in `packages/db/src/repos/exam-prep.ts`.

## Opening a day in the review queue

A day's "Study these cards" link goes to `/review?cardIds=1,2,3`. The review
API accepts that optional list:

- No `cardIds` means the ordinary queue, unchanged.
- The list is 1-100 distinct positive integers. Malformed, empty, duplicate or
  too long lists are a 400. They are never trimmed silently.
- Every id must be reviewable. An unknown, suspended or buried card, or one
  outside a given `deckId` or `courseId`, rejects the whole request with the
  offending ids named.
- Cards come back in the order given and are not limited to those due. Reviewing
  early is what exam prep is for, and the review still goes through the one
  canonical `POST /api/review`, so grading, scheduling and undo are unchanged.
- The server never answers for you. Real reviews are made by you.

## Honest scope

Grading is client-controlled and honor-system. The app is single-tenant, so
there is no per-user authorization beyond the owner. A plan is not re-forecast
after you review; reload it to see the new state.
