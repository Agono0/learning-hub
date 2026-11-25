# Course authoring workbench

Page: `/course-authoring`. Core: `packages/core/src/curriculum/authoring/`, imported as
`@learning-hub/core/curriculum/authoring`. Everything runs in the browser on pasted LHCF text.
Nothing is uploaded, saved or published.

## What it does

- **Review.** Heuristic findings on exercises, objective alignment, duplicates and time.
- **Restructure.** Move, rename, split and merge operations with a preview, an explicit apply and
  a revalidation before the result is accepted.
- **Compare and merge.** Keyed diff of two LHCF versions and a three-way merge. Conflicts, renames
  and moves are listed for the author; none are resolved silently.
- **Export.** A static review packet (HTML). Course text is sanitized, nothing is loaded from a
  remote origin, and the output has a size cap.

## Rule families

| Prefix   | Covers                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| `ex.`    | Exercise construction (options, cloze, code tests, rubrics, answer leaks, hints).    |
| `align.` | Objectives and outcomes versus lessons and exercises, Bloom level fit.               |
| `dup.`   | Near-duplicate exercises, titles, terms, objectives, exam items copied from lessons. |
| `time.`  | Author-entered minutes against a text-length reference.                              |

Parsing, normalizing, validation and stats reuse the existing LHCF code. Similarity uses the core
linter helpers.

## Caveats

- Every finding is a heuristic with a rule ID, the evidence that triggered it and a note on when it
  is a false positive. Findings make no claim about teaching quality.
- Minutes are what the author entered. They are not measured learner time.
- Ignoring a finding only hides it in the current session.
- Lesson and skill graph lint stays in course-path and is not duplicated here.
