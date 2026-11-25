/**
 * Arena nemesis analysis — per-card performance across settled runs.
 *
 * Pure and deterministic: input is the accepted (normalized) grade logs of
 * settled sessions, oldest first; output ranks the cards the arena keeps
 * catching you on. This is a *practice-insight* aid derived from the same
 * self-reported grades as the rest of the arena (grading is client-controlled
 * and honor-system). It never feeds the SRS scheduler and never moves coins.
 */

export interface NemesisGradeEntry {
  cardId: number
  grade: number
  confidence: number
  timeMs: number
}

export type CardMasteryTier = 'new' | 'shaky' | 'learning' | 'steady' | 'mastered'

export interface CardArenaStats {
  cardId: number
  attempts: number
  /** Grades >= 3 (Good/Easy). */
  correct: number
  /** Grades 1-2 (Again/Hard). */
  misses: number
  accuracy: number
  /** Confident-and-wrong answers (confidence 1, grade <= 2): the costly kind. */
  overconfidentMisses: number
  avgTimeMs: number
  /** Most recent grade, in log order. */
  lastGrade: number
  /** Current run of consecutive correct answers ending at the last attempt. */
  correctStreak: number
  /** Longest run of consecutive misses at any point. */
  worstMissStreak: number
  /** Accuracy of the last 3 attempts minus accuracy before them (null under 4 attempts). */
  recentDelta: number | null
  tier: CardMasteryTier
  /** Higher = more of a nemesis. Deterministic; see nemesisScore. */
  nemesisScore: number
}

export const NEMESIS_MIN_ATTEMPTS = 2

/** Aggregate raw log entries into per-card stats (insertion order = log order). */
export function analyzeCardPerformance(
  logs: ReadonlyArray<ReadonlyArray<NemesisGradeEntry>>,
): CardArenaStats[] {
  const byCard = new Map<number, NemesisGradeEntry[]>()
  for (const log of logs) {
    for (const e of log) {
      if (!Number.isInteger(e.cardId) || e.grade < 1 || e.grade > 4) continue
      const list = byCard.get(e.cardId)
      if (list) list.push(e)
      else byCard.set(e.cardId, [e])
    }
  }
  const out: CardArenaStats[] = []
  for (const [cardId, entries] of byCard) out.push(statsForCard(cardId, entries))
  return out
}

function statsForCard(cardId: number, entries: NemesisGradeEntry[]): CardArenaStats {
  const attempts = entries.length
  const correct = entries.filter((e) => e.grade >= 3).length
  const misses = attempts - correct
  const overconfidentMisses = entries.filter((e) => e.grade <= 2 && e.confidence === 1).length
  const avgTimeMs = Math.round(entries.reduce((s, e) => s + e.timeMs, 0) / attempts)

  let correctStreak = 0
  for (let i = entries.length - 1; i >= 0 && entries[i]!.grade >= 3; i--) correctStreak++

  let worstMissStreak = 0
  let run = 0
  for (const e of entries) {
    run = e.grade <= 2 ? run + 1 : 0
    worstMissStreak = Math.max(worstMissStreak, run)
  }

  let recentDelta: number | null = null
  if (attempts >= 4) {
    const recent = entries.slice(-3)
    const earlier = entries.slice(0, -3)
    const acc = (xs: NemesisGradeEntry[]) => xs.filter((e) => e.grade >= 3).length / xs.length
    recentDelta = Math.round((acc(recent) - acc(earlier)) * 100) / 100
  }

  const accuracy = correct / attempts
  const stats = {
    cardId,
    attempts,
    correct,
    misses,
    accuracy,
    overconfidentMisses,
    avgTimeMs,
    lastGrade: entries[entries.length - 1]!.grade,
    correctStreak,
    worstMissStreak,
    recentDelta,
  }
  return {
    ...stats,
    tier: masteryTier(stats),
    nemesisScore: nemesisScore(stats),
  }
}

/**
 * Tier from accuracy and the live streak. A card needs real volume before it
 * counts as mastered: a lucky first answer never earns the top tier.
 */
export function masteryTier(s: {
  attempts: number
  accuracy: number
  correctStreak: number
}): CardMasteryTier {
  if (s.attempts < NEMESIS_MIN_ATTEMPTS) return 'new'
  if (s.accuracy >= 0.9 && s.attempts >= 5 && s.correctStreak >= 3) return 'mastered'
  if (s.accuracy >= 0.75 && s.correctStreak >= 2) return 'steady'
  if (s.accuracy >= 0.5) return 'learning'
  return 'shaky'
}

/**
 * Nemesis score: miss rate weighted by evidence volume, plus a penalty for
 * confident misses (the answers you were sure about and got wrong), a bump for
 * miss streaks, and a discount when the live correct streak shows recovery.
 */
export function nemesisScore(s: {
  attempts: number
  misses: number
  overconfidentMisses: number
  worstMissStreak: number
  correctStreak: number
}): number {
  if (s.attempts < NEMESIS_MIN_ATTEMPTS) return 0
  const missRate = s.misses / s.attempts
  const volume = Math.min(1, s.attempts / 6)
  const base = missRate * volume * 100
  const overconf = Math.min(20, s.overconfidentMisses * 5)
  const streak = Math.min(15, Math.max(0, s.worstMissStreak - 1) * 5)
  const recovery = Math.min(30, s.correctStreak * 10)
  return Math.max(0, Math.round(base + overconf + streak - recovery))
}

/** Top-N cards by nemesisScore (ties: more misses, then lower cardId). */
export function rankNemeses(stats: ReadonlyArray<CardArenaStats>, limit = 5): CardArenaStats[] {
  return stats
    .filter((s) => s.attempts >= NEMESIS_MIN_ATTEMPTS && s.nemesisScore > 0)
    .sort((a, b) => b.nemesisScore - a.nemesisScore || b.misses - a.misses || a.cardId - b.cardId)
    .slice(0, Math.max(0, limit))
}

/** Cards that used to hurt and now have a live streak: "nemesis defeated". */
export function redeemedCards(stats: ReadonlyArray<CardArenaStats>, limit = 5): CardArenaStats[] {
  return stats
    .filter((s) => s.worstMissStreak >= 2 && s.correctStreak >= 3)
    .sort((a, b) => b.correctStreak - a.correctStreak || a.cardId - b.cardId)
    .slice(0, Math.max(0, limit))
}

export interface TierBreakdown {
  new: number
  shaky: number
  learning: number
  steady: number
  mastered: number
}

export function tierBreakdown(stats: ReadonlyArray<CardArenaStats>): TierBreakdown {
  const b: TierBreakdown = { new: 0, shaky: 0, learning: 0, steady: 0, mastered: 0 }
  for (const s of stats) b[s.tier]++
  return b
}
