# Exam readiness

Estimates how much of your studied card memory the FSRS model expects you to recall on an exam date, with no further review and under a hypothetical review plan. Read-only.

## Surfaces

- Page: `/readiness` (pick a saved exam or any date, a scenario, a target and a review budget).
- API: `GET /api/readiness` lists exams. `?examId=` or `?date=YYYY-MM-DD&title=` returns a report. Options: `plan=none|on-schedule|capacity`, `perDay`, `target` (0.5-0.99), `deckIds`, `budget`.
- CLI: `learning-hub readiness exams` and `learning-hub readiness report --exam 3 [--plan capacity --per-day 15 --target 0.85 --decks 1,2 --budget 20] [--json]`.
- MCP: `readiness_exams`, `readiness_report`.

All three share `runReadiness` in `packages/db/src/repos/readiness.ts`, so they return the same figures. Every result carries `assumptions`.

## What the numbers are

- Model estimates from FSRS and your review history. They are not validated exam scores and carry no statistical interval.
- The "history" label (insufficient, low, moderate, good) only says how much data there is.
- The no-review baseline is kept apart from the review scenario. The scenario assumes each planned review happens on the first possible day and is answered Good. It is not a prediction.
- Figures are recall on the exam day only. A plan with fewer or later reviews can score slightly higher on that one day (FSRS grows stability more from a review made at lower recall), so a lower review count is not evidence of better learning. A test pins one such case.
- New cards are counted separately and are not treated as forgotten.
- A bare exam date counts through the end of that day (UTC).
- The "reviews needed" figure assumes one remembered review per card today.

## Limits

Single-tenant, local data only. Nothing is written.
