/**
 * 001 — baseline: the column/index patches that used to live inline in
 * `ensureSchema()` (pre-migration-runner databases may lack any of them).
 */
import type { Migration } from './runner'

export const baseline: Migration = {
  id: 1,
  name: 'baseline',
  up(ctx) {
    // FSRS retrievability at review time (analytics / calibration).
    ctx.addColumn('revlog', 'retrievability', 'REAL')
    // Extra HTTP headers (JSON) for the 'custom-endpoint' AI provider.
    ctx.addColumn('user_settings', 'ai_headers', 'TEXT')
    // Base64 image bytes — uploads persisted in the DB itself (webview has no fs).
    ctx.addColumn('images', 'data', 'TEXT')

    ctx.createIndex('cards_suspended_due_idx', 'cards', ['suspended', 'due'])
    ctx.createIndex('courses_track_idx', 'courses', ['track_id'])
    ctx.createIndex('units_course_idx', 'units', ['course_id'])
    ctx.createIndex('lessons_unit_idx', 'lessons', ['unit_id'])
  },
}
