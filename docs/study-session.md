# Study session

Pick a bounded set of cards by what they are, check the list, and open exactly
those cards in the review queue.

Open **Study session** in the sidebar, or use the CLI and MCP tool below. It is
single-tenant (one owner) and for personal practice.

## What you can filter by

| Filter            | Meaning                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| Deck              | Cards in one deck, or all decks.                                                    |
| Tags              | A card must carry every tag you list. Matching is exact, like the card browser.     |
| States            | New, Learning, Review, Relearning. None chosen means all.                           |
| Lapses            | At least this many (CLI and API also take a maximum).                               |
| Estimated recall  | Only cards whose estimated recall right now is below this percent.                  |
| Due               | Due now or overdue, within 7 days, within 30 days, or any (API: `dueByDays` 0-365). |
| Order             | Most overdue, lowest estimated recall, most lapses, or newest first.                |
| Cards per session | 1 to 100.                                                                           |

Suspended and buried cards are never picked, because the review queue refuses
them. The page says how many were left out.

## The 100-card cap

A session holds at most 100 cards. That is the review queue's explicit-list cap
(`MAX_EXPLICIT_CARD_IDS`), and a test keeps the two numbers equal. Start never
truncates or silently trims the list. If more cards match than the session
holds, the page says how many more matched and that the list is cut by your
chosen order, not at random.

## Start opens exactly the list you checked

Start opens `/review?cardIds=<ids in order>`. Before it does, the page runs the
same filters again. If the set changed since the preview you are looking at (a
card was suspended, buried, answered or edited), it shows the new list and waits.
It never opens a different set than the one you checked. If a card changes
after that, the review queue itself refuses the list and names the cards, and
you can preview again. The default review queue is unchanged.

Previewing writes nothing. Reviews are made by you in the normal queue and count
as real reviews. Nothing is simulated into your history.

## Estimated recall

Estimated recall is a model estimate. It uses the default FSRS-6 forgetting curve
with each card's stored stability and last review, as of the date shown. Your
fitted weights are not applied. It is not a validated prediction. New cards and
cards with no stored stability or last review have no estimate, and the recall
filter skips them (the page counts how many).

## Bounds

Every entry point (page, API, CLI, MCP) validates through one core function.
An unknown option, a wrong type, an out-of-range number or an empty list is an
error, never clamped.

- At most 50 decks, 10 tags (60 characters each), 100 cards, 365 days, 1000 lapses.
- The selector scans every card in scope and does not sample. If more than
  50,000 cards are in scope the request is refused and asks you to choose
  decks. The selector alone took about 60 ms over 50,000 synthetic rows. The
  database read was not benchmarked. This is not a throughput guarantee.
- Only card columns are read for selection. Card text is fetched for the picked
  cards only (at most 100).

The existing card browser (`GET /api/cards`) applies its tag filter after its
row limit, so on a large collection it can miss matching cards. This feature does
not change it. The study-session selector filters before it limits.

## API, CLI, MCP

```
GET /api/study-session/preview?tags=bio&states=2&minLapses=3&sort=most-lapses&limit=20
learning-hub study-session preview --tags bio --states 2 --min-lapses 3 --sort most-lapses --limit 20 [--json]
study_session_preview { tags: ["bio"], states: [2], minLapses: 3, sort: "most-lapses", limit: 20 }
```

Each response carries the per-filter funnel (the count after each step, so an
empty result says which filter emptied it), `assumptions`, `fingerprint` (a hash of
the ordered ids), `startHref`, and a `note` that nothing is scheduled for you.

## Not covered

- A "preview without scheduling" or cram mode. That needs a new write path and a
  history decision, so it is not part of this feature.
- Full-text search across card content.
- Saved or shared sessions.
