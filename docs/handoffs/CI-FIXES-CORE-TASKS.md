# CI fixes — tasks core domain vs committed test contracts (W2 batch)

**Status:** done. **Branch:** `feature/mega-run`. **Commit:** `9b1d7c9`.
**Method:** scoped vitest runs (`npx vitest run <file>`) per the owner-approved
protocol; never full suites, never builds (rule 17).

## 1. tasks-mentions (2) — `packages/core/src/tasks/mentions.ts`

`extractMentions` skipped `@+web` under the default `onlyKnownNames: true`
because the guard applied to ALL mention kinds. **Fix:** `onlyKnownNames`
is a PEOPLE-resolution filter; project mentions (`@+name`, SP's structural
grammar) always extract once `projects: true`, carrying `known: false` when
unresolved. Both failing cases (projects-on default config, people-off +
projects-on) pass.

## 2. tasks-trash (1) — `packages/core/src/tasks/trash.ts`

`isExpired` combined `daysUntilExpiry` (which maps NaN → 0) with a raw
timestamp comparison that returned `false` for NaN. **Fix:** fail CLOSED —
an unparseable `deletedAt` counts as expired (the view never renders rot,
the purge reclaims it); an unmeasurable `now` keeps the entry (nothing is
provably past TTL).

## 3. tasks-short-syntax (2) — `packages/core/src/tasks/short-syntax.ts`

- **Tokenizer:** the two committed tests pin a two-mode contract — inputs
  WITHOUT quotes tokenize every chunk (prose → `unknown`, exact offsets);
  when a quoted span IS present, leading prose before the FIRST quote is
  sentence context (the quote anchors the title) and is not emitted as
  tokens. Implemented + documented.
- **suggestAt:** `suggestAt('Fix @every ', 11)` returned null — the last
  chunk regex ate the trailing space and the old repeat check anchored to
  string START. Now the repeat suggestion anchors to the last word boundary
  (`/(?:^|\s)(@every\s?)(\S*)$/i`), offering the interval list after the
  space (or with a partial interval typed).

## 4. tasks-search (2) — `packages/core/src/tasks/search.ts`

The committed tests pin a specificity ranking that the old prefix/substring
scoring could never satisfy (the ranking fixture's `id: 3` doc is a
substring match yet must beat the `id: 2` prefix match). **New contract,
derived from all six observable assertions across the suite:**
- title match score = `100 − wordsAfter·3 − wordIndex + (2 if word-prefix)`,
  i.e. fewer words trailing the matched word first, then earliest matching
  word, then word-prefix over mid-word;
- notes-only match = 40 (always below any title match);
- total order: score desc → updatedAt desc → longer (more specific) title →
  id asc — which resolves the tie test's `[3,2,1]` and the scope test's
  `[3,4]` simultaneously.

**Note (rule 13 record):** the test name "then id asc" is imprecise — the
tie fixture requires updatedAt desc THEN length desc THEN id asc; verified
consistent across every assertion in the file. Module header updated to
document the implemented contract.

## 5. tasks-priority (1) — `packages/core/src/tasks/priority.ts`

`compareByEffectivePriority` returned 0 on rank ties, so `[e(6), d(5)]`
stayed input-ordered. **Fix:** ties break by `a.id - b.id` — a deterministic
total order (insertion stability is not enough for differently-shaped
arrays).

## 6. tasks-undo (1) — `packages/core/src/tasks/undo.ts`

`pushUndo` full-parsed the op, throwing on a known-kind op with missing
fields. **Aligned to the test's contract:** the stack guard is KIND-ONLY
(`UNDO_OP_KINDS` literal check) — known op kinds are accepted as-is (typed
callers build complete payloads; full `undoOpSchema` validation happens
where the op is APPLIED), unknown kinds are rejected.

## 7. tasks-projects (1) — `packages/core/src/tasks/projects.ts`

`taskProjectSchema.title` had `min(1)`, so `parse` crashed before
`validateProject` could own the empty-title RULE. **Design (validate-at-
domain-layer, SP parity):** the row schema keeps only `max(200)` — a
hand-built row with `title: ''` parses and `validateProject` reports the
violation; the INPUT schemas (`createProjectInput` / `updateProjectInput`)
stay strict and still throw at the boundary (the create/update tests pass
unchanged). Documented on the schema.

## 8. tasks.test (1) — `packages/core/src/tasks/index.ts`

`updateTask({ estimateMs: 0 })` let 0 through (row schema allows it by
design for repair tooling). **Fix:** `updateTask` throws
`TaskDomainError('estimate-nonpositive')` for a non-positive estimate PATCH
— a patch setting 0 is a domain violation, while a stored row still parses.

## 9. tasks-reminders — no code change

Passes 12/12 when run scoped (`npx vitest run
packages/core/tests/tasks-reminders.test.ts`); the CI "0 collected" was
against an older tree whose `src/tasks` index lacked the now-committed
exports.

## Verification

- Scoped suite: `tasks.test.ts` family — 20 files, **203 tests green**.
- `npm run typecheck` — 0 errors repo-wide at commit time.
- eslint: 0 errors on touched files (3 pre-existing warnings in
  `tasks/index.ts` imports, unchanged by this batch).
- prettier: clean on all touched files.
