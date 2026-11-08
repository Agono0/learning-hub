/**
 * Weakness radar (M4): rank what to practice next — the lowest-mastery skills
 * (enough attempts to trust the estimate), the leeches (cards that keep being
 * forgotten, Wozniak), and the confident-wrong count (calibration gaps).
 * Pure module — the handler gathers rows, the page renders a ranked list.
 */

import { calculateRetrievability } from './fsrs'

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

// ─── Weakness Radar v2: Confusion Pairs & Semantic Interference ─────────────

export interface ConfusionPair {
  cardIdA: number
  cardIdB: number
  previewA: string
  previewB: string
  failCoOccurrenceCount: number
  interferenceProbability: number
  contrastPrompt: string
}

export interface RevlogReviewEntry {
  cardId: number
  grade: number
  createdAt: string
}

/**
 * Detects confusion pairs where failing card A elevates the failure probability
 * of card B in close temporal proximity (Underwood 1957; semantic interference).
 */
export function detectConfusionPairs(
  events: RevlogReviewEntry[],
  cardPreviews: Map<number, string>,
  minCoOccurrences = 2,
  timeWindowMs = 5 * 60 * 1000, // 5 minutes
): ConfusionPair[] {
  // Pair key "minId:maxId" -> statistics
  const pairStats = new Map<string, { idA: number; idB: number; count: number }>()

  // Sort chronologically
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  for (let i = 0; i < sorted.length; i++) {
    const evA = sorted[i]
    if (evA.grade !== 1) continue // Look for failures

    const timeA = new Date(evA.createdAt).getTime()

    // Look at subsequent reviews within window (up to 4 cards forward)
    for (let j = i + 1; j < Math.min(sorted.length, i + 5); j++) {
      const evB = sorted[j]
      const timeB = new Date(evB.createdAt).getTime()
      if (timeB - timeA > timeWindowMs) break

      if (evB.cardId === evA.cardId) continue

      if (evB.grade === 1) {
        // Both failed in sequence
        const [lowId, highId] =
          evA.cardId < evB.cardId ? [evA.cardId, evB.cardId] : [evB.cardId, evA.cardId]
        const key = `${lowId}:${highId}`
        const curr = pairStats.get(key) ?? { idA: lowId, idB: highId, count: 0 }
        curr.count += 1
        pairStats.set(key, curr)
      }
    }
  }

  const results: ConfusionPair[] = []
  for (const stat of pairStats.values()) {
    if (stat.count >= minCoOccurrences) {
      const prevA = cardPreviews.get(stat.idA) ?? `Card #${stat.idA}`
      const prevB = cardPreviews.get(stat.idB) ?? `Card #${stat.idB}`
      results.push({
        cardIdA: stat.idA,
        cardIdB: stat.idB,
        previewA: prevA,
        previewB: prevB,
        failCoOccurrenceCount: stat.count,
        interferenceProbability: Math.min(0.95, 0.4 + stat.count * 0.15),
        contrastPrompt: `You frequently confuse these two concepts. What is the fundamental distinction between "${truncate(prevA, 40)}" and "${truncate(prevB, 40)}"?`,
      })
    }
  }

  return results.sort((a, b) => b.failCoOccurrenceCount - a.failCoOccurrenceCount)
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str
}

// ─── Topic Retention Decay Forecast ─────────────────────────────────────────

export interface TopicDecayForecast {
  deckId: number
  deckName: string
  currentRetention: number
  projectedRetention7d: number
  projectedRetention14d: number
  projectedRetention30d: number
  urgentCardsCount: number
}

/**
 * Calculates forward retrievability decay for topics/decks using FSRS R(t).
 * Supports optional `lastReview` for exact elapsed time, or estimates elapsed
 * time from due date + stability.
 */
export function calculateTopicRetentionForecast(
  decks: Array<{ id: number; name: string }>,
  cards: Array<{
    deckId: number
    stability?: number | null
    due: string
    lastReview?: string | null
  }>,
  nowMs = Date.now(),
): TopicDecayForecast[] {
  const DAY_MS = 86400000

  return decks.map((deck) => {
    const deckCards = cards.filter((c) => c.deckId === deck.id)
    if (deckCards.length === 0) {
      return {
        deckId: deck.id,
        deckName: deck.name,
        currentRetention: 1.0,
        projectedRetention7d: 0.95,
        projectedRetention14d: 0.9,
        projectedRetention30d: 0.85,
        urgentCardsCount: 0,
      }
    }

    const computeRetentionAtOffsetDays = (offsetDays: number) => {
      let sumR = 0
      for (const card of deckCards) {
        const s = Math.max(0.5, card.stability ?? 2.0)
        const dueMs = new Date(card.due).getTime()
        const targetInstant = nowMs + offsetDays * DAY_MS

        // Calculate elapsed days since last review:
        let elapsedDays: number
        if (card.lastReview) {
          const lastReviewMs = new Date(card.lastReview).getTime()
          elapsedDays = Math.max(0, (targetInstant - lastReviewMs) / DAY_MS)
        } else {
          // In FSRS, due ≈ lastReview + S. Therefore elapsed days at targetInstant is S + (targetInstant - dueMs) / DAY_MS
          elapsedDays = Math.max(0, s + (targetInstant - dueMs) / DAY_MS)
        }

        const r = calculateRetrievability(s, elapsedDays)
        sumR += Math.max(0.05, Math.min(1.0, r))
      }
      return Math.round((sumR / deckCards.length) * 100) / 100
    }

    const currentR = computeRetentionAtOffsetDays(0)
    const urgentCount = deckCards.filter((c) => new Date(c.due).getTime() <= nowMs).length

    return {
      deckId: deck.id,
      deckName: deck.name,
      currentRetention: currentR,
      projectedRetention7d: computeRetentionAtOffsetDays(7),
      projectedRetention14d: computeRetentionAtOffsetDays(14),
      projectedRetention30d: computeRetentionAtOffsetDays(30),
      urgentCardsCount: urgentCount,
    }
  })
}

// ─── Leech Atomic Decomposer (Wozniak Rule 1) ────────────────────────────────

export interface DecomposedCardCandidate {
  front: string
  back: string
  format: 'basic' | 'cloze'
  rationale: string
}

export interface LeechDecomposition {
  cardId: number
  lapses: number
  originalFront: string
  originalBack: string
  candidates: DecomposedCardCandidate[]
}

/**
 * Automatically decomposes an overloaded leech card into atomic, minimum-information cards.
 */
export function decomposeLeechCard(card: {
  id: number
  lapses: number
  front: string
  back: string
}): LeechDecomposition {
  const candidates: DecomposedCardCandidate[] = []

  // Check if back has multiple sentences or list items
  const rawParts = card.back
    .split(/[.\n;]+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length > 5)

  if (rawParts.length > 1) {
    rawParts.forEach((part, idx) => {
      candidates.push({
        front: `${card.front} (Part ${idx + 1}/${rawParts.length})`,
        back: part,
        format: 'basic',
        rationale:
          'Split multi-fact answer into single atomic question to eliminate working memory bottleneck.',
      })
    })
  } else {
    // Cloze conversion candidate
    candidates.push({
      front: `${card.front}\n\nKey fact: {{c1::${truncate(card.back, 30)}}}`,
      back: card.back,
      format: 'cloze',
      rationale: 'Convert to cloze deletion to provide contextual retrieval cue.',
    })
    candidates.push({
      front: `Why is "${card.back}" the correct answer for: "${truncate(card.front, 35)}"?`,
      back: `Explain the causal mechanism behind: ${card.back}`,
      format: 'basic',
      rationale: 'Elaborative interrogation: asking "why" deepens semantic encoding.',
    })
  }

  return {
    cardId: card.id,
    lapses: card.lapses,
    originalFront: card.front,
    originalBack: card.back,
    candidates,
  }
}
