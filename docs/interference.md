# Interference & Lookalikes

Cards that look alike compete when you try to recall them. When two cards share a question but have different answers, learning one makes the other harder to recall (proactive and retroactive interference: McGeoch 1942; Underwood 1957). When many facts hang on one cue, recall gets slower and less accurate (the fan effect: Anderson 1974). Underwood found that spacing the competing items reduced the interference. This feature finds the suspects, shows whether your reviews back the suspicion, and gives you ways to pull the cards apart. It reads cards and reviews and never changes a card, a schedule or a review.

## What it does

- **Detect.** Each usable card (basic, cloze, type-in and multiple choice with one correct option) is reduced to a question and an answer. Words are matched after light stemming, and Chinese, Japanese and Korean text by character pairs. An inverted index over rare words finds candidate pairs without comparing every card with every other. A word shared by at least the larger of 30 cards and 5% of the cards, or by more than 60 cards, does not link cards. Each candidate is scored by the larger of word overlap and trigram overlap, for the question and the answer separately.
- **Kinds.** `same-cue-different-target` (question similarity at least 0.45, answer similarity under 0.5) is the classic case and scores highest. `same-target-different-cue` (answer similar, question not) is a fan, usually harmless. `lookalike` is similar on both sides. `near-duplicate` is 0.85 or more on both sides: merge or delete one.
- **Review evidence.** For each pair, a review of either card counts as exposed when the other card was reviewed in the 24 hours before it. The audit compares the failure rate (rating Again) of exposed reviews with the rest and reports the difference with a 95% interval. At least 8 reviews are needed in each group. The interval is Newcombe's (Wilson-based), which stays valid near 0% and 100%. A pair is `interfering` only when the whole interval is above 5 points. It still treats reviews as independent, so it is optimistic.
- **Severity.** A kind-based base score (0 to 1), plus 0.25 when the evidence says `interfering`, plus 0.2 when you confirmed the pair. Bands: high from 0.55, watch from 0.30. Near-duplicates never get the evidence boost.
- **Decisions.** Confirm a pair you really confuse, or dismiss one that is not a problem. Dismissed pairs are hidden. Clearing keeps the row, so it syncs.
- **Drill.** A four-item discrimination drill (A, B, B, A) followed by a prompt to state the difference, with the words that differ as a hint. Answers are tallied per pair per day.
- **Review order.** Spreads a queue so two cards of a flagged pair are at least `gap` positions apart (default 5, at most 20). It only reorders: every id appears once. Dismissed pairs, near-duplicates and low-severity pairs are ignored.

## Limits and honest caveats

- Similarity is about wording. Synonyms are not linked and a pair can look alike on paper without ever being confused.
- The evidence is observational. Cards reviewed together may share a hard topic.
- Similarity thresholds, the 24-hour window and the severity weights are heuristics, not validated cut-offs.
- At most 1500 cards (the lowest ids first) and 200000 candidate pairs are examined, at most 200 pairs are shown, and at most 100000 recent reviews are read. When any cut applies the audit says it truncated: narrow it to one deck.
- Pair decisions are capped at 2000, drill day-rows at 5000, and 200 drill answers per pair per day (409 from the API).

## Surfaces

| Surface | Entry                                                         |
| ------- | ------------------------------------------------------------- |
| Web     | `/interference`, `GET` and `POST /api/interference`           |
| CLI     | `interf audit\|confirm\|dismiss\|clear\|drill\|log\|order`    |
| MCP     | `interf_audit`, `interf_pair`, `interf_drill`, `interf_order` |

`POST` actions: `confirm`, `dismiss`, `clear`, `drill`, `drill-log`, `order`. Validation errors return 400, limits return 409, a missing card returns 404.

## Sync

`interference_pairs` and `interference_drills` are synced, mutable tables resolved by last write wins on `updated_at`. Their natural keys use the two card ids in sorted order (after the ids are mapped to the local cards), plus the UTC day for drills. Cards are matched across devices by their own natural key, so a pair follows its cards. A drill day-row holds counts, so if two devices drill the same pair on the same day, the newer write wins and the other count is lost. Nothing is hard-deleted.

## Templated decks

Cards are linked by shared words, by the same first three words of the cue, and by an identical answer. Words that appear in too many cards are skipped and counted (`skippedWords`); for a deck of cards like "Capital of X" the shared-prefix and shared-answer links still find candidates. Per-card text features are computed once per scan. Cards that share nothing with any other card are counted as `unlinkedCards` and the report says so rather than claiming no lookalikes.
