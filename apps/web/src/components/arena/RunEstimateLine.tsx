'use client'

/**
 * RunEstimateLine — "about N min" under the challenge-count picker.
 *
 * Uses the player's own median pace from past runs when there is any,
 * otherwise a stated default. Flags boss-length runs. It is a planning aid:
 * the real queue can be shorter when fewer cards are due.
 */
import { BOSS_CHALLENGE_THRESHOLD, estimateRunMinutes, type PaceStats } from '@learning-hub/core'

export function runEstimateText(cards: number, pace: PaceStats): string {
  const e = estimateRunMinutes(cards, pace, BOSS_CHALLENGE_THRESHOLD)
  const basis = e.personal ? `your pace over ${pace.sampleRuns} runs` : 'a typical pace'
  const boss = e.boss ? ' A boss guardian joins at this length.' : ''
  return `About ${e.minutes} min at ${basis}.${boss}`
}

export function RunEstimateLine({
  cards,
  pace,
}: {
  cards: number
  pace: PaceStats
}): React.ReactElement {
  return (
    <p className="w-full text-xs text-faint" data-testid="arena-run-estimate">
      {runEstimateText(cards, pace)} Fewer cards may be dealt when fewer are due.
    </p>
  )
}
