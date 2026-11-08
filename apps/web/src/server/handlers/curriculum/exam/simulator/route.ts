/**
 * /api/curriculum/exam/simulator — Timed Mock Exam Simulator.
 *
 * Implements delayed-feedback testing (Butler & Roediger 2008),
 * Bloom taxonomy breakdown, and post-exam card generation from missed questions.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { cards, db, decks, withTransaction } from '@learning-hub/db'
import { cardPreviewText, parseCloze } from '@learning-hub/core'
import { matchText } from '@learning-hub/core/practice'
import { readJson, readQuery, withRoute } from '@/lib/api'

const examSimQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  count: z.coerce.number().int().min(1).max(50).default(10),
  durationMinutes: z.coerce.number().int().min(1).max(180).default(15),
})

function inferBloomLevel(type: string, prompt: string): 'remember' | 'understand' | 'apply' {
  const lower = prompt.toLowerCase()
  if (/\b(apply|calculate|derive|compute|solve|implement|design)\b/.test(lower)) return 'apply'
  if (/\b(explain|why|how|distinguish|compare|interpret)\b/.test(lower)) return 'understand'
  if (type === 'exercise') return 'apply'
  if (type === 'mcq') return 'understand'
  return 'remember'
}

function extractPublicQuestion(c: { id: number; type: string; content: unknown }) {
  const content = (c.content ?? {}) as Record<string, unknown>
  const preview = cardPreviewText(c.type, c.content) ?? `Card #${c.id}`
  const unwrapped = (content[c.type] ?? content) as Record<string, unknown>
  let prompt = preview
  let options: string[] | undefined

  if (c.type === 'basic') {
    const front = (unwrapped.front as string) || (content.front as string)
    if (front) prompt = front
  } else if (c.type === 'cloze') {
    const text = (unwrapped.text as string) || (content.text as string)
    if (text) {
      // Mask cloze for mock exam: replace {{c1::word}} with [_____]
      prompt = text.replace(/\{\{c\d+::(.*?)\}\}/g, ' [_____] ')
    }
  } else if (c.type === 'mcq') {
    const q = (unwrapped.question as string) || (content.question as string)
    const opts = (unwrapped.options as string[]) || (content.options as string[])
    if (q) prompt = q
    if (opts) options = opts
  } else if (c.type === 'typein') {
    const q = (unwrapped.question as string) || (content.question as string)
    if (q) prompt = q
  } else if (c.type === 'exercise') {
    const p = (unwrapped.prompt as string) || (content.prompt as string)
    if (p) prompt = p
  }

  const bloomLevel = inferBloomLevel(c.type, prompt)

  return {
    cardId: c.id,
    type: c.type,
    prompt,
    options,
    bloomLevel,
  }
}

function extractAnswerDetails(c: { id: number; type: string; content: unknown }): {
  displayAnswer: string
  accepted: string[]
} {
  const content = (c.content ?? {}) as Record<string, unknown>
  const unwrapped = (content[c.type] ?? content) as Record<string, unknown>

  if (c.type === 'basic') {
    const back = (unwrapped.back as string) || (content.back as string) || ''
    return { displayAnswer: back, accepted: back ? [back] : [] }
  }
  if (c.type === 'cloze') {
    const text = (unwrapped.text as string) || (content.text as string) || ''
    let answers = (unwrapped.answers as string[]) || (content.answers as string[]) || []
    if (answers.length === 0 && text) {
      const parsed = parseCloze(text)
      answers = parsed.answers
    }
    const displayAnswer = answers.join(', ')
    return { displayAnswer, accepted: answers.length > 0 ? answers : [displayAnswer] }
  }
  if (c.type === 'mcq') {
    const opts = (unwrapped.options as string[]) || (content.options as string[]) || []
    const idx = (unwrapped.correctIndex as number) ?? (content.correctIndex as number)
    const correctOpt = opts[idx] ?? (unwrapped.answer as string) ?? ''
    const displayAnswer = String(correctOpt)
    return { displayAnswer, accepted: displayAnswer ? [displayAnswer] : [] }
  }
  if (c.type === 'typein') {
    const accepted =
      (unwrapped.acceptedAnswers as string[]) || (content.acceptedAnswers as string[]) || []
    const singleAns = (unwrapped.answer as string) || (content.answer as string) || ''
    const allAccepted = accepted.length > 0 ? accepted : singleAns ? [singleAns] : []
    return { displayAnswer: allAccepted[0] ?? '', accepted: allAccepted }
  }
  if (c.type === 'exercise') {
    const sol = (unwrapped.solution as string) || (content.solution as string) || ''
    return { displayAnswer: sol, accepted: sol ? [sol] : [] }
  }

  const preview = cardPreviewText(c.type, c.content) ?? ''
  return { displayAnswer: preview, accepted: preview ? [preview] : [] }
}

export const GET = withRoute(async (req: Request) => {
  const query = readQuery(req, examSimQuerySchema)

  const deckRows = await db.select({ id: decks.id, name: decks.name }).from(decks)

  // Fetch candidate cards
  const conditions = [eq(cards.suspended, false)]
  if (query.deckId) {
    conditions.push(eq(cards.deckId, query.deckId))
  }

  const candidateCards = await db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      type: cards.type,
      content: cards.content,
    })
    .from(cards)
    .where(and(...conditions))
    .limit(100)

  // Shuffle and take query.count
  const shuffled = [...candidateCards].sort(() => Math.random() - 0.5).slice(0, query.count)

  const questions = shuffled.map(extractPublicQuestion)

  return Response.json({
    ok: true,
    examId: `exam-${Date.now()}`,
    durationMinutes: query.durationMinutes,
    totalQuestions: questions.length,
    questions,
    availableDecks: deckRows,
  })
})

const gradePostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('grade'),
    examId: z.string().optional(),
    submissions: z.array(
      z.object({
        cardId: z.number().int().positive(),
        answer: z.string().default(''),
      }),
    ),
  }),
  z.object({
    action: z.literal('create_cards_from_misses'),
    deckId: z.number().int().positive().optional(),
    misses: z
      .array(
        z.object({
          front: z.string().min(1),
          back: z.string().min(1),
        }),
      )
      .min(1),
  }),
])

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, gradePostSchema)

  if (body.action === 'create_cards_from_misses') {
    let targetDeckId = body.deckId
    if (!targetDeckId) {
      const [first] = await db.select({ id: decks.id }).from(decks).limit(1)
      if (!first) {
        const [created] = await db
          .insert(decks)
          .values({ name: 'Exam Remediation' })
          .returning({ id: decks.id })
        targetDeckId = created.id
      } else {
        targetDeckId = first.id
      }
    }

    const now = new Date().toISOString()
    // Multi-row transactional insert complying with Rule #6
    withTransaction((tx) => {
      for (const miss of body.misses) {
        tx.insert(cards)
          .values({
            deckId: targetDeckId!,
            type: 'basic',
            content: { basic: { front: miss.front, back: miss.back } },
            due: now,
          })
          .run()
      }
    })
    return Response.json({ ok: true, createdCount: body.misses.length })
  }

  // Action: grade
  const cardIds = body.submissions.map((s) => s.cardId)
  if (cardIds.length === 0) {
    return Response.json({
      ok: true,
      score: 0,
      totalQuestions: 0,
      correctCount: 0,
      bloomBreakdown: {},
      results: [],
      missedCards: [],
      feedbackSummary: 'No questions submitted.',
    })
  }

  const cardRows = await db
    .select({
      id: cards.id,
      type: cards.type,
      content: cards.content,
    })
    .from(cards)
    .where(inArray(cards.id, cardIds))

  const cardMap = new Map(cardRows.map((c) => [c.id, c]))

  const bloomBreakdown: Record<string, { total: number; correct: number }> = {
    remember: { total: 0, correct: 0 },
    understand: { total: 0, correct: 0 },
    apply: { total: 0, correct: 0 },
  }

  let correctCount = 0
  const results: Array<{
    cardId: number
    prompt: string
    userAnswer: string
    correctAnswer: string
    correct: boolean
    bloomLevel: 'remember' | 'understand' | 'apply'
  }> = []

  const missedCards: Array<{ front: string; back: string }> = []

  for (const sub of body.submissions) {
    const card = cardMap.get(sub.cardId)
    if (!card) continue

    const pub = extractPublicQuestion(card)
    const ans = extractAnswerDetails(card)
    const userTrim = sub.answer.trim()
    const expTrim = ans.displayAnswer.trim()

    let isCorrect = false
    if (userTrim && ans.accepted.length > 0) {
      if (card.type === 'mcq') {
        // Strict normalized matching for MCQ: user must select the exact correct option text
        isCorrect = matchText(userTrim, ans.accepted, false) === 'exact'
      } else {
        // Text / cloze / typein: lenient matching with case/accents/typo budget
        const match = matchText(userTrim, ans.accepted, true)
        if (match !== 'none') {
          isCorrect = true
        } else if (expTrim.length >= 40) {
          // For longer free-text answers, verify 70%+ of substantive keywords (>4 chars) are present
          const expectedKeywords = expTrim
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => w.length > 4)
          if (expectedKeywords.length > 0) {
            const userNorm = userTrim.toLowerCase()
            const matches = expectedKeywords.filter((k) => userNorm.includes(k)).length
            if (matches / expectedKeywords.length >= 0.7) {
              isCorrect = true
            }
          }
        }
      }
    }

    const bLevel = pub.bloomLevel
    bloomBreakdown[bLevel].total += 1
    if (isCorrect) {
      correctCount += 1
      bloomBreakdown[bLevel].correct += 1
    } else {
      missedCards.push({
        front: `[Exam Miss] ${pub.prompt}`,
        back: ans.displayAnswer || 'See textbook reference',
      })
    }

    results.push({
      cardId: sub.cardId,
      prompt: pub.prompt,
      userAnswer: sub.answer,
      correctAnswer: ans.displayAnswer,
      correct: isCorrect,
      bloomLevel: bLevel,
    })
  }

  const total = results.length
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0

  return Response.json({
    ok: true,
    score,
    correctCount,
    totalQuestions: total,
    bloomBreakdown,
    results,
    missedCards,
    feedbackSummary:
      'Delayed feedback complete (Butler & Roediger 2008). Reviewing answers after the entire test strengthens retention far more than instant answer peeking.',
  })
})
