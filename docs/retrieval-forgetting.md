# Retrieval Forgetting Guard

Practising some cards can make similar cards harder to recall. This guard finds the cards at risk and helps you rescue them. It never changes a card, a schedule or a review.

## The research

Anderson, Bjork and Bjork (1994) had people practise some items from a category ("Fruit: ap___") and later tested all of them. Unpractised items from the practised categories were recalled worse than items from categories never practised. The practised item wins the competition, so its rivals get suppressed. Findings the guard uses:

- The effect needs a shared cue and different targets. Cards whose answers overlap (integrated knowledge) help each other, so they are not treated as competitors.
- It grows with the number of retrievals but saturates after a few (the guard caps at 3).
- It is cue-dependent. Testing the neglected item from an independent cue avoids it, which is why the rescue queue offers a reverse probe (show the answer, ask for the cue).
- Practising the whole category together limits it, which is what balanced sessions do.

The scores are heuristics over card wording and review history, not a memory measurement. Both the page and the API say so.

## How it works

Core (`packages/core/src/retrieval-forgetting/`, pure functions):

| File          | Job                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cues.ts`     | Types, defaults, cue and target extraction for basic, cloze, type-in and multiple-choice cards, tokenizer. Leaf module.                                                                                                                                            |
| `clusters.ts` | Competitor edges (cue similarity at least 0.34, answer overlap at most 40%) and clusters. Candidate pairs come from an inverted index, very common words are ignored, groups over 12 are split or trimmed.                                                         |
| `risk.ts`     | Per-card risk: competitor load (successful retrievals in the window, weighted by how strongly the cards compete, saturating at 3) x fragility (1 minus FSRS retrievability) x cushion (own recent successes). Bands: watch from 25%, high from 50%. Group balance. |
| `audit.ts`    | Runs the pipeline. Scope is capped at 1500 cards and says so.                                                                                                                                                                                                      |
| `plan.ts`     | `rescueQueue`, `expandSession` (adds suppressed siblings to a due list within a budget), `interleaveByCluster`.                                                                                                                                                    |
| `report.ts`   | Headline, advice, caveats.                                                                                                                                                                                                                                         |

DB (`packages/db`): `rif_audits` keeps one summary row per saved audit (append-only, for a trend line). `rif_dismissals` holds cards you excluded. Both sync between devices: audits union by deck and time, dismissals by card. Repo: `repos/retrieval-forgetting.ts`. Suspended cards and unsupported card formats are skipped, and undone reviews are ignored.

## Surfaces

- Page: `/retrieval-forgetting` (deck and look-back filters, rescue queue with reverse probes, groups, saved history).
- API: `GET /api/retrieval-forgetting?deckId&windowDays`; `POST` with `action` of `save`, `dismiss`, `restore` or `plan`.
- CLI: `rif audit|rescue|dismiss|restore|plan` (see `rif` usage).
- MCP: `rif_audit`, `rif_rescue`, `rif_dismiss`, `rif_plan`.

## Limits

- Text similarity cannot see meaning. Two cards about the same category in different words may not be linked, and unrelated cards with shared words may be.
- Reviews only show retrievals the app saw. Practice elsewhere is invisible.
- History keeps at most 500 saved audits (the same audit saved twice is one row) and 2000 dismissed cards; past that the API answers 409.
- Dismiss a card when the imbalance is deliberate.
