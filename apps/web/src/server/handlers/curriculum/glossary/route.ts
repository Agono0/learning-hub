/**
 * /api/curriculum/glossary?courseId=… — the course glossary (M5): every
 * lesson's keyTerms (LHCF) with a link back to the lesson and, when the term
 * appears on a card in the course deck, that card — glossary → retrieval.
 */
import { queryId } from '@/lib/query-params'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cards, courses, lessons, units } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export interface GlossaryEntry {
  term: string
  definition: string
  lessonId: number
  lessonTitle: string
  /** card id in the course deck whose text mentions this term, if any */
  cardId: number | null
}

/** GET — the glossary for one course, alphabetical. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const courseId = queryId(url.searchParams, 'courseId')
  if (courseId === null) {
    return Response.json({ ok: false, error: 'courseId required' }, { status: 400 })
  }
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1)
  if (!course) {
    return Response.json({ ok: false, error: 'course not found' }, { status: 404 })
  }

  const rows = await db
    .select({ id: lessons.id, title: lessons.title, content: lessons.content })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .where(eq(units.courseId, courseId))

  type KeyTerm = { term: string; definition: string }
  const entries: GlossaryEntry[] = []
  for (const row of rows) {
    const keyTerms = ((row.content ?? {}) as { keyTerms?: KeyTerm[] }).keyTerms ?? []
    for (const t of keyTerms) {
      entries.push({
        term: t.term,
        definition: t.definition,
        lessonId: row.id,
        lessonTitle: row.title,
        cardId: null,
      })
    }
  }
  entries.sort((a, b) => a.term.localeCompare(b.term))

  // link terms to course cards mentioning them (deck = the course's own deck)
  if (course.deckId != null && entries.length > 0) {
    const deckCards = await db
      .select({ id: cards.id, content: cards.content })
      .from(cards)
      .where(eq(cards.deckId, course.deckId))
      .limit(500)
    const cardTexts = deckCards.map((c) => ({
      id: c.id,
      text: JSON.stringify(c.content).toLowerCase(),
    }))
    for (const e of entries) {
      const needle = e.term.toLowerCase()
      const hit = cardTexts.find((c) => c.text.includes(needle))
      if (hit) e.cardId = hit.id
    }
  }

  return Response.json({ ok: true, entries })
})
