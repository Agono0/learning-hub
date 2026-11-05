/**
 * Weakness radar (M4): rank what to practice next — the lowest-mastery skills
 * (enough attempts to trust the estimate), the leeches (cards that keep being
 * forgotten, Wozniak), and the confident-wrong count (calibration gaps).
 * Pure module — the handler gathers rows, the page renders a ranked list.
 */

/** One skill's mastery facts. */
export interface WeaknessSkill {
  skillId: number
  name: string
  pKnown: number
  attempts: number
  elo?: number
}

/** One leech card (lapses ≥ threshold). */
export interface WeaknessLeech {
  cardId: number
  lapses: number
  /** short front-text preview, filled by the handler */
  preview?: string | null
}

export interface WeaknessRadar {
  /** weakest-first, attempts ≥ minAttempts, capped */
  skills: WeaknessSkill[]
  /** most-lapsed cards first, capped */
  leeches: WeaknessLeech[]
  /** cards with confident-wrong reviews in the window */
  overconfidentCards: number
  /** one calm sentence naming the top priority */
  summary: string
}

/**
 * Rank weaknesses. Skills need `minAttempts` (default 3) before their pKnown
 * is trusted — a skill guessed at once is not yet "weak", it is unknown.
 */
export function weaknessRadar(input: {
  skills: WeaknessSkill[]
  leeches: WeaknessLeech[]
  overconfidentCards: number
  minAttempts?: number
  cap?: number
}): WeaknessRadar {
  const minAttempts = input.minAttempts ?? 3
  const cap = input.cap ?? 5

  const skills = [...input.skills]
    .filter((s) => s.attempts >= minAttempts)
    .sort((a, b) => a.pKnown - b.pKnown || a.attempts - b.attempts)
    .slice(0, cap)

  const leeches = [...input.leeches].sort((a, b) => b.lapses - a.lapses).slice(0, cap)

  const top = skills[0]
  const leechTop = leeches[0]
  let summary = 'No clear weaknesses yet — keep reviewing and the radar fills in.'
  if (leechTop && top && leechTop.lapses >= 8) {
    summary = `Weakest skill: ${top.name}. Worst leech: ${leechTop.preview ?? `card #${leechTop.cardId}`} (${leechTop.lapses} lapses).`
  } else if (top) {
    summary = `Weakest skill: ${top.name} (${Math.round(top.pKnown * 100)}% known). Practice it before new material.`
  } else if (leechTop) {
    summary = `Watch the leeches — "${leechTop.preview ?? `card #${leechTop.cardId}`}" keeps slipping.`
  }

  return { skills, leeches, overconfidentCards: input.overconfidentCards, summary }
}
