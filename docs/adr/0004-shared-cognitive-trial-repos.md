# 0004. One derivation path for cross-host trial pipelines (shared repos + undo parity)

- Status: Accepted
- Date: 2026-11-18

## Context

The metacognition calibration and hypercorrection-crucible pipelines derive
"trials" from the append-only `revlog`. Three hosts (web handler, headless
REST server, MCP tool) each re-implemented the query and the row→trial
mapping, and the copies had drifted in a user-visible way:

- Only the web handlers excluded undone reviews (`revlog_undos` tombstones).
  A review the learner erased still counted as a miss/success on the server
  and in MCP, so the same learner history produced different calibration
  reports per surface.
- The confidence→forecast and grade→outcome mapping was re-inlined per host,
  so a change to the mapping had to be replicated by hand in three places.

The repo already prescribed the destination for shared queries
(`packages/db/src/repos/` — "put a query here as soon as a second caller
needs it"), but nothing enforced parity for derived analytics, and no test
compared the hosts.

## Decision

- **Core owns mappings, db owns queries.** Row→trial derivation functions
  live in `packages/core/src/metacognition` (`correctionTrialsFromRows`,
  `toTrialMetacognitiveRecords`, `judgmentOfLearningFromRevlogRows` — the
  last one added by this ADR); the undo-excluded, cards-joined revlog query
  and the reconstruction entry points live in exactly one place,
  `packages/db/src/repos/cognitive-trials.ts`.
- **Undone reviews never count as trials, on any host.** The tombstone
  semantics of `revlog_undos` (Hard Rule #8: revlog is append-only, undo is
  tombstones) imply an undone review is not an event. Web's stricter
  semantics become the semantics everywhere.
- **Orphan rows drop everywhere.** The shared query inner-joins `cards`, so
  trials for deleted cards are excluded on all hosts (server/MCP behavior
  prevails here; web previously kept orphans).
- Each host keeps its own sampling window (`limit`) for now — unifying it is
  a separate, deliberate change (tracked as TD-03 in
  [`docs/tech-debt.md`](../tech-debt.md)).
- The same pattern (C3 in `docs/contracts.md`) applies to every future
  derived query used by more than one host; a cross-host parity test is the
  follow-up enforcement (TD-04).

## Consequences

- Server and MCP results change: erased reviews no longer inflate error
  counts, calibration trials, or crucible queues. This is the intended fix;
  web results are unchanged except that orphan-card trials are dropped.
- `/cognitive/metacognition/hypercorrection` on the headless server now
  honors its optional `deckId` query parameter, which its schema already
  declared but the handler ignored.
- New derived queries have one address to live at, and the drift class —
  same learner, different answer per host — has a named owner: the repos
  layer, with the parity test as its future gate.
