/**
 * 034 — sp-task-columns (S3-08/S3-15/S3-20 follow-ups from docs/SHARED_CHANGES.md):
 *
 * - `task_items.section_id` — true section dividers in the Today list
 *   (S3-20 upgrade: headers inline + drag-into-section).
 * - `task_repeat_cfgs.title` — optional user-facing rule title (SP
 *   generates titles; the UI may rename them).
 * - `task_reminders.offset_ms` — the real storage for `relative` reminder
 *   offsets (S3-08 core model carries `offsetMs`; the repo previously
 *   encoded it inside `remind_at`).
 *
 * Additive and idempotent (`addColumn` no-ops when present). Never edit
 * after it has shipped to any device (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const spTaskColumns: Migration = {
  id: 34,
  name: 'sp-task-columns',
  up(ctx) {
    ctx.addColumn('task_items', 'section_id', 'INTEGER')
    ctx.addColumn('task_repeat_cfgs', 'title', 'TEXT')
    ctx.addColumn('task_reminders', 'offset_ms', 'INTEGER')
  },
}
