/**
 * 002 — Curriculum v2 (LHCF import): stable slugs for upserts, rich lesson
 * metadata, the course spec, and card source keys so re-imports update cards
 * in place without losing their FSRS history. New tables (lesson_progress,
 * course_project_stages, course_exam_attempts, certificates) are created from
 * schema.ts automatically; only columns on EXISTING tables need steps here.
 */
import type { Migration } from './runner'

export const curriculumV2: Migration = {
  id: 2,
  name: 'curriculum-v2',
  up(ctx) {
    ctx.addColumn('tracks', 'slug', 'TEXT')

    ctx.addColumn('courses', 'slug', 'TEXT')
    ctx.addColumn('courses', 'subtitle', 'TEXT')
    ctx.addColumn('courses', 'emoji', 'TEXT')
    ctx.addColumn('courses', 'level', 'TEXT')
    ctx.addColumn('courses', 'language', 'TEXT')
    ctx.addColumn('courses', 'est_hours', 'REAL')
    ctx.addColumn('courses', 'spec', 'TEXT')
    ctx.addColumn('courses', 'deck_id', 'INTEGER')
    ctx.addColumn('courses', 'updated_at', 'TEXT')

    ctx.addColumn('units', 'slug', 'TEXT')
    ctx.addColumn('units', 'description', 'TEXT')

    ctx.addColumn('lessons', 'slug', 'TEXT')
    ctx.addColumn('lessons', 'est_minutes', 'INTEGER')

    ctx.addColumn('cards', 'source_key', 'TEXT')
    // Indexes on these columns are created from schema.ts after migrations run.
  },
}
