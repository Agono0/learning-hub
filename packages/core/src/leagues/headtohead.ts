/**
 * Head-to-head records between two league players: duel history distilled
 * into a rivalry summary (wins/losses/draws, accuracy, speed, current Elo
 * gap, streaks and form). Pure domain logic over duel + Elo event shapes;
 * persistence gathering lives in packages/db repos/leagues.
 */

/** One completed duel between the pair, from either player's perspective. */
export interface HeadToHeadEncounter {
  /** Duel slug. */
  duelId: string
  /** Winner handle, or null for an honest draw. */
  winner: string | null
  /** Correct answers by each side. */
  correctA: number
  correctB: number
  /** Total prompts (both sides answer the same set). */
  total: number
  /** Time over CORRECT answers only, per side (speed tiebreak input). */
  correctTimeMsA: number
  correctTimeMsB: number
  /** ISO completion instant, for ordering and recency. */
  completedAt: string
}

export interface HeadToHeadSummary {
  playerA: string
  playerB: string
  /** Completed duels between the pair. */
  duels: number
  winsA: number
  winsB: number
  draws: number
  /** Share of decided duels won by each side (0 when no decided duels). */
  winRateA: number
  winRateB: number
  /** Lifetime accuracy across the pairing (correct / total answers). */
  accuracyA: number
  accuracyB: number
  /** Average correct-answer speed (ms) across the pairing; 0 with no correct. */
  avgCorrectMsA: number
  avgCorrectMsB: number
  /** Current win streaks (draws break both streaks). */
  streakA: number
  streakB: number
  /** Result of the most recent duel: 'A' | 'B' | 'draw' | null. */
  lastResult: 'A' | 'B' | 'draw' | null
  lastDuelAt: string | null
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Distill the completed duels between two players into a rivalry summary.
 * Encounters may arrive in any order; they are sorted by completion time.
 * Side A/B in each encounter is identified by handle, not by duel seating.
 */
export function summarizeHeadToHead(
  playerA: string,
  playerB: string,
  encounters: HeadToHeadEncounter[],
): HeadToHeadSummary {
  const ordered = [...encounters].sort((a, b) => a.completedAt.localeCompare(b.completedAt))

  let winsA = 0
  let winsB = 0
  let draws = 0
  let correctA = 0
  let correctB = 0
  let answeredA = 0
  let answeredB = 0
  let timeA = 0
  let timeB = 0
  let streakA = 0
  let streakB = 0
  let lastResult: HeadToHeadSummary['lastResult'] = null
  let lastDuelAt: string | null = null

  for (const e of ordered) {
    correctA += e.correctA
    correctB += e.correctB
    answeredA += e.total
    answeredB += e.total
    timeA += e.correctTimeMsA
    timeB += e.correctTimeMsB
    lastDuelAt = e.completedAt
    if (e.winner === null) {
      draws += 1
      streakA = 0
      streakB = 0
      lastResult = 'draw'
    } else if (e.winner === playerA) {
      winsA += 1
      streakA += 1
      streakB = 0
      lastResult = 'A'
    } else {
      winsB += 1
      streakB += 1
      streakA = 0
      lastResult = 'B'
    }
  }

  const duels = ordered.length
  const decided = winsA + winsB
  return {
    playerA,
    playerB,
    duels,
    winsA,
    winsB,
    draws,
    winRateA: decided > 0 ? round3(winsA / decided) : 0,
    winRateB: decided > 0 ? round3(winsB / decided) : 0,
    accuracyA: answeredA > 0 ? round3(correctA / answeredA) : 0,
    accuracyB: answeredB > 0 ? round3(correctB / answeredB) : 0,
    avgCorrectMsA: correctA > 0 ? Math.round(timeA / correctA) : 0,
    avgCorrectMsB: correctB > 0 ? Math.round(timeB / correctB) : 0,
    streakA,
    streakB,
    lastResult,
    lastDuelAt,
  }
}

/**
 * Suggested next-rival framing for the UI: who leads, by how much, and
 * whether the pairing is even. Kept pure so every surface words it the same.
 */
export function headToHeadLeader(summary: HeadToHeadSummary): {
  leader: string | null
  edge: number
  even: boolean
} {
  const { winsA, winsB, playerA, playerB } = summary
  const edge = Math.abs(winsA - winsB)
  if (winsA === winsB) return { leader: null, edge: 0, even: true }
  return { leader: winsA > winsB ? playerA : playerB, edge, even: false }
}

/** Elo gap framing: positive means playerA rates higher. */
export function headToHeadEloGap(
  eloA: number,
  eloB: number,
): {
  gap: number
  higher: string | null
} {
  const gap = eloA - eloB
  return { gap, higher: gap === 0 ? null : gap > 0 ? 'A' : 'B' }
}
