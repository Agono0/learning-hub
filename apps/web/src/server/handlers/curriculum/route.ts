/**
 * /api/curriculum — GET the full tree (tracks → courses → units → lessons);
 * POST generate an AI course ({ topic|pdfId, depth }) OR create one manually
 * ({ manual: GeneratedCourse } — the non-AI path, same persistence); PATCH
 * mark a lesson complete (awards lesson XP).
 */
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { awardXp, db, courses, getSource, lessons, tracks, units } from '@learning-hub/db'
import {
  generateCoursePrompt,
  generatedCourseSchema,
  parseGeneratedCourse,
} from '@learning-hub/core'
import { requireAI, AIUnavailableError, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'
import { insertGeneratedCourse } from '@/lib/curriculum-server'

const generateSchema = z.object({
  topic: z.string().trim().max(500).optional(),
  pdfId: z.number().int().positive().optional(),
  depth: z.string().max(100).optional(),
  /** Manual (non-AI) course structure — validated with the same schema the AI output must satisfy. */
  manual: z.unknown().optional(),
})

const patchLessonSchema = z.object({
  lessonId: z.number().int().positive('lessonId required'),
  complete: z.boolean().optional(),
})

export async function GET() {
  const trackRows = await db.select().from(tracks).orderBy(desc(tracks.createdAt))
  const courseRows = await db.select().from(courses)
  const unitRows = await db.select().from(units).orderBy(units.order)
  const lessonRows = await db.select().from(lessons).orderBy(lessons.order)
  const tree = trackRows.map((t) => ({
    ...t,
    courses: courseRows
      .filter((c) => c.trackId === t.id)
      .map((c) => ({
        ...c,
        units: unitRows
          .filter((u) => u.courseId === c.id)
          .map((u) => ({ ...u, lessons: lessonRows.filter((l) => l.unitId === u.id) })),
      })),
  }))
  return Response.json({ tracks: tree })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, generateSchema)

  // Manual path: { manual: GeneratedCourse } — no AI involved, same validation
  // and persistence as generated output (Bloom-verb rule included).
  if (body.manual !== undefined) {
    const parsed = parseGeneratedCourse(body.manual)
    const ids = await insertGeneratedCourse(parsed)
    return Response.json({ ok: true, mode: 'manual', ...ids, course: parsed })
  }

  let ai: AIClient
  try {
    ai = await requireAI()
  } catch (e) {
    if (e instanceof AIUnavailableError) {
      return Response.json(
        {
          ok: false,
          error: e.message,
          needsSetup: true,
          manualHint:
            'No provider needed: build the course with the manual curriculum builder (same form the generator fills), or use the prompt-transport flow with feature=course-generator.',
        },
        { status: 400 },
      )
    }
    return aiErrorResponse(e)
  }
  let pdfText: string | undefined
  if (body.pdfId) {
    const src = getSource(body.pdfId)
    if (!src) return Response.json({ error: 'source not found' }, { status: 404 })
    pdfText = src.content
  }
  if (!body.topic && !pdfText)
    return Response.json({ error: 'topic or pdfId required' }, { status: 400 })

  const prompt = generateCoursePrompt({ topic: body.topic, pdfText, depth: body.depth })
  let raw: unknown
  try {
    raw = await ai.generateJSON({
      schema: generatedCourseSchema,
      system: prompt.system,
      prompt: prompt.prompt,
    })
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }
  const parsed = parseGeneratedCourse(raw)
  const ids = await insertGeneratedCourse(parsed)
  return Response.json({ ok: true, ...ids, course: parsed })
})

export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, patchLessonSchema)
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, body.lessonId)).limit(1)
  if (!lesson) return Response.json({ error: 'lesson not found' }, { status: 404 })
  if (body.complete === false) {
    await db.update(lessons).set({ completedAt: null }).where(eq(lessons.id, lesson.id))
    return Response.json({ ok: true, completed: false })
  }
  if (!lesson.completedAt) {
    await db
      .update(lessons)
      .set({ completedAt: new Date().toISOString() })
      .where(eq(lessons.id, lesson.id))
    // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
    awardXp(db, { source: 'lesson', meta: { lessonId: lesson.id, title: lesson.title } })
  }
  return Response.json({ ok: true, completed: true })
})
