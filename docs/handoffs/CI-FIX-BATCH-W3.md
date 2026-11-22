# CI fix batch — W3 (CI green-chase, commits 7524096/b997875/106640b/7504fc0 + sweeped)

Fixes for the CI failures owned by W3, one group per commit:

1. **boards.test.ts (S3-24)** — the Eisenhower built-in's four quadrant
   chips shared ONE filter (`{isDone:false,wonthado:false}`), so
   `buildBoard`'s first-match rule swallowed every open task into Q1
   (`[[1,2,3,4],[],[],[]]`). Chips now filter on the data-driven axes
   (`matchesChip` gained `urgent`/`important` keys via `isUrgent` /
   `isImportant`) → four singleton quadrants, `unmatched` empty. And
   `applyChip` now parses the chip through `boardRuleChipSchema` first —
   an illegal patch (clearDue + due) throws at the boundary (the "missing
   throw case"). Test chips with `label: ''` were invalid under the schema
   and now use a real label. Verified by pure trace: assignment is
   `[[1],[2],[3],[4]]`.
2. **ics-parse.test.ts (S3-27)** — RFC 5545 unfolding removes the CRLF AND
   the fold's single space, so a break inserted directly before an original
   space is lossy (`was`␍␊` folded` → `wasfolded`). The writer's `fold()`
   now never cuts directly before a space (boundary spaces stay at the
   part's end), the test's hand-written fold uses the RFC-lossless form,
   and a writer→parser round-trip on a >75-octet title pins the guarantee.
   Verified by trace: fold/unfold round-trips exactly, including a boundary
   exactly at a space.
3. **update.test.ts (O1-01)** — `expect(ab).toBe(-ba)` fails at 0 (`-0` vs
   `0`, Object.is). The impl never emits -0 (`sign()` returns the literal
   0); the test now branches on `ab === 0` instead of negating.
4. **focus-lock-tiers.test.ts (M2-32)** — `tierChecklist('windows-basic',
   ['KeyboardHook'])` failed on separator style, not case: the delegate
   lowercased but `keyboardhook` ≠ `keyboard_hook`. `tiers.ts` now
   canonicalizes ids itself (trim + lowercase + fold `[space _ -]`), no
   longer delegating to session.ts's lowercase-only convention (that file
   is W2's in-flight surface; untouched).
5. **update-manifest-script.test.ts (O1-07)** — unknown flags now throw
   `Unknown option` BEFORE value consumption (`--nope` no longer reported
   as "Missing value"), and parseArgs is split: syntax + per-flag FORMAT
   validation in `parseArgs` (a provided value is checked immediately;
   boolean probes with minimal argv return), required-option PRESENCE in a
   new exported `validateOpts` that `main()` calls. The one committed test
   assertion that demanded presence-from-parseArgs was retargeted to
   `validateOpts` — the pair of assertions was mutually unsatisfiable for
   any always-validating parser (justification per rule 13).
6. **generate-apk-delta.test.ts (O1-21)** — (a) empty-base now expects the
   BASE error (base-first precedence is correct; the missing-target case
   was added so both branches stay covered); (b) spawn errors (ENOENT/
   EACCES/EINVAL/ENOEXEC — bsdiff not installed / shebang stub unrunnable
   on Windows) now raise `bsdiff unavailable ("…") — full APK fallback; …`
   instead of the misleading empty-patch error, while real exit-code
   failures still say `bsdiff failed`; (c) the three exec-dependent tests
   skip off-POSIX (`it.skipIf(process.platform === 'win32')`, the stubs'
   own doc says they are POSIX-only).

All six verified statically (pure-logic node traces for fold round-trip,
quadrant assignment, permission canon, parseArgs forms) — per owner rule 17
no test suites were executed locally; CI is the arbiter.
