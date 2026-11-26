/**
 * Deck Doctor — linter-driven deck health diagnostic and mechanical one-click fixes.
 *
 * Implements Piotr Wozniak's 20 Rules of Formulating Knowledge (Wozniak 1999)
 * and spaced repetition retention hygiene (Bjork & Bjork 2011, Karpicke 2008).
 * Pure domain logic — zero I/O, deterministic calculation.
 */
import { lintDeck, type LintCardInput, type LintResult } from './linter'
import type { CardContent, CardFormat } from './types'
import { createGenerationLadder, type GenerationLadder, type GenerationTier } from './generation'
import { cardPreviewText, findClozeMarkers, replaceClozeMarkers } from './cards'

/** A single mechanical or guided remediation action emitted by Deck Doctor. */
export type DoctorAction =
  | { kind: 'delete-card'; cardId: number; rule: string; reason: string }
  | { kind: 'suspend-card'; cardId: number; rule: string }
  | { kind: 'rename-deck'; deckId: number; to: string; rule: string }
  | { kind: 'regenerate-cloze'; cardId: number; rule: string }
  | { kind: 'manual'; rule: string; cardIds: number[]; hint: string }

/** Card input shape accepted by Deck Doctor. */
export interface DoctorCardInput {
  id: number
  deckId: number
  type: CardFormat
  content: CardContent
  source?: string | null
  tags?: string[] | null
  suspended?: boolean
  lapses?: number
  reps?: number
}

/** Deck input shape accepted by Deck Doctor. */
export interface DoctorDeckInput {
  id: number
  name: string
  description?: string | null
}

/** Diagnosed finding with card reference and rule details. */
export interface DoctorFinding {
  cardId: number
  ruleId: string
  severity: 'error' | 'warn' | 'info'
  message: string
  suggestion?: string
}

/** Generation ladder suggestion emitted by Deck Doctor for failing or passive cards. */
export interface CardGenerationSuggestion {
  cardId: number
  concept: string
  contextText: string
  recommendedTier: GenerationTier
  rationale: string
  ladder: GenerationLadder
}

/** Comprehensive diagnosis result for an entire deck. */
export interface DeckDiagnosis {
  deckId: number
  healthScore: number
  findings: DoctorFinding[]
  actions: DoctorAction[]
  generationSuggestions?: CardGenerationSuggestion[]
  stats: {
    totalCards: number
    cleanCards: number
    errorCount: number
    warnCount: number
    infoCount: number
    leechCount: number
  }
}

/** DB-neutral execution operation returned by applyDoctorAction. */
export type DoctorOperation =
  | { op: 'delete'; cardId: number }
  | { op: 'update'; cardId: number; patch: Partial<DoctorCardInput> }
  | { op: 'rename-deck'; deckId: number; name: string }
  | { op: 'noop' }

/** Default threshold of consecutive lapses that defines a leech card. */
export const LEECH_LAPSE_THRESHOLD = 8

/**
 * Human-guidance hints referencing cognitive learning science for manual rules.
 */
const RULE_MANUAL_HINTS: Record<string, string> = {
  'W1-minimum-information':
    'Minimum Information Principle (Wozniak Rule 1): Multi-question cards cause recall interference. Split into atomic cards with a single memory trace each.',
  'W2-avoid-sets':
    'Avoid Sets (Wozniak Rule 2): Complex enumerations are notoriously hard to retain. Split into individual cards or convert to overlapping cloze deletions.',
  'W3-answer-length':
    'Testing Effect (Roediger & Karpicke 2006): Long answers defeat retrieval fluency. Reduce to a key target word or number.',
  'W9-source-missing':
    'Provenance Hygiene: Add source notes (URL, textbook, lecture) to enable fact verification.',
  'W10-imagery':
    'Dual-Coding Theory (Paivio 1986): Concrete nouns are remembered significantly better when paired with a mental image or vivid scene.',
  'W14-context-cue':
    'Encoding Specificity (Tulving & Thomson 1973): Bare pronouns without domain context cause retrieval confusion. Prefix domain clues (e.g. "In biology:").',
  'W18-date-stamp':
    'Temporal Rot (Wozniak Rule 18): Phrases like "current" or "latest" expire. Timestamp facts explicitly (e.g. "As of 2026:").',
  'W19-priority-stamp':
    'Priority Queueing: Tag cards with subject or milestone labels to enable focused study queues.',
}

/**
 * Evaluates the health score of a deck based on linter findings and leeches.
 *
 * Formula:
 *  Base = 100
 *  Penalties:
 *   - Error: 5 pts each
 *   - Warning: 2 pts each
 *   - Info: 0.5 pts each
 *   - Leech: 4 pts each
 *  Score is clamped to [0, 100]. An empty deck defaults to 100.
 */
export function calculateHealthScore(counts: {
  errors: number
  warns: number
  infos: number
  leeches: number
  totalCards: number
}): number {
  if (counts.totalCards === 0) return 100
  const penalty = counts.errors * 5 + counts.warns * 2 + counts.infos * 0.5 + counts.leeches * 4
  return Math.max(0, Math.min(100, Math.round(100 - penalty)))
}

/**
 * Diagnoses a deck by evaluating all cards against Wozniak's formulation rules,
 * identifying leeches and duplicate pairs, and assembling one-click remediation actions.
 */
export function diagnoseDeck(input: {
  deck: DoctorDeckInput
  cards: DoctorCardInput[]
}): DeckDiagnosis {
  const { deck, cards } = input

  // Convert cards to linter inputs
  const lintInputs: LintCardInput[] = cards.map((c) => ({
    id: c.id,
    deckId: c.deckId,
    type: c.type,
    content: c.content,
    source: c.source,
    tags: c.tags,
  }))

  const rawDeckLint = lintDeck(lintInputs)

  const findings: DoctorFinding[] = []
  const cardFindingMap = new Map<number, LintResult[]>()
  let errorCount = 0
  let warnCount = 0
  let infoCount = 0

  for (const entry of rawDeckLint) {
    if (entry.results.length > 0) {
      cardFindingMap.set(entry.cardId, entry.results)
      for (const res of entry.results) {
        if (res.severity === 'error') errorCount++
        else if (res.severity === 'warn') warnCount++
        else if (res.severity === 'info') infoCount++

        findings.push({
          cardId: entry.cardId,
          ruleId: res.ruleId,
          severity: res.severity,
          message: res.message,
          suggestion: res.suggestion,
        })
      }
    }
  }

  // Detect leeches
  const leechCards = cards.filter((c) => (c.lapses ?? 0) >= LEECH_LAPSE_THRESHOLD)
  const leechCount = leechCards.length

  const cleanCards = cards.filter(
    (c) => !cardFindingMap.has(c.id) && (c.lapses ?? 0) < LEECH_LAPSE_THRESHOLD,
  ).length

  const healthScore = calculateHealthScore({
    errors: errorCount,
    warns: warnCount,
    infos: infoCount,
    leeches: leechCount,
    totalCards: cards.length,
  })

  // Assemble actions
  const actions: DoctorAction[] = []
  const flaggedDuplicatePairs = new Set<string>()

  // 1. Deck naming check
  const genericDeckNames = ['untitled', 'new deck', 'deck', 'default', 'cards']
  if (genericDeckNames.includes(deck.name.trim().toLowerCase()) || deck.name.trim().length <= 2) {
    actions.push({
      kind: 'rename-deck',
      deckId: deck.id,
      to: 'Comprehensive Deck',
      rule: 'deck-naming',
    })
  }

  // 2. Leech actions (suspend is the primary recommendation, delete as alternative)
  for (const leech of leechCards) {
    if (!leech.suspended) {
      actions.push({
        kind: 'suspend-card',
        cardId: leech.id,
        rule: 'leech-prevention',
      })
    }
  }

  // 3. Card-specific mechanical fixes
  for (const card of cards) {
    const cardFindings = cardFindingMap.get(card.id) ?? []
    for (const f of cardFindings) {
      // W6 Interference / near duplicates
      if (f.ruleId === 'W6-interference') {
        const match = f.message.match(/card (\d+)/)
        const siblingId = match ? Number(match[1]) : null
        if (siblingId !== null) {
          const pairKey = [Math.min(card.id, siblingId), Math.max(card.id, siblingId)].join(':')
          if (!flaggedDuplicatePairs.has(pairKey)) {
            flaggedDuplicatePairs.add(pairKey)
            // Flag the higher ID card for deletion so only one is removed
            const deleteTargetId = Math.max(card.id, siblingId)
            actions.push({
              kind: 'delete-card',
              cardId: deleteTargetId,
              rule: 'W6-interference',
              reason: `Near-duplicate of sibling card #${Math.min(card.id, siblingId)}`,
            })
          }
        }
      }

      // W11 Cloze suggestion
      if (f.ruleId === 'W11-cloze-suggestion' && card.type === 'basic') {
        actions.push({
          kind: 'regenerate-cloze',
          cardId: card.id,
          rule: 'W11-cloze-suggestion',
        })
      }
    }
  }

  // 4. Group remaining manual human-judgment findings by rule
  const ruleCardsMap = new Map<string, Set<number>>()
  for (const finding of findings) {
    if (finding.ruleId !== 'W6-interference' && finding.ruleId !== 'W11-cloze-suggestion') {
      const set = ruleCardsMap.get(finding.ruleId) ?? new Set<number>()
      set.add(finding.cardId)
      ruleCardsMap.set(finding.ruleId, set)
    }
  }

  for (const [ruleId, cardIdSet] of ruleCardsMap.entries()) {
    const cardIds = Array.from(cardIdSet).sort((a, b) => a - b)
    const hint =
      RULE_MANUAL_HINTS[ruleId] ??
      'Formulate this card following Piotr Wozniak’s 20 Rules of Knowledge.'
    actions.push({
      kind: 'manual',
      rule: ruleId,
      cardIds,
      hint,
    })
  }

  // 5. Generate active generation ladder recommendations for leeches and high-lapse cards (>= 4)
  const generationSuggestions: CardGenerationSuggestion[] = []
  for (const card of cards) {
    if ((card.lapses ?? 0) >= 4) {
      const suggestion = suggestGenerationLadderForCard(card)
      if (suggestion) generationSuggestions.push(suggestion)
    }
  }

  return {
    deckId: deck.id,
    healthScore,
    findings,
    actions,
    generationSuggestions,
    stats: {
      totalCards: cards.length,
      cleanCards,
      errorCount,
      warnCount,
      infoCount,
      leechCount,
    },
  }
}

/**
 * Computes the DB-neutral operation for a given DoctorAction.
 */
export function applyDoctorAction(
  action: DoctorAction,
  cardLookup?: (cardId: number) => DoctorCardInput | undefined,
): DoctorOperation {
  switch (action.kind) {
    case 'delete-card':
      return { op: 'delete', cardId: action.cardId }

    case 'suspend-card':
      return { op: 'update', cardId: action.cardId, patch: { suspended: true } }

    case 'rename-deck':
      return { op: 'rename-deck', deckId: action.deckId, name: action.to }

    case 'regenerate-cloze': {
      if (!cardLookup) return { op: 'noop' }
      const card = cardLookup(action.cardId)
      if (!card || card.type !== 'basic' || !card.content.basic) return { op: 'noop' }
      const front = card.content.basic.front.trim()
      const back = card.content.basic.back.trim()
      return {
        op: 'update',
        cardId: action.cardId,
        patch: {
          type: 'cloze',
          content: {
            cloze: {
              text: `${front}: {{c1::${back}}}`,
              answers: [back],
              mode: 'basic',
            },
          },
        },
      }
    }

    case 'manual':
      return { op: 'noop' }
  }
}

/**
 * Bridges Deck Doctor with the Slamecka & Graf (1978) Generation Effect Engine.
 *
 * Inspects a card's formulation, lapses, and content structure.
 * When a card is a leech, has high lapses (>= 4), or suffers from passive formulation,
 * it derives an active 4-tier generation ladder challenge rather than merely suspending or deleting.
 */
export function suggestGenerationLadderForCard(
  card: DoctorCardInput,
  preferredTier?: GenerationTier,
): CardGenerationSuggestion | null {
  let concept = ''
  let contextText = ''

  if (card.type === 'basic' && card.content.basic) {
    concept = card.content.basic.front.trim()
    contextText = card.content.basic.back.trim() || concept
  } else if (card.type === 'cloze' && card.content.cloze) {
    const raw = card.content.cloze.text.trim()
    const first = findClozeMarkers(raw)[0]
    concept = first ? first.inner.trim() : (cardPreviewText(card.type, card.content) ?? 'Concept')
    contextText = replaceClozeMarkers(raw, (inner) => inner)
  } else {
    concept = cardPreviewText(card.type, card.content) ?? `Card #${card.id}`
    contextText = concept
  }

  if (!concept) return null

  const lapses = card.lapses ?? 0
  let tier: GenerationTier = preferredTier ?? 'stem_completion'
  let rationale = 'Active generation strengthens memory traces via retrieval practice.'

  if (!preferredTier) {
    if (lapses >= LEECH_LAPSE_THRESHOLD) {
      tier = 'analogy_synthesis'
      rationale = `Severe leech (${lapses} lapses): Deep semantic re-encoding and analogy synthesis required to break interference.`
    } else if (lapses >= 4) {
      tier = 'semantic_anagram'
      rationale = `Frequent lapses (${lapses} lapses): Desirable difficulty via token unscrambling forces active reconstruction.`
    } else {
      tier = 'stem_completion'
      rationale = 'Standard active recall scaffold: stem completion generates memory cues.'
    }
  }

  const ladder = createGenerationLadder(concept, contextText, tier)

  return {
    cardId: card.id,
    concept,
    contextText,
    recommendedTier: tier,
    rationale,
    ladder,
  }
}
