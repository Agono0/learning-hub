/**
 * Socratic Escalation Ladder (Learning Sciences - Chi 2009; VanLehn 2011).
 *
 * Implements a 4-rung pedagogical scaffolding sequence for oral and conversational
 * retrieval practice:
 * Rung 1: Nudge (re-orient attention without leaking cues)
 * Rung 2: Structural/Phonemic Hint (first letter, syllable, word shape)
 * Rung 3: Partial Worked Example / Cloze (masked completion)
 * Rung 4: Full Solution with Re-derivation (ONLY unlocked after >= 1 attempt)
 */

export interface SocraticCardContext {
  topic: string
  prompt: string
  targetAnswer: string
  explanation?: string
}

export interface SocraticTurnInput {
  context: SocraticCardContext
  userTranscript: string
  currentRung: number // 1..4
  attemptCount: number
  history?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export interface SocraticTurnOutput {
  spokenReply: string
  nextRung: number
  revealedAnswer: boolean
}

const HINT_REGEX = /\b(hint|clue|stuck|don'?t know|no idea|just tell|give up|answer|help)\b/i

/**
 * Creates a masked cloze string for the target answer.
 * e.g., "Photosynthesis" -> "Photo______"
 * "Cellular Respiration" -> "Cellular Resp______"
 */
export function buildAnswerCloze(target: string): string {
  const clean = target.trim()
  if (!clean) return '______'

  const words = clean.split(/\s+/)
  if (words.length > 1) {
    const firstWord = words[0]!
    const rest = words.slice(1).join(' ')
    const prefix = rest.length > 3 ? rest.slice(0, 3) : rest.slice(0, 1)
    return `${firstWord} ${prefix}${'―'.repeat(Math.max(3, rest.length - prefix.length))}`
  }

  const prefixLen = Math.max(1, Math.min(4, Math.floor(clean.length / 3)))
  const prefix = clean.slice(0, prefixLen)
  return `${prefix}${'―'.repeat(Math.max(3, clean.length - prefixLen))}`
}

/**
 * Evaluates the next Socratic turn deterministically using card/lesson context.
 * Guarantees zero cognitive offloading by refusing to reveal Rung 4 on zero attempts.
 */
export function evaluateSocraticTurn(input: SocraticTurnInput): SocraticTurnOutput {
  const { context, userTranscript, currentRung, attemptCount } = input
  const isHintRequest = HINT_REGEX.test(userTranscript)
  const isInitial = !userTranscript.trim()

  const nextRung = isHintRequest ? Math.min(4, currentRung + 1) : currentRung

  if (isInitial) {
    return {
      spokenReply: `Let's explore "${context.topic}". Focus on this question: "${context.prompt}". In your own words, what comes to mind first?`,
      nextRung: 1,
      revealedAnswer: false,
    }
  }

  // Generation Guard: Prevent skipping straight to the answer without a genuine retrieval attempt
  if (nextRung === 4 && attemptCount === 0) {
    return {
      spokenReply: `Before I reveal the verified answer, make an active prediction. Even an educated guess strengthens recall. What is your intuition for "${context.prompt}"?`,
      nextRung: 2,
      revealedAnswer: false,
    }
  }

  const target = context.targetAnswer.trim()
  const firstLetter = target.charAt(0).toUpperCase()
  const cloze = buildAnswerCloze(target)

  switch (nextRung) {
    case 1:
      return {
        spokenReply: `Consider the fundamental mechanism: for "${context.prompt}", what core rule or definition applies here?`,
        nextRung: 1,
        revealedAnswer: false,
      }
    case 2:
      return {
        spokenReply: `Here is a structural hint: the target answer starts with "${firstLetter}" and has about ${target.length} characters. Can you name it?`,
        nextRung: 2,
        revealedAnswer: false,
      }
    case 3:
      return {
        spokenReply: `Let's fill in the partial framework: "${cloze}". What completes this term?`,
        nextRung: 3,
        revealedAnswer: false,
      }
    case 4:
    default:
      return {
        spokenReply: `Here is the verified target: "${target}". To anchor it permanently: what core concept makes "${target}" the right solution for "${context.prompt}"?`,
        nextRung: 4,
        revealedAnswer: true,
      }
  }
}
