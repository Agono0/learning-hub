/**
 * Learning games (Agent A) — matching-pairs and category-mapping generation
 * from card content. Pure module — safe for client bundles.
 */
import type { CardContent, Grade } from './types'
import { XP_REWARDS } from './xp'

/** Minimal card row the game generators need. */
export interface GameCard {
  id: number
  type: string
  content: CardContent
  tags?: string[] | null
}

/** One prompt→answer pair in a matching game (carries its source card id). */
export interface MatchingPair {
  cardId: number
  left: string
  right: string
}

/**
 * Extract (prompt, answer) sides from any textual card format.
 * Returns null for formats that cannot be played as text (occlusion).
 */
export function cardSides(content: CardContent): { left: string; right: string } | null {
  if (content.basic) {
    return { left: content.basic.front, right: content.basic.back }
  }
  if (content.mcq) {
    const right = content.mcq.options[content.mcq.correctIndex]
    if (right === undefined) return null
    return { left: content.mcq.question, right }
  }
  if (content.typein) {
    const right = content.typein.acceptedAnswers[0]
    if (right === undefined) return null
    return { left: content.typein.question, right }
  }
  if (content.cloze) {
    const left = content.cloze.text.replace(/\{\{c\d+::.*?\}\}/g, '___')
    const right = content.cloze.answers.join(', ')
    return { left, right }
  }
  if (content.grammar) {
    return { left: content.grammar.sentence, right: content.grammar.target }
  }
  if (content.proof_step) {
    return {
      left: `${content.proof_step.theorem} — step ${content.proof_step.stepIndex + 1}`,
      right: content.proof_step.justification,
    }
  }
  if (content.matching) {
    const pair = content.matching.pairs[0]
    return pair ? { left: pair.left, right: pair.right } : null
  }
  return null
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * Build a matching-pairs game from a deck's cards: up to `maxPairs` cards
 * (default 8) become prompt→answer pairs. Returns `pairs` (shuffled) plus the
 * two board columns: `lefts` in stable order, `rights` shuffled — so the page
 * never has to shuffle itself.
 */
export function generateMatchingPairs(
  cards: GameCard[],
  opts: { maxPairs?: number; rng?: () => number } = {},
): { pairs: MatchingPair[]; lefts: MatchingPair[]; rights: MatchingPair[] } {
  const maxPairs = opts.maxPairs ?? 8
  const rng = opts.rng ?? Math.random
  const playable: MatchingPair[] = []
  for (const card of cards) {
    const sides = cardSides(card.content)
    if (sides && sides.left.trim() && sides.right.trim()) {
      playable.push({ cardId: card.id, left: sides.left, right: sides.right })
    }
  }
  const pairs = shuffled(playable, rng).slice(0, maxPairs)
  return { pairs, lefts: pairs, rights: shuffled(pairs, rng) }
}

/** One item to drag into a category in the mapping game. */
export interface MappingItem {
  cardId: number
  label: string
  category: string
}

/** A category-mapping game board: category list, items, playability flag. */
export interface MappingGame {
  categories: string[]
  items: MappingItem[]
  /** false when there are fewer than 2 categories or fewer than 4 items */
  playable: boolean
}

/**
 * Build a category-mapping game: cards are grouped by their first tag
 * (skip-listed utility tags ignored). Balanced round-robin selection keeps
 * categories even when capping the item count.
 */
export function generateMapping(
  cards: GameCard[],
  opts: { maxItems?: number; rng?: () => number } = {},
): MappingGame {
  const maxItems = opts.maxItems ?? 12
  const rng = opts.rng ?? Math.random
  const SKIP_TAGS = new Set(['ai', 'cloze', 'mcq', 'typein', 'basic', 'proof-step', 'definition', 'theorem', 'lemma', 'exam'])
  const byCategory = new Map<string, { cardId: number; label: string }[]>()
  for (const card of cards) {
    const sides = cardSides(card.content)
    const tag = (card.tags ?? []).find((t) => !SKIP_TAGS.has(t))
    if (!sides || !tag) continue
    const bucket = byCategory.get(tag) ?? []
    bucket.push({ cardId: card.id, label: sides.left })
    byCategory.set(tag, bucket)
  }
  const categories = Array.from(byCategory.keys())
  // round-robin across category buckets until the cap
  const queues = Array.from(byCategory.values()).map((b) => shuffled(b, rng))
  const items: MappingItem[] = []
  while (items.length < maxItems && queues.some((q) => q.length > 0)) {
    for (let ci = 0; ci < categories.length && items.length < maxItems; ci++) {
      const next = queues[ci]?.shift()
      if (next) items.push({ cardId: next.cardId, label: next.label, category: categories[ci]! })
    }
  }
  return {
    categories,
    items,
    playable: categories.length >= 2 && items.length >= 4,
  }
}

// ─── Matching Game Evaluation & Grading (DEF-007) ───────────────────────────

/**
 * Calculate matching game accuracy from pairs matched and misses incurred.
 * Attempts = pairs + misses. Returns 0..1 (clamped).
 */
export function calculateMatchingAccuracy(pairs: number, misses: number): number {
  if (typeof pairs !== 'number' || typeof misses !== 'number') return 0
  if (!Number.isFinite(pairs) || pairs <= 0) return 0
  const safeMisses = Number.isFinite(misses) ? Math.max(0, misses) : 0
  const total = pairs + safeMisses
  if (!Number.isFinite(total) || total <= 0) return 0
  const acc = pairs / total
  return Number.isFinite(acc) ? Math.max(0, Math.min(1, acc)) : 0
}

/**
 * Map accuracy ratio (0..1) to FSRS grade (1 Again, 2 Hard, 3 Good, 4 Easy).
 * - >= 90%: Easy (Grade 4) — rapid, near-flawless recall
 * - >= 70%: Good (Grade 3) — solid recall with minor error
 * - >= 40%: Hard (Grade 2) — labored recall with multiple misses
 * - < 40%:  Again (Grade 1) — severe lapse / guessing
 */
export function gradeForAccuracy(accuracy: number): Grade {
  const acc = Math.max(0, Math.min(1, accuracy))
  if (acc >= 0.9) return 4
  if (acc >= 0.7) return 3
  if (acc >= 0.4) return 2
  return 1
}

/**
 * Calculate XP earned in a matching game round:
 * - Base review XP per pair: `pairs * XP_REWARDS.review` (2 XP/pair)
 * - Recall bonus: `XP_REWARDS.reviewRecall` (+5 XP) if grade >= 3 (Good/Easy)
 * - Speed bonus: +5 XP if accuracy >= 0.8 and average time per pair < 4 seconds
 */
export function calculateMatchingXp(opts: {
  pairs: number
  accuracy: number
  timeMs?: number
}): { xp: number; speedBonus: boolean; base: number; recallBonus: number } {
  const safePairs = Number.isFinite(opts.pairs) && opts.pairs > 0 ? opts.pairs : 0
  const base = safePairs * XP_REWARDS.review
  const grade = gradeForAccuracy(opts.accuracy)
  const recallBonus = grade >= 3 ? XP_REWARDS.reviewRecall : 0
  const timeMs = typeof opts.timeMs === 'number' && Number.isFinite(opts.timeMs) ? opts.timeMs : null
  const avgTimePerPair = timeMs !== null && safePairs > 0 && timeMs >= 0 ? timeMs / safePairs : null
  const speedBonus = Boolean(avgTimePerPair !== null && avgTimePerPair < 4000 && opts.accuracy >= 0.8)
  const speedXp = speedBonus ? 5 : 0
  return {
    xp: base + recallBonus + speedXp,
    speedBonus,
    base,
    recallBonus,
  }
}

/** Full round outcome of a matching game (accuracy, grade, XP). */
export interface MatchingGameEvaluation {
  pairs: number
  misses: number
  totalAttempts: number
  accuracy: number
  scorePct: number
  grade: Grade
  xp: number
  speedBonus: boolean
}

/**
 * Pure round evaluation: computes accuracy, grade, score percentage, and XP rewards.
 */
export function evaluateMatchingGame(opts: {
  pairs: number
  misses: number
  timeMs?: number
}): MatchingGameEvaluation {
  const safePairs = Number.isFinite(opts.pairs) && opts.pairs > 0 ? opts.pairs : 0
  const safeMisses = Number.isFinite(opts.misses) && opts.misses > 0 ? opts.misses : 0
  const accuracy = calculateMatchingAccuracy(safePairs, safeMisses)
  const grade = gradeForAccuracy(accuracy)
  const xpInfo = calculateMatchingXp({ pairs: safePairs, accuracy, timeMs: opts.timeMs })
  return {
    pairs: safePairs,
    misses: safeMisses,
    totalAttempts: safePairs + safeMisses,
    accuracy: Math.round(accuracy * 1000) / 1000,
    scorePct: Math.round(accuracy * 100),
    grade,
    xp: xpInfo.xp,
    speedBonus: xpInfo.speedBonus,
  }
}

