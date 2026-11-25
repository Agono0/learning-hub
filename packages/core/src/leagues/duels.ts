/**
 * Head-to-head study duels: two players answer the same set of prompts;
 * accuracy first, speed breaks ties. Duels feed league points (see engine)
 * and use the shared Elo exchange for duel ratings.
 */
import { z } from 'zod'

export const DuelPromptSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  /** Accepted answers, case-insensitive. */
  answers: z.array(z.string().min(1)).min(1),
})
export type DuelPrompt = z.infer<typeof DuelPromptSchema>

export const DuelAnswerSchema = z.object({
  promptId: z.string().min(1),
  answer: z.string(),
  /** Milliseconds from prompt reveal to answer. */
  elapsedMs: z.number().nonnegative(),
})
export type DuelAnswer = z.infer<typeof DuelAnswerSchema>

export const DuelSchema = z.object({
  id: z.string().min(1),
  playerA: z.string().min(1),
  playerB: z.string().min(1),
  prompts: z.array(DuelPromptSchema).min(1).max(50),
  answersA: z.array(DuelAnswerSchema).default([]),
  answersB: z.array(DuelAnswerSchema).default([]),
  createdAt: z.string().min(1),
})
export type Duel = z.infer<typeof DuelSchema>

export interface DuelScore {
  correct: number
  total: number
  accuracy: number
  /** Total time over CORRECT answers only (speed tiebreak). */
  correctTimeMs: number
}

export function scoreDuelSide(duel: Duel, side: 'A' | 'B'): DuelScore {
  const prompts = new Map(duel.prompts.map((p) => [p.id, p]))
  const answers = side === 'A' ? duel.answersA : duel.answersB
  let correct = 0
  let correctTimeMs = 0
  for (const a of answers) {
    const prompt = prompts.get(a.promptId)
    if (!prompt) continue
    const normalized = a.answer.trim().toLowerCase()
    if (prompt.answers.some((x) => x.trim().toLowerCase() === normalized)) {
      correct++
      correctTimeMs += a.elapsedMs
    }
  }
  return {
    correct,
    total: duel.prompts.length,
    accuracy: duel.prompts.length > 0 ? correct / duel.prompts.length : 0,
    correctTimeMs,
  }
}

export interface DuelResult {
  winner: string | null // null = draw
  loser: string | null
  draw: boolean
  scoreA: DuelScore
  scoreB: DuelScore
}

/** Both sides answered every prompt -> the duel is decidable. */
export function isDuelComplete(duel: Duel): boolean {
  return duel.answersA.length >= duel.prompts.length && duel.answersB.length >= duel.prompts.length
}

/**
 * Decide a duel: accuracy first, then total time on correct answers (faster
 * wins), then an honest draw.
 */
export function decideDuel(duel: Duel): DuelResult {
  const scoreA = scoreDuelSide(duel, 'A')
  const scoreB = scoreDuelSide(duel, 'B')
  let winner: string | null = null
  let loser: string | null = null
  if (scoreA.correct !== scoreB.correct) {
    winner = scoreA.correct > scoreB.correct ? duel.playerA : duel.playerB
  } else if (scoreA.correctTimeMs !== scoreB.correctTimeMs) {
    winner = scoreA.correctTimeMs < scoreB.correctTimeMs ? duel.playerA : duel.playerB
  }
  loser = winner === duel.playerA ? duel.playerB : winner === duel.playerB ? duel.playerA : null
  return { winner, loser, draw: winner === null, scoreA, scoreB }
}

/** Elo exchange for one finished duel (K=32, clamped like the review Elo). */
export function duelEloUpdate(
  winnerRating: number,
  loserRating: number,
  draw: boolean,
): { winnerAfter: number; loserAfter: number } {
  const clampR = (r: number) => Math.max(100, Math.min(3000, r))
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400))
  const score = draw ? 0.5 : 1
  const delta = 32 * (score - expected)
  return {
    winnerAfter: clampR(winnerRating + delta),
    loserAfter: clampR(loserRating - delta),
  }
}
