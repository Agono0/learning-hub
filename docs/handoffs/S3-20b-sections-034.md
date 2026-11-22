# Handoff — S3-20 upgrade: real sections + repeat titles + reminder offsets (migration 034)

**Worker:** W1 · **Status:** done · **Date:** 2026-11-22 · **Commit:** 262a34d

The lead applied 034 `sp-task-columns` (the exact SHARED_CHANGES requests):
`task_items.section_id`, `task_repeat_cfgs.title`, `task_reminders.offset_ms`.

## Repo (`packages/db/src/repos/tasks.ts`)

- **Reminders**: `reminderToInsert` writes the real `offset_ms` column
  (`remind_at` = `''` placeholder for relative rows); `reminderFromRow`
  decodes the column with a LEGACY FALLBACK to the pre-034 string encoding
  in `remind_at` — rows written before 034 keep resolving (034 has no
  backfill); `updateTaskReminderRow` patches the column.
- **Repeat configs**: `RepeatCfgWrite` is the full core input again —
  `title` persists (null when unnamed), update patches it.
- **Sections**: `setTaskItemSection(taskId, sectionId | null)` (integrity:
  task + section must exist) and `listTaskSectionAssignments()` (one row
  per sectioned task); `deleteSection` UNASSIGNS its tasks instead of
  dangling the reference.
- Core model untouched: `sectionId` lives in the repo/handler layer only
  (no core schema churn; the core TaskItem shape is unchanged).

## Routes

- `PUT /api/tasks/[id]/section` (`{ sectionId: number | null }`) — the
  drag-into-section write path; `GET /api/tasks-sections/assignments` —
  the page's task→section map. Both shimmed + registered.

## Page (`apps/web/app/tasks/page.tsx`)

- The management strip is GONE — true inline section headers: unsectioned
  tasks first, then each section (sortOrder) with a dashed drop-target
  header (name + task count) and its tasks; dropping a row onto a header
  assigns it; a `ListMinus` affordance on sectioned rows unassigns.
- `TaskRow` gained the optional `onUnsection` prop (renders the affordance
  only when provided).

## Tests + verification

- Repo suite 31/31 (repeat title round-trip incl. unnamed → null; reminder
  column storage + legacy fallback decode; section assign/re-assign/
  unassign/integrity/delete-unassigns). Web suites: handlers 15, batchb 9,
  page 7, detail 5, hub-registry — all green. Typecheck + lint + prettier
  green.
