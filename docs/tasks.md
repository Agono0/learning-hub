# Tasks — the SP-parity task system

> The Super Productivity-parity task domain (Epic 3). Every claim cites its
> file; status markers cite the `TASKS.md` epic-3 IDs. Pair this doc with
> [docs/SUPER_PRODUCTIVITY_FEATURE_MATRIX.md](SUPER_PRODUCTIVITY_FEATURE_MATRIX.md)
> (the parity ledger) and [ARCHITECTURE.md](ARCHITECTURE.md) (the whole app).

## 1. Data model

All tables live in `packages/db/src/schema.ts` (drizzle, ISO-8601 strings,
JSON via `text({ mode: 'json' })`); migrations **031** (batch A), **032**
(batch B) and **034** (section_id / repeat titles / reminder offset_ms)
backfilled existing DBs. Repos: `packages/db/src/repos/tasks.ts` — the only
writer. Core domain: `packages/core/src/tasks/` (pure + zod, no I/O).

| Table                                          | Purpose                | Key columns                                                                                                                             |
| ---------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `taskProjects` (S3-05)                         | SP projects            | `title`, `notes`, `backlogFlag`, `color`, `archivedAt`                                                                                  |
| `taskTags` (S3-06)                             | Colored tags           | `name` unique, `color`                                                                                                                  |
| `taskItems` (S3-03)                            | One task row           | `parentId` (one nesting level), `projectId`, `priority` (`none                                                                          | low | medium | high`), `estimateMs`, `timeSpentOnDay`JSON (day → ms),`due`+`dueWithTime`, `deadline`, `isDone`/`doneAt`, `wonthado`, `repeatCfgId`, `sectionId`(034),`order` |
| `taskItemTags`                                 | M:N tag links          | composite PK `(itemId, tagId)`                                                                                                          |
| `taskRepeatCfgs` (S3-07)                       | Recurrence rules       | `cycle d\|w\|m\|y`, `interval`, `startDate`/`endDate`, `skipDates` JSON, `reAnchor` (`completion\|scheduled\|postponed`), `title` (034) |
| `taskReminders` (S3-08)                        | Per-task reminders     | `type` (`at_time\|relative`), `remindAt`, `offsetMs` (relative; 034), `exactAlarm` (Android)                                            |
| `taskTimeLogs` (S3-10)                         | Tracked sessions       | `taskId`, `day`, `sessionMs`, `source` (`manual\|focus\|idle`)                                                                          |
| `taskSections` (S3-17)                         | List sections          | `name`, `sortOrder`                                                                                                                     |
| `taskAttachments` (S3-37)                      | Files/URLs/commands    | `type`, `value`, `title`                                                                                                                |
| `taskArchiveTiers` (S3-11)                     | young→old auto-archive | tier + timestamp                                                                                                                        |
| `simpleCounters` + `simpleCounterLogs` (S3-31) | Habit counters         | `label`, `color`, `archived`; logs unique per (counter, day)                                                                            |
| `metricDays` (S3-30/S3-50)                     | One row per day        | `metrics` JSON, `impact` 1–4, `energy` 1–3, `reflection`                                                                                |
| `taskViews` (S3-17)                            | Saved views            | `name`, `kind`, `filter` JSON (rule chips), `sortBy`, `groupBy`                                                                         |

**Grading/append-only laws** are unaffected: task writes are ordinary CRUD
(multi-row writes transactional, `withTransaction`); time logs are append-shaped
(`task_time_logs` rows accumulate — corrections happen through new rows or
explicit repo calls, never by rewriting history).

**Derived, always computed — never stored:** Today membership (`core/tasks/today.ts`,
due-day only — S3-65), overdue (due < today, open, not won't-do), leaf-only
worklog totals (`core/tasks/worklog.ts` — parent rows fold into children,
S3-88), effective priority (`core/tasks/priority.ts`, tag strategies — S3-64),
remaining estimate (`core/tasks/estimates.ts` — S3-62).

## 2. Short syntax (S3-09)

`parseShortSyntax(input, now)` in `packages/core/src/tasks/short-syntax.ts`
— one grammar for every capture surface (Today bar, plan-for-tomorrow):

| Token                               | Meaning                                | Example       |
| ----------------------------------- | -------------------------------------- | ------------- |
| `#tag`                              | tag (created on submit if unknown)     | `#work`       |
| `+project`                          | project (created on submit)            | `+website`    |
| `10m` `1h` `1h30m`                  | estimate (chained parts add)           | `1h30m`       |
| `@today` `@tom` `@+3` `@2026-12-01` | due date (words resolve against `now`) | `@tom`        |
| `!2026-11-30`                       | deadline (separate from due, S3-63)    | `!2026-11-30` |
| `p1` `p2` `p3`                      | priority (high/medium/low)             | `p1`          |
| `@every [n]d/w/m/y`                 | repeat rule (`3d`, `w`, …)             | `@every 3d`   |
| `"…"`                               | quoted span → protected title text     | `"#todo"`     |

Unknown `@…`/`!…` tokens are dropped from the title and reported in
`warnings` (honest feedback, no silent drops). `suggestAt(input, caret)`
powers the live autocomplete (S3-68 refines the highlighting). Rendering of
user content always goes through `<Markdown>` (rule 11).

## 3. Today, planning and the exclusivity rule (S3-65/S3-49)

- **Today** = the virtual tag whose members are tasks whose DUE DAY equals
  today. Due date only — done tasks stay visible (view filters), won't-do
  ones are excluded everywhere (`core/tasks/wontdo.ts`).
- **Planned-for-tomorrow** = due day equals tomorrow
  (`tomorrowsTasks`). The exclusivity with Today is STRUCTURAL: one rule
  (due day) drives both lists, so a tomorrow-planned task never shows in
  Today, and after the day rolls over it simply becomes today's. No sync
  job exists to drift.
- `planForTomorrow(tasks, ids, today)` produces idempotent due patches —
  re-running evening planning is a no-op. The `PlanTomorrow` panel
  (`apps/web/src/components/tasks/PlanTomorrow.tsx`) is the capture UI; the
  finish-day flow (S3-29) reuses the same core calls.
- Overdue tasks form the separate "from previous days" row
  (`overdueTasks`, oldest first).

## 4. Boards, views and planning surfaces

- **Boards** (`app/boards/page.tsx` + `core/boards.ts`): two built-ins —
  **Kanban** (status columns) and **Eisenhower** (urgent × important; the
  urgent axis is data-driven: overdue or due/deadline within
  `URGENT_WINDOW_DAYS` = 7). Custom views are rule chips
  (`boardRuleChipSchema`: a `filter` half and an `apply` half — a drop sets
  `isDone`/priority/project/tags/due policy). `buildBoard(columns, tasks,
today)` assigns each open task to the FIRST matching column.
- **Saved views**: `task_views` rows persist `{name, kind, filter, sortBy,
groupBy}` via `/api/tasks-views`; the boards page additionally keeps full
  multi-column board shapes device-local (`@/lib/board-views`). List
  presentation toggles (show/hide columns, sort, group) are device-local per
  view (`@/lib/task-view-settings`, S3-44).
- **Keyboard** (S3-84): on the Eisenhower board the quadrants are a
  focusable 2×2 grid — arrow keys walk it, `X`/`Enter` picks the first task
  of the quadrant (or drops a held one), `Escape` cancels; moves announce
  via `aria-live`. (The configurable task-shortcut map — S3-35/S3-73/S3-97 —
  is planned; this table covers what ships today.)
- **Planner / schedule**: the study planner overlay and the 30-day
  schedule view work off due/estimate (`S3-25`/`S3-26`, landed); drag-to-
  schedule refinements are S3-82/S3-72.

## 5. Time tracking & worklog (S3-10/S3-18/S3-88)

- `taskTimeLogs` rows are the authoritative history; `timeSpentOnDay` on a
  task is display glue.
- Per-task totals are **leaf-only**: a parent's own rows fold into the
  child that earned them (`rollupByTask`), so aggregating never double
  counts. Week buckets are ISO (Monday start), months are `YYYY-MM`.
- `sumByProject` (UI, `TaskSummaryTable.tsx`) aggregates the per-task
  totals per project for the summary tables (S3-46).
- Break time is never logged to a task (S3-81 guard); the focus↔task
  binding (S3-34) tracks against the task during Max Focus sessions.

## 6. Reminders, repeats and evaluation

- **Per-task reminders** (`TaskRemindersDialog.tsx`): `at_time` (clock
  moment) or `relative` (offset from the due moment; presets −15m…−1d,
  +10m). `exactAlarm` requests the Android exact-alarm path (fires within
  the minute, Doze-proof — the planner flags quiet-hours deferrals). The
  global policy (master switch, quiet hours `22:00–08:00`, daily cap 3)
  lives in Settings and applies upstream; the M2-21 settings lock also
  guards these writes while a Max Focus session runs.
- **Repeats** (`RepeatConfigDialog.tsx`): cycle + interval + start/end +
  skip dates + re-anchor mode. When a date is missed: `completion`
  re-anchors from when you finish, `scheduled` keeps the calendar dates,
  `postponed` shifts the series. `nextDueAfter` /
  `projectOccurrences` (`core/tasks/repeat.ts`) are the pure projectors.
- **Evaluation** (`EvaluationSheet.tsx`): one `metricDays` row per day —
  impact 1–4, energy 1–3 (low energy is a warning tone, never danger),
  optional reflection. The tracking-reminder dialog (S3-51) surfaces
  counters/metrics with no entry for the day; a tap records it via the
  counters increment route.

## 7. Max Focus integration points

- `S3-34` (planned glue): starting Max Focus from a task binds the session
  to the task; `taskTimeLogs` rows with `source: 'focus'` record tracked
  time while the device is locked; idle subtraction (S3-33) is suppressed
  during a Max Focus session.
- The lock's settings guard (M2-21) keeps reminder policy, tags and project
  edits frozen while a session runs — plan before you lock.
- The exit path is PIN + reason (friction log) or hard cap (4h); see
  [docs/max-focus.md](max-focus.md).

## 8. Keyboard map (today)

| Surface          | Key                 | Action                                                               |
| ---------------- | ------------------- | -------------------------------------------------------------------- |
| Eisenhower board | `←`/`→`/`↑`/`↓`     | walk the quadrant grid                                               |
| Eisenhower board | `X` / `Enter`       | pick the first task of the quadrant / drop a held task               |
| Eisenhower board | `Escape`            | cancel a held task                                                   |
| Everything       | `Tab` / `Shift+Tab` | standard focus order (all controls are focus-visible per the UI law) |

The configurable task-shortcut map (K/J/X selection, `?` cheat sheet) is
S3-35/S3-73/S3-97 — tracked, not yet built.

## 9. Parity map

See [docs/SUPER_PRODUCTIVITY_FEATURE_MATRIX.md](SUPER_PRODUCTIVITY_FEATURE_MATRIX.md)
for the full SP → Learning HUB ledger (every row: done, partial with open
refs, or skipped by user) and the coverage summary.
