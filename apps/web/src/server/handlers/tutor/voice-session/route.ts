/**
 * /api/tutor/voice-session — Conversational Socratic Voice Tutor.
 *
 * Implements oral retrieval practice using the 4-rung Socratic escalation ladder
 * (Nudge -> Hint -> Partial Worked Example -> Full Solution).
 * Works offline/manual (Rule #9) and with configured AI providers.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, lessons } from '@learning-hub/db'
import { SOCRATIC_SYSTEM } from '@learning-hub/core/ai'
import { evaluateSocraticTurn, type SocraticCardContext } from '@learning-hub/core'
import { requireAI } from '@/lib/ai'
import { readJson, withRoute } from '@/lib/api'

const voiceTurnSchema = z.object({
  action: z.enum(['start', 'turn']).default('turn'),
  topic: z.string().trim().min(1).max(300),
  cardId: z.number().int().positive().optional(),
  lessonId: z.number().int().positive().optional(),
  userTranscript: z.string().trim().max(2000).default(''),
  currentRung: z.number().int().min(1).max(4).default(1),
  attemptCount: z.number().int().min(0).default(0),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string(),
      }),
    )
    .max(50)
    .default([]),
})

const HINT_REGEX = /\b(hint|clue|stuck|don'?t know|no idea|just tell|give up|answer|help)\b/i

async function resolveGroundedContext(
  body: z.infer<typeof voiceTurnSchema>,
): Promise<SocraticCardContext> {
  if (body.cardId) {
    const [card] = await db.select().from(cards).where(eq(cards.id, body.cardId)).limit(1)
    if (card) {
      const cardContent =
        typeof card.content === 'object' && card.content
          ? (card.content as Record<string, unknown>)
          : null
      const rawFront =
        cardContent?.front ??
        (cardContent?.basic as Record<string, unknown> | undefined)?.front ??
        body.topic
      const rawBack =
        cardContent?.back ??
        (cardContent?.basic as Record<string, unknown> | undefined)?.back ??
        (cardContent?.typein as { acceptedAnswers?: string[] } | undefined)?.acceptedAnswers?.[0] ??
        ''
      const front = String(rawFront)
      const back = String(rawBack)
      return {
        topic: body.topic,
        prompt: front,
        targetAnswer: back || body.topic,
        explanation: (cardContent?.explanation as string) || undefined,
      }
    }
  }

  if (body.lessonId) {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, body.lessonId)).limit(1)
    if (lesson) {
      return {
        topic: lesson.title,
        prompt: `Key concepts of ${lesson.title}`,
        targetAnswer: lesson.objective || lesson.title,
      }
    }
  }

  return {
    topic: body.topic,
    prompt: `What is the core mechanism of ${body.topic}?`,
    targetAnswer: body.topic,
  }
}

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    supportedRungs: [
      {
        rung: 1,
        name: 'Nudge',
        description: 'Reorients attention toward definitions or key facts.',
      },
      {
        rung: 2,
        name: 'Hint',
        description: 'Provides conceptual clues without revealing the answer.',
      },
      {
        rung: 3,
        name: 'Partial Worked Example',
        description: 'Works an analogous step, then hands it back.',
      },
      {
        rung: 4,
        name: 'Full Solution',
        description: 'Reveals the answer and asks a re-derivation question.',
      },
    ],
    mode: 'conversational_socratic',
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, voiceTurnSchema)
  const isHintRequest = HINT_REGEX.test(body.userTranscript)
  const context = await resolveGroundedContext(body)

  const offlineTurn = evaluateSocraticTurn({
    context,
    userTranscript: body.action === 'start' ? '' : body.userTranscript,
    currentRung: body.currentRung,
    attemptCount: body.attemptCount,
  })

  let spokenReply = ''
  let usedAI = false
  const nextRung = offlineTurn.nextRung
  const revealedAnswer = offlineTurn.revealedAnswer

  try {
    const client = await requireAI()
    const historyText = body.history
      .slice(-6)
      .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.text}`)
      .join('\n')

    const prompt =
      body.action === 'start'
        ? `Topic: "${context.topic}". Question/Prompt: "${context.prompt}". Target Answer: "${context.targetAnswer}".
Start the Socratic inquiry. Ask exactly ONE opening question to assess their intuitive understanding. Keep it under 40 words.`
        : `Topic: "${context.topic}". Target Answer: "${context.targetAnswer}".
Previous conversation:
${historyText || '(Beginning of dialogue)'}
Student just said: "${body.userTranscript}".
Current Socratic rung: ${nextRung} of 4 (1=Nudge, 2=Hint, 3=Partial Worked Example, 4=Full Solution).
Reply with the next spoken dialogue turn. Keep it under 50 words, friendly and oral, with exactly ONE question. ${
            nextRung === 4 && body.attemptCount >= 1
              ? 'Reveal the target answer and ask a follow-up re-derivation question.'
              : 'Do NOT reveal the target answer. Encourage active retrieval.'
          }`

    spokenReply = await client.generateText({
      system: `${SOCRATIC_SYSTEM}\nYou are speaking orally via text-to-speech. Keep replies natural, concise, and end with one question.`,
      prompt,
    })
    usedAI = true
  } catch {
    // Offline fallback complying with Rule #9 (manual mode with grounded Socratic ladder)
    spokenReply = offlineTurn.spokenReply
    usedAI = false
  }

  return Response.json({
    ok: true,
    spokenReply: spokenReply.trim(),
    nextRung,
    revealedAnswer,
    isHintRequest,
    usedAI,
    groundedCardId: body.cardId ?? null,
  })
})
