/**
 * Arena run summary text — a plain, copyable recap of one run.
 *
 * Pure. The text is generated locally and copied by the player; nothing is
 * uploaded and no identifier, deck name, or card content is included. It
 * states the numbers the player's own session produced, so it is honest about
 * being self-reported: it says "practice run" and never "verified".
 */

export interface ShareRunInput {
  result: 'victory' | 'defeat'
  guardianName: string
  boss: boolean
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  crits: number
  score: number
  modifierName?: string | null
  /** Practice-rank name, when known. */
  rankName?: string | null
}

export function formatRunShareText(run: ShareRunInput): string {
  const verdict = run.result === 'victory' ? 'Victory' : 'Defeat'
  const foe = run.boss ? `${run.guardianName} (boss)` : run.guardianName
  const pct = Math.round(Math.min(1, Math.max(0, run.accuracy)) * 100)
  const lines = [
    `Review Arena practice run: ${verdict} vs ${foe}`,
    `${run.correct}/${run.rounds} correct (${pct}%) · best combo ${run.bestCombo} · ${run.crits} ${run.crits === 1 ? 'crit' : 'crits'} · score ${run.score}`,
  ]
  const extras: string[] = []
  if (run.modifierName) extras.push(`Twist: ${run.modifierName}`)
  if (run.rankName) extras.push(`Practice rank: ${run.rankName}`)
  if (extras.length) lines.push(extras.join(' · '))
  lines.push('Self-reported practice log.')
  return lines.join('\n')
}

// ─── Personal bests ─────────────────────────────────────────────────────────

export interface BestsRun {
  id: number
  result: string
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  score: number
  durationMs: number
}

export interface PersonalBests {
  bestScore: { runId: number; value: number } | null
  bestCombo: { runId: number; value: number } | null
  /** Best accuracy among runs of at least MIN_ROUNDS_FOR_ACCURACY_BEST rounds. */
  bestAccuracy: { runId: number; value: number } | null
  /** Lowest ms per card among victories with timing. */
  fastestPerCard: { runId: number; value: number } | null
  longestWinStreak: number
}

export const MIN_ROUNDS_FOR_ACCURACY_BEST = 8

/** Runs oldest first. Ties keep the earliest run: a record is set once. */
export function personalBests(runs: ReadonlyArray<BestsRun>): PersonalBests {
  const pick = (
    rows: ReadonlyArray<BestsRun>,
    value: (r: BestsRun) => number,
    better: (a: number, b: number) => boolean,
  ): { runId: number; value: number } | null => {
    let best: { runId: number; value: number } | null = null
    for (const r of rows) {
      const v = value(r)
      if (!best || better(v, best.value)) best = { runId: r.id, value: v }
    }
    return best
  }
  const timed = runs.filter((r) => r.result === 'victory' && r.rounds > 0 && r.durationMs > 0)
  let longest = 0
  let streak = 0
  for (const r of runs) {
    streak = r.result === 'victory' ? streak + 1 : 0
    longest = Math.max(longest, streak)
  }
  return {
    bestScore: pick(
      runs,
      (r) => r.score,
      (a, b) => a > b,
    ),
    bestCombo: pick(
      runs,
      (r) => r.bestCombo,
      (a, b) => a > b,
    ),
    bestAccuracy: pick(
      runs.filter((r) => r.rounds >= MIN_ROUNDS_FOR_ACCURACY_BEST),
      (r) => r.accuracy,
      (a, b) => a > b,
    ),
    fastestPerCard: pick(
      timed,
      (r) => Math.round(r.durationMs / r.rounds),
      (a, b) => a < b,
    ),
    longestWinStreak: longest,
  }
}
