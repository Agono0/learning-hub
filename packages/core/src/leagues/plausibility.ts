/**
 * Duel plausibility flags (lh-league-plausibility/v1).
 *
 * ADVISORY ONLY. These read authority-measured timings from a decided duel
 * and raise flags a human organiser may want to look at. They never change a
 * score, never block a player and are not proof of anything: fast readers,
 * short prompts, flashcards the player has seen many times and lag all
 * produce the same patterns. A flag says "look", never "cheated".
 */
import type { DuelRuntime } from './authority'

export type PlausibilityFlagCode =
  'faster_than_reading' | 'machine_regular_timing' | 'perfect_and_instant' | 'all_answers_same_text'

export interface PlausibilityFlag {
  code: PlausibilityFlagCode
  side: 'A' | 'B'
  handle: string
  detail: string
}

export interface PlausibilityOptions {
  /** Below this per-answer time the prompt cannot have been read. */
  minReadingMs?: number
  /** Standard deviation below which timings look machine-regular. */
  minStdDevMs?: number
  /** Need at least this many answers before judging regularity. */
  minSamples?: number
}

export const PLAUSIBILITY_DEFAULTS = {
  minReadingMs: 350,
  minStdDevMs: 40,
  minSamples: 4,
} as const

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

/** Flags for one finished (or in-progress) duel. Pure and deterministic. */
export function duelPlausibilityFlags(
  duel: DuelRuntime,
  options: PlausibilityOptions = {},
): PlausibilityFlag[] {
  const cfg = { ...PLAUSIBILITY_DEFAULTS, ...options }
  const flags: PlausibilityFlag[] = []
  const sides: ['A' | 'B', string, DuelRuntime['answersA']][] = [
    ['A', duel.playerA, duel.answersA],
    ['B', duel.playerB, duel.answersB],
  ]
  for (const [side, handle, answers] of sides) {
    if (answers.length === 0) continue
    const times = answers.map((a) => a.elapsedMs)

    const instant = times.filter((t) => t < cfg.minReadingMs).length
    if (instant > 0 && instant >= Math.ceil(times.length / 2)) {
      flags.push({
        code: 'faster_than_reading',
        side,
        handle,
        detail: `${instant} of ${times.length} answers arrived in under ${cfg.minReadingMs} ms`,
      })
    }

    if (times.length >= cfg.minSamples && stdDev(times) < cfg.minStdDevMs) {
      flags.push({
        code: 'machine_regular_timing',
        side,
        handle,
        detail: `answer times varied by only ${Math.round(stdDev(times))} ms`,
      })
    }

    const prompts = new Map(duel.prompts.map((p) => [p.id, p]))
    const allCorrect = answers.every((a) => {
      const p = prompts.get(a.promptId)
      return p?.answers.some((x) => x.trim().toLowerCase() === a.answer.trim().toLowerCase())
    })
    if (times.length >= cfg.minSamples && allCorrect && mean(times) < cfg.minReadingMs * 2) {
      flags.push({
        code: 'perfect_and_instant',
        side,
        handle,
        detail: `every answer correct with a mean of ${Math.round(mean(times))} ms`,
      })
    }

    if (times.length >= cfg.minSamples) {
      const texts = new Set(answers.map((a) => a.answer.trim().toLowerCase()))
      if (texts.size === 1) {
        flags.push({
          code: 'all_answers_same_text',
          side,
          handle,
          detail: 'every answer used identical text',
        })
      }
    }
  }
  return flags
}

/** Flags across every duel in an authority state, grouped by handle. */
export function leaguePlausibilityReport(
  duels: Record<string, DuelRuntime>,
  options: PlausibilityOptions = {},
): Record<string, PlausibilityFlag[]> {
  const out: Record<string, PlausibilityFlag[]> = {}
  for (const duel of Object.values(duels)) {
    for (const f of duelPlausibilityFlags(duel, options)) {
      ;(out[f.handle] ??= []).push(f)
    }
  }
  return out
}
