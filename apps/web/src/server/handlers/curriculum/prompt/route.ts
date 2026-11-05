/**
 * /api/curriculum/prompt — the copy-paste prompts that make any AI write a
 * course in LHCF.
 *
 * GET  ?topic=…&currentLevel=…&goal=…&hoursPerWeek=…&weeks=…&language=…&style=…&projects=0|1&format=json|yaml|markdown
 *      → { prompt } for a NEW course.
 * POST { courseId, request } → { prompt } to IMPROVE an existing course
 *      (embeds its export; the AI is told to keep every slug stable).
 */
import { z } from 'zod'
import { buildCurriculumPrompt, buildImproveCurriculumPrompt } from '@learning-hub/core/curriculum'
import { exportCurriculum } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const requestSchema = z.object({
  topic: z.string().trim().min(2, 'Tell us what you want to learn.').max(300),
  currentLevel: z.string().trim().max(300).optional(),
  goal: z.string().trim().max(500).optional(),
  hoursPerWeek: z.coerce.number().min(0.5).max(80).optional(),
  weeks: z.coerce.number().int().min(1).max(104).optional(),
  language: z.string().trim().max(60).optional(),
  style: z.string().trim().max(300).optional(),
  projects: z.enum(['0', '1']).optional(),
  format: z.enum(['json', 'yaml', 'markdown']).optional(),
})

export const GET = withRoute(async (req: Request) => {
  const query = Object.fromEntries(
    [...new URL(req.url).searchParams.entries()].filter(([, v]) => v.trim() !== ''),
  )
  const parsed = requestSchema.safeParse(query)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', detail: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }
  const { projects, ...rest } = parsed.data
  return Response.json({ prompt: buildCurriculumPrompt({ ...rest, projects: projects !== '0' }) })
})

const improveSchema = z.object({
  courseId: z.number().int().positive(),
  request: z.string().trim().min(3, 'Describe what to change.').max(2000),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, improveSchema)
  const course = exportCurriculum(body.courseId)
  if (!course) return Response.json({ error: 'course not found' }, { status: 404 })
  return Response.json({
    prompt: buildImproveCurriculumPrompt(JSON.stringify(course, null, 2), body.request),
  })
})
