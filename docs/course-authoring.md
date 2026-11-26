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

## Safety behavior

- **Missing skills.** A refactor that would leave a reference to a skill that does not exist is refused.
  A merge where one side deleted a skill and the other started using it is reported as a problem
  and never produces a finished course. Validation is not allowed to recreate or drop the reference.
- **Rename skill.** Slug references are always rewritten. A display-name reference is rewritten only
  when no other skill has the same name; otherwise it is left alone and a warning says so.
- **Merge lessons.** Every loss is listed in the preview: reflection prompts over 10, key terms
  defined differently, resources with the same URL but different text, minutes over 600, and the
  absorbed lesson's progress (progress is stored by lesson slug).
- **Order.** Any operation that makes a skill first appear before its prerequisite warns.
- **Renames in a compare** show as one removed and one added entity, not as a rename. Exercises
  paired by similarity show both texts, the score and whether another exercise scored within 0.1.
- **Preview token.** A 128-bit digest of the course and operation. It detects a stale preview and is
  not a security boundary. Apply checks it and validates again.
- **Packet.** The file carries only four fixed meta tags; the export check fails on any other.
  Nothing loads automatically; external links open only when clicked. A meta policy cannot stop
  other sites from framing the file, and no framing protection is claimed. Ordering, parsons,
  matching and categorize items are shown in a hash order that is never the author order.
  Worked examples are always included with their answers; the packet warns when answers are
  otherwise excluded. An unclosed code fence produces a warning.
