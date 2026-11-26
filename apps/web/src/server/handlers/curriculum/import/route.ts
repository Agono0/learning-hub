/**
 * POST /api/curriculum/import — import a course from text (pasted AI reply or
 * file contents) in JSON, YAML or Markdown (LHCF).
 *
 * Body: { text, filename?, format?, dryRun? }
 * - dryRun: true  → validate only; returns a preview (stats, outline, whether
 *                   it updates an existing course) — the wizard's review step.
 * - otherwise     → validate + import (idempotent upsert by slug).
 *
 * Validation problems are a normal 200 response with `ok: false` and
 * path-addressed `errors` (they are the learner's to fix, not a server error).
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { LHCF_MAX_SOURCE_CHARS, lhcfStats, parseCurriculum } from '@learning-hub/core/curriculum'
import { courses, importCurriculum } from '@learning-hub/db'
import { db } from '@/lib/db'
import { readJson, withRoute } from '@/lib/api'

/** At most 4 UTF-8 bytes per source character, plus the other fields. */
const MAX_IMPORT_BODY_BYTES = LHCF_MAX_SOURCE_CHARS * 4 + 4096

const importSchema = z.object({
  text: z
    .string()
    .max(LHCF_MAX_SOURCE_CHARS, 'The curriculum is too large — split it into several courses.'),
  filename: z.string().max(260).optional(),
  format: z.enum(['json', 'yaml', 'markdown']).optional(),
  dryRun: z.boolean().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, importSchema, { maxBytes: MAX_IMPORT_BODY_BYTES })
  const parsed = parseCurriculum(body.text, { format: body.format, filename: body.filename })
  if (!parsed.ok) {
    return Response.json({
      ok: false,
      format: parsed.format,
      errors: parsed.errors,
      warnings: parsed.warnings,
      fixes: parsed.fixes,
    })
  }

  const { course } = parsed
  const existing = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.slug, course.slug))
    .get()
  const preview = {
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle ?? null,
    emoji: course.emoji ?? null,
    level: course.level ?? null,
    track: course.track ?? null,
    stats: lhcfStats(course),
    outline: course.modules.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => l.title),
    })),
    updatesExisting: Boolean(existing),
  }
  const common = {
    ok: true as const,
    format: parsed.format,
    warnings: parsed.warnings,
    fixes: parsed.fixes,
    preview,
  }

  if (body.dryRun) return Response.json(common)
  const report = importCurriculum(course)
  return Response.json({ ...common, report })
})
