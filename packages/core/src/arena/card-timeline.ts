/**
 * Arena card timeline — one card's full history across settled runs.
 *
 * Pure and deterministic. Built from the same accepted grade logs as the
 * nemesis ranking, so the drilldown and the ranking can never disagree.
 * Practice insight over self-reported grades; never a scheduler input.
 */
import { analyzeCardPerformance, type CardArenaStats, type NemesisGradeEntry } from './nemesis'

export interface CardTimelineAttempt {
  /** 1-based index of the settled run (oldest = 1) this attempt happened in. */
  run: number
  /** 1-based attempt number for this card. */
  attempt: number
  grade: number
  confidence: number
  timeMs: number
  correct: boolean
  /** Confident-and-wrong. */
  overconfident: boolean
}

export type SpeedTrend = 'faster' | 'slower' | 'steady' | 'unknown'

export interface CardTimeline {
  cardId: number
  attempts: CardTimelineAttempt[]
  stats: CardArenaStats | null
  fastestMs: number | null
  slowestMs: number | null
  /** First half vs second half average time, 15% dead band. */
  speedTrend: SpeedTrend
  /** Runs this card appeared in. */
  runsSeen: number
  /** The longest correct streak at any point. */
  bestCorrectStreak: number
}

export function speedTrendOf(times: ReadonlyArray<number>): SpeedTrend {
  if (times.length < 4) return 'unknown'
  const mid = Math.floor(times.length / 2)
  const avg = (xs: ReadonlyArray<number>) => xs.reduce((s, x) => s + x, 0) / xs.length
  const early = avg(times.slice(0, mid))
  const late = avg(times.slice(mid))
  if (early <= 0) return 'unknown'
  const change = (late - early) / early
  if (change <= -0.15) return 'faster'
  if (change >= 0.15) return 'slower'
  return 'steady'
}

export function buildCardTimeline(
  logs: ReadonlyArray<ReadonlyArray<NemesisGradeEntry>>,
  cardId: number,
): CardTimeline {
  const attempts: CardTimelineAttempt[] = []
  let runsSeen = 0
  logs.forEach((log, runIdx) => {
    let seenInRun = false
    for (const e of log) {
      if (e.cardId !== cardId || e.grade < 1 || e.grade > 4) continue
      seenInRun = true
      attempts.push({
        run: runIdx + 1,
        attempt: attempts.length + 1,
        grade: e.grade,
        confidence: e.confidence,
        timeMs: e.timeMs,
        correct: e.grade >= 3,
        overconfident: e.grade <= 2 && e.confidence === 1,
      })
    }
    if (seenInRun) runsSeen++
  })

  const times = attempts.map((a) => a.timeMs)
  let best = 0
  let streak = 0
  for (const a of attempts) {
    streak = a.correct ? streak + 1 : 0
    best = Math.max(best, streak)
  }
  const stats = analyzeCardPerformance(logs).find((s) => s.cardId === cardId) ?? null
  return {
    cardId,
    attempts,
    stats,
    fastestMs: times.length ? Math.min(...times) : null,
    slowestMs: times.length ? Math.max(...times) : null,
    speedTrend: speedTrendOf(times),
    runsSeen,
    bestCorrectStreak: best,
  }
}
