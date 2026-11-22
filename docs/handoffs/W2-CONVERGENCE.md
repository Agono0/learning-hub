# W2 convergence lane — full reconciliation + the final builds

**Status:** done. **Worker:** W2. **Commits:** `a898ffa` → `f59650f` (this
batch). **Result: TASKS.md is 159/160 `[x]` — the single open row is X-04
(the lead's ship gate: CI green + PR open, which needs the lead).**

## PART 1 — the 18 open rows, audited then closed

**Audited DONE (deliverable already existed — swept into other workers'
commits):** S3-87 (S3-36 markdown service + paste wiring, `bfddedc`/
`bf749f2`), S3-37 (S3-21 TaskDetail attachments, `b50850f`), S3-81 (core
time-tracking break guard + its test), S3-83 (S3-27 calendar color +
visibility, W3), S3-70 (S3-20 MultiSelectBar; project/tag moves are a
documented design choice), S3-69/71/73 (the tasks-page stack —
subtaskProgress chip, context actions, J/K/X/? keyboard nav — landed in
W1's `02f3af3`/`262a34d` family), S3-67 (FTS5, `e0b4482`), S3-97
(docs/tasks.md §8 is the map table).

**Built this batch (scoped vitest per task):**
- **S3-32 + S3-80 + S3-34** — `core/tasks/focus-modes.ts` (pomodoro
  cadence/long-breaks, flowtime earned breaks, countdown) + FocusModePicker
  on the focus page; `countdownMinutesFor` = the task's remaining estimate;
  the state carries `taskId` (S3-34 binding). 14 tests. zod v4
  `.prefault` fix (`5335bbe`) cleared the last typecheck blocker.
- **S3-33 + S3-78** — `core/tasks/idle.ts` (jitter/break/discard gate,
  subtraction cap, Max Focus suppression) + `apps/native/src-tauri/src/
  idle.rs` (`system_idle_ms` via self-contained user32/kernel32 externs —
  NO Cargo feature needed; registered in lib.rs) + `IdleClassifyDialog`.
  15 tests. Optional crate-feature upgrade noted in SHARED_CHANGES.
- **S3-35** — `core/tasks/shortcuts.ts` (default map mirroring S3-73, combo
  grammar, conflicts, event resolver incl. the `?` duality) +
  `ShortcutsSection` settings UI over device-local overrides. 16 tests.
- **S3-76** — device-local trash store + `TrashView` (restore/purge,
  days-left badges). 6 tests.
- **S3-90/S3-31** — `core/tasks/counters.ts` streaks + `CounterStatsPanel`
  (streak badges, 14-day sparkline, +1 tap). 12 tests.
- **S3-79** — `core/tasks/summary.ts` `dailySummaryText` (honest zero
  state, leaf-aware tops, evaluation line). 4 tests.
- **S3-77** — `TrackedTaskIndicator` chip (title half was S3-43's
  `useTrackedTitle`). 4 tests.
- **S3-93** — notes↔project linking: `fields.projectId` +
  `GET /api/notes?projectId` (json_extract, no schema change). 4 tests.
- **S3-96** — LazyChart wrapper (ImpactStars already existed). 5 tests.
- **S3-40** — `SpFirstRunStep` spliced into the wizard as step 5/5
  (arithmetic nav, hydration-safe todayIso). 4 tests.

**Left to their owners (not mine):** S3-82/94/95 (W1's planner/schedule
refinements — noted as open refinements on DONE matrix rows), S3-74/75
(W1's projects extras, same).

## PART 2 — matrix + gate

- `docs/SUPER_PRODUCTIVITY_FEATURE_MATRIX.md` second sweep: **45 done,
  8 exists, 4 partial (platform rows with user-skipped refinements),
  0 missing, 8 skipped** — §9 recount + §10 convergence statement. Every
  S3 row that flipped cites its refs.
- `TASKS.md`: every S3 row `[x]` (159/160; only X-04, the lead's PR gate,
  remains open).
- **Local gate at close:** `npm run typecheck` 0 errors · `npm run lint`
  0 errors (warnings: 9 in other workers' files — SimpleCounters/
  WindowedTaskList; 1 mine, fixed) · prettier clean on every touched file.
- Scoped sweeps: tasks core family 80/80, web task suites 47/47, trash +
  indicator + picker + counters + shortcuts + idle + notes-linking suites
  all green at HEAD.

## Known follow-ups (mount-glue, no new features)

- Mount `CounterStatsPanel` on the habits page, `TrashView` under the
  tasks page, `ShortcutsSection` in Settings' SP area, `IdleClassifyDialog`
  polling in the timer glue, `FocusModePicker` task binding via /api/tasks
  — all one-line mounts documented in the per-task handoffs.
