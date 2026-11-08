/**
 * POST /api/ai/feynman/grade — grade a teach-back session with FEYNMAN_GRADER,
 * save the score on the chat session, create gap-cards, award teachback XP.
 * Body: { sessionId, deckId? }
 * Provider 'none' → 400 + needsSetup + manualHint: the Feynman page shows the
 * self-assessment rubric (same shape) instead of dead-ending.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { awardXp, cards, chatSessions, db, decks } from '@learning-hub/db'
import { FEYNMAN_GRADER, feynmanGradeSchema } from '@learning-hub/core'
import { requireAI, AIUnavailableError } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const feynmanPostSchema = z.object({
  sessionId: z.number().int().positive('sessionId required'),
  deckId: z.number().int().positive().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, feynmanPostSchema)

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, body.sessionId))
    .limit(1)
  if (!session) return Response.json({ error: 'session not found' }, { status: 404 })

  const transcript = ((session.messages as { role: string; content: string }[]) ?? [])
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Student-questioner'}: ${m.content}`)
    .join('\n')

  let ai
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
            'No provider needed: use the self-assessment rubric on the Feynman page (coverage / misconceptions / gaps) and save the gap-cards yourself.',
        },
        { status: 400 },
      )
    }
    return aiErrorResponse(e)
  }

  try {
    const score = await ai.generateJSON({
      schema: feynmanGradeSchema,
      system: FEYNMAN_GRADER,
      prompt: `Concept the learner was teaching: ${session.title ?? session.contextType ?? 'unknown'}\n\nTeach-back transcript:\n${transcript.slice(0, 16000)}`,
    })

    await db
      .update(chatSessions)
      .set({ score: score as unknown as Record<string, unknown> })
      .where(eq(chatSessions.id, session.id))

    // gap-cards from the grader's suggestions
    let deckId = body.deckId ?? null
    if (!deckId) {
      const [deck] = await db.select().from(decks).where(eq(decks.name, 'Teach-backs')).limit(1)
      if (deck) deckId = deck.id
      else {
        const [created] = await db
          .insert(decks)
          .values({ name: 'Teach-backs', description: 'Cards born from Feynman grading' })
          .returning()
        deckId = created!.id
      }
    }
    const createdCards: number[] = []
    for (const c of score.suggestedCards.slice(0, 5)) {
      const [card] = await db
        .insert(cards)
        .values({
          deckId,
          type: 'basic',
          content: { basic: { front: c.front, back: c.back } },
          tags: ['teachback', 'gap'],
          source: 'ai',
          due: new Date().toISOString(),
        })
        .returning()
      createdCards.push(card!.id)
    }

    // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
    awardXp(db, { source: 'teachback', meta: { sessionId: session.id, coverage: score.coverage } })

    return Response.json({ ok: true, score, createdCards, deckId })
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }
})
