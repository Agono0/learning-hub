/**
 * /api/curriculum/skills/weakness-v2 — Weakness Radar v2:
 * 1. Semantic interference / confusion pair correlation (Underwood 1957).
 * 2. Forward topic retrievability decay forecasting (FSRS power model).
 * 3. 1-click leech atomic decomposition (Wozniak Rule 1).
 */
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { cards, db, decks, revlog, withTransaction } from '@learning-hub/db'
import {
  cardPreviewText,
  calculateTopicRetentionForecast,
  decomposeLeechCard,
  detectConfusionPairs,
  type LeechDecomposition,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

function extractCardQandA(c: { id: number; type: string; content: unknown }): {
  front: string
  back: string
} {
  const content = (c.content ?? {}) as Record<string, unknown>
  const preview = cardPreviewText(c.type, c.content) ?? `Card #${c.id}`
  const unwrapped = (content[c.type] ?? content) as Record<string, unknown>

  if (c.type === 'basic') {
    const front = (unwrapped.front as string) || (content.front as string) || preview
    const back = (unwrapped.back as string) || (content.back as string) || ''
    return { front, back }
  }
  if (c.type === 'cloze') {
    const text = (unwrapped.text as string) || (content.text as string) || preview
    const answers = (unwrapped.answers as string[]) || (content.answers as string[]) || []
    return { front: text, back: answers.join(', ') }
  }
  if (c.type === 'mcq') {
    const question = (unwrapped.question as string) || (content.question as string) || preview
    const options = (unwrapped.options as string[]) || (content.options as string[]) || []
    const correctIndex = (unwrapped.correctIndex as number) ?? (content.correctIndex as number)
    const correctAns = options[correctIndex] ?? (unwrapped.answer as string) ?? ''
    return { front: question, back: String(correctAns) }
  }
  if (c.type === 'typein') {
    const question = (unwrapped.question as string) || (content.question as string) || preview
    const accepted =
      (unwrapped.acceptedAnswers as string[]) || (content.acceptedAnswers as string[]) || []
    const answer = accepted[0] ?? (unwrapped.answer as string) ?? ''
    return { front: question, back: String(answer) }
  }
  if (c.type === 'exercise') {
    const prompt = (unwrapped.prompt as string) || preview
    return { front: prompt, back: preview }
  }

  return { front: preview, back: '' }
}

export const GET = withRoute(async () => {
  const deckRows = await db.select({ id: decks.id, name: decks.name }).from(decks)
  const cardRows = await db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      stability: cards.stability,
      due: cards.due,
      lapses: cards.lapses,
      type: cards.type,
      content: cards.content,
      lastReview: cards.lastReview,
    })
    .from(cards)
    .where(eq(cards.suspended, false))

  const revlogRows = await db
    .select({
      cardId: revlog.cardId,
      grade: revlog.rating,
      createdAt: revlog.reviewedAt,
    })
    .from(revlog)
    .orderBy(desc(revlog.id))
    .limit(1500)

  // Map card previews
  const previews = new Map<number, string>()
  for (const c of cardRows) {
    const p = cardPreviewText(c.type, c.content) ?? `Card #${c.id}`
    previews.set(c.id, p)
  }

  // 1. Confusion pairs (temporal proximity failure correlation)
  const confusionPairs = detectConfusionPairs(revlogRows, previews, 2, 5 * 60 * 1000)

  // 2. Topic retention forecasts
  const topicForecasts = calculateTopicRetentionForecast(
    deckRows,
    cardRows.map((c) => ({
      deckId: c.deckId,
      stability: c.stability,
      due: c.due,
      lastReview: c.lastReview,
    })),
  )

  // 3. Leech atomic decompositions (lapses >= 5)
  const leechCandidates = cardRows
    .filter((c) => c.lapses >= 5)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 10)

  const leechDecompositions: LeechDecomposition[] = leechCandidates.map((c) => {
    const { front, back } = extractCardQandA(c)
    return decomposeLeechCard({
      id: c.id,
      lapses: c.lapses,
      front,
      back,
    })
  })

  return Response.json({
    ok: true,
    confusionPairs,
    topicForecasts,
    leechDecompositions,
    totalCards: cardRows.length,
    leechCount: cardRows.filter((c) => c.lapses >= 5).length,
  })
})

const postSchema = z.object({
  action: z.literal('apply_decomposition'),
  deckId: z.number().int().positive().optional(),
  originalCardId: z.number().int().positive().optional(),
  candidates: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
        format: z.enum(['basic', 'cloze']).default('basic'),
      }),
    )
    .min(1),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postSchema)
  let targetDeckId = body.deckId

  // If targetDeckId is not explicitly provided, look up the original card's deck
  if (!targetDeckId && body.originalCardId) {
    const orig = await db
      .select({ deckId: cards.deckId })
      .from(cards)
      .where(eq(cards.id, body.originalCardId))
      .limit(1)
    if (orig.length > 0 && orig[0].deckId) {
      targetDeckId = orig[0].deckId
    }
  }

  if (!targetDeckId) {
    const [firstDeck] = await db.select({ id: decks.id }).from(decks).limit(1)
    if (!firstDeck) {
      const [newDeck] = await db
        .insert(decks)
        .values({ name: 'Decomposed Cards' })
        .returning({ id: decks.id })
      targetDeckId = newDeck.id
    } else {
      targetDeckId = firstDeck.id
    }
  }

  const now = new Date().toISOString()

  // Multi-row transactional write complying with Rule #6
  withTransaction((tx) => {
    for (const cand of body.candidates) {
      if (cand.format === 'cloze') {
        tx.insert(cards)
          .values({
            deckId: targetDeckId!,
            type: 'cloze',
            content: { cloze: { text: cand.front, answers: [cand.back], mode: 'basic' } },
            due: now,
          })
          .run()
      } else {
        tx.insert(cards)
          .values({
            deckId: targetDeckId!,
            type: 'basic',
            content: { basic: { front: cand.front, back: cand.back } },
            due: now,
          })
          .run()
      }
    }

    // Suspend the original leech card so it stops accumulating lapses and drops off the radar
    if (body.originalCardId) {
      tx.update(cards).set({ suspended: true }).where(eq(cards.id, body.originalCardId)).run()
    }
  })

  return Response.json({
    ok: true,
    createdCount: body.candidates.length,
    originalSuspended: !!body.originalCardId,
  })
})
