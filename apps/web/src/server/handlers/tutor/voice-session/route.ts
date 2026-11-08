/**
 * /api/tutor/voice-session — Conversational Socratic Voice Tutor.
 *
 * Implements oral retrieval practice using the 4-rung Socratic escalation ladder
 * (Nudge -> Hint -> Partial Worked Example -> Full Solution).
 * Works offline/manual (Rule #9) and with configured AI providers.
 */
import { z } from 'zod'
import { SOCRATIC_SYSTEM } from '@learning-hub/core/ai'
import { requireAI } from '@/lib/ai'
import { readJson, withRoute } from '@/lib/api'

const voiceTurnSchema = z.object({
  action: z.enum(['start', 'turn']).default('turn'),
  topic: z.string().trim().min(1).max(300),
  userTranscript: z.string().trim().max(2000).default(''),
  currentRung: z.number().int().min(1).max(4).default(1),
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

function getOfflineSocraticResponse(topic: string, transcript: string, rung: number): string {
  if (!transcript) {
    return `Let's explore ${topic}. In your own words, what is the core intuition or definition that comes to mind first?`
  }

  switch (rung) {
    case 1:
      return `Interesting perspective. To narrow it down: what fundamental principle or prerequisite triggers this in ${topic}?`
    case 2:
      return `Here is a conceptual hint: think about what changes between the start and end of ${topic}. What drives that transition?`
    case 3:
      return `Let's build a partial example: if component A initiates the reaction, what intermediate step must happen before the final result?`
    case 4:
    default:
      return `Here is the essential mechanism: ${topic} operates by transforming initial inputs through structured stages. Now, why could this process not work in reverse?`
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

  let nextRung = body.currentRung
  if (isHintRequest) {
    nextRung = Math.min(4, body.currentRung + 1)
  }

  let spokenReply = ''
  let usedAI = false

  try {
    const client = await requireAI()
    const prompt =
      body.action === 'start'
        ? `Start a Socratic inquiry with the student on the topic: "${body.topic}". Follow the Socratic ladder. Ask exactly ONE opening question to assess their intuitive understanding. Keep it under 40 words.`
        : `Topic: "${body.topic}".
The student said: "${body.userTranscript}".
Current Socratic rung: ${nextRung} of 4 (1=Nudge, 2=Hint, 3=Partial Worked Example, 4=Full Solution).
Reply with the next spoken dialogue turn. Keep it under 50 words, friendly and oral, with exactly ONE question.`

    spokenReply = await client.generateText({
      system: `${SOCRATIC_SYSTEM}\nYou are speaking orally via text-to-speech. Keep replies natural, concise, and end with one question.`,
      prompt,
    })
    usedAI = true
  } catch {
    // Offline fallback complying with Rule #9 (manual mode with zero external dependencies)
    spokenReply = getOfflineSocraticResponse(
      body.topic,
      body.action === 'start' ? '' : body.userTranscript,
      nextRung,
    )
    usedAI = false
  }

  return Response.json({
    ok: true,
    spokenReply: spokenReply.trim(),
    nextRung,
    isHintRequest,
    usedAI,
  })
})
