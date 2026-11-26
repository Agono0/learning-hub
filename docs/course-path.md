# Course path

`@learning-hub/core/course-path` plans the study of an LHCF course. The page at `/course-path` is a view over it. Everything is computed in the browser; nothing is saved to the database, and skill levels and done lessons are entered by the learner.

## What it answers

- Which lessons are ready, which are "better later" (soft-locked), and why. Locks use the course rule from `curriculum/progress.ts`: a skill is locked while a direct prerequisite is below the unlock bar (`unlockProbability >= 0.7`, about pKnown 0.82). Lessons are never hard-blocked.
- Which skills unlock the most remaining work.
- A day-by-day plan to a deadline.

## Plan semantics

- The core `deadline` is **exclusive**: no study happens on that date. The page asks for the **last study day (included)** and passes the next date to the core; the plan shows the window used (`studyWindow`).
- `status` is about lesson time only: `fits`, `fits-without-reviews` (lessons fit only if no reviews are scheduled; this says nothing about recall) or `does-not-fit`.
- `prerequisiteSafe` is false when a lesson needs an unmastered prerequisite skill that no remaining lesson trains (`unmetPrerequisites`), or when lessons wait on each other (`outOfOrder`).
- Reviews: one per finished lesson at the Cepeda gap, at most 30% of a day. `reviewsOverdueUnscheduled` and `reviewsAfterLastStudyDay` are counted separately.
- Lessons without `estMinutes` count as 20 minutes and are listed in `defaultEstimate`.

## Storage

Page state lives in `localStorage` under `learning-hub.course-path.v1` (course text up to 1 MB, levels, done lessons, minutes per day, days off, last study day). Unreadable data is not overwritten; reset keeps a `.backup` copy.
