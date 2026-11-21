/**
 * @file fsrs-integration.ts
 * @description Calibrated FSRS-6 Flashcard Deck Generation from Knowledge Space Structures
 *
 * Grounded in:
 * - Free Spaced Repetition Scheduler (FSRS-6) stability and difficulty formulation
 * - Jean-Paul Doignon & Jean-Claude Falmagne (1999) Inner/Outer Fringe frontier dynamics
 * - Bjork & Bjork (2011) Desirable difficulties and prerequisite-grounded retention
 *
 * Card Typology:
 * 1. Inner Fringe Retention Cards: Prevents knowledge state contraction at the advanced frontier.
 * 2. Outer Fringe Acquisition Cards: Scaffolds immediate ZPD acquisition grounded in mastered prerequisites.
 * 3. Surmise Invariant Cards: Consolidates structural implication p <= q.
 * 4. Slip Diagnostic Cards: Mitigates careless slip errors vs conceptual prerequisite gaps.
 *
 * @module @learning-hub/core/knowledge-space
 */

import type {
  AdaptiveAssessmentSession,
  KSTCalibratedCard,
  KSTCardGenerationConfig,
  KnowledgeState,
  KnowledgeStructure,
} from './types'
import { computeFringes } from './structure'

// ============================================================================
// 1. CALIBRATED CARD GENERATION
// ============================================================================

/**
 * Generates calibrated FSRS-6 review cards tailored to a learner's knowledge state.
 */
export function generateKSTCalibratedDeck(
  structure: KnowledgeStructure,
  sessionOrState: AdaptiveAssessmentSession | KnowledgeState,
  config: Partial<KSTCardGenerationConfig> = {},
): KSTCalibratedCard[] {
  const fullConfig: KSTCardGenerationConfig = {
    targetStateId: config.targetStateId ?? null,
    includeInnerFringe: config.includeInnerFringe ?? true,
    includeOuterFringe: config.includeOuterFringe ?? true,
    includePrerequisiteInvariants: config.includePrerequisiteInvariants ?? true,
    includeSlipDiagnostic: config.includeSlipDiagnostic ?? true,
    maxCards: config.maxCards ?? 20,
  }

  // Determine active knowledge state
  let state: KnowledgeState
  if ('stateProbabilities' in sessionOrState) {
    const mostLikely = structure.states.find((s) => s.stateId === sessionOrState.mostLikelyStateId)
    state = mostLikely || structure.states[0]!
  } else {
    state = sessionOrState
  }

  if (fullConfig.targetStateId) {
    const target = structure.states.find((s) => s.stateId === fullConfig.targetStateId)
    if (target) state = target
  }

  const fringes = computeFringes(state.itemIds, structure)
  const itemMap = new Map(structure.domainItems.map((i) => [i.id, i]))
  const cards: KSTCalibratedCard[] = []

  // 1. Inner Fringe Retention Cards (K⁻)
  if (fullConfig.includeInnerFringe) {
    for (const itemId of fringes.innerFringe) {
      const item = itemMap.get(itemId)
      if (!item) continue

      const prereqCount = item.skillsRequired.length
      // Stability boosted by prerequisite depth; damped by slip risk
      const stability =
        Math.round(3.2 * (1 + 0.25 * prereqCount) * (1 - 0.4 * item.slipProbability) * 10) / 10
      const difficulty = Math.round((3.0 + 3.8 * item.difficulty) * 10) / 10

      cards.push({
        id: `kst-card-inner-${item.id}`,
        cardType: 'inner_fringe_retention',
        targetItemId: item.id,
        prerequisiteItemIds: item.skillsRequired,
        front: `[Mastered Frontier: ${item.title}]\n\n${item.prompt}`,
        back: `Core Concept & Solution:\n${item.solution}\n\nPrerequisite Anchors: ${item.skillsRequired.join(', ') || 'Foundational'}`,
        stability,
        difficulty,
        fsrsParameters: { stability, difficulty },
        tags: ['kst', 'inner-fringe', 'retention', item.domain],
      })
    }
  }

  // 2. Outer Fringe Acquisition Cards (K⁺ - ZPD)
  if (fullConfig.includeOuterFringe) {
    for (const itemId of fringes.outerFringe) {
      const item = itemMap.get(itemId)
      if (!item) continue

      // Acquisition cards: lower initial stability, higher initial difficulty
      const stability = Math.round(1.0 * (1 - 0.3 * item.slipProbability) * 10) / 10
      const difficulty = Math.round((5.8 + 3.5 * item.difficulty) * 10) / 10

      const prereqTitles = item.skillsRequired
        .map((pId) => itemMap.get(pId)?.title || pId)
        .join('; ')

      cards.push({
        id: `kst-card-outer-${item.id}`,
        cardType: 'outer_fringe_acquisition',
        targetItemId: item.id,
        prerequisiteItemIds: item.skillsRequired,
        front: `[Ready-to-Learn: ${item.title}]\n\nBuilding upon: ${prereqTitles || 'Foundations'}\n\nProblem Challenge:\n${item.prompt}`,
        back: `Step-by-Step Acquisition Breakdown:\n${item.solution}\n\nMastery Criterion: Successfully apply with zero hints.`,
        stability,
        difficulty,
        fsrsParameters: { stability, difficulty },
        tags: ['kst', 'outer-fringe', 'zpd-acquisition', item.domain],
      })
    }
  }

  // 3. Surmise Invariant Cards (p <= q implication check)
  if (fullConfig.includePrerequisiteInvariants) {
    for (const itemId of state.itemIds) {
      const item = itemMap.get(itemId)
      if (!item) continue

      for (const reqId of item.skillsRequired) {
        const reqItem = itemMap.get(reqId)
        if (!reqItem) continue

        const stability = 4.5
        const difficulty = 3.8

        cards.push({
          id: `kst-card-invariant-${item.id}-${reqItem.id}`,
          cardType: 'surmise_invariant',
          targetItemId: item.id,
          prerequisiteItemIds: [reqId],
          front: `[Structural Surmise Link]\n\nWhy does mastery of "${item.title}" logically require prior knowledge of "${reqItem.title}"?`,
          back: `Prerequisite Invariant:\n"${reqItem.title}" establishes the core schema:\n${reqItem.description}\n\nWithout this foundation, "${item.title}" reduces to rote memorization rather than deep conceptual mastery.`,
          stability,
          difficulty,
          fsrsParameters: { stability, difficulty },
          tags: ['kst', 'surmise-invariant', 'prerequisite-grounding'],
        })
      }
    }
  }

  // 4. Slip Diagnostic Cards
  if (fullConfig.includeSlipDiagnostic) {
    const slipCandidates = structure.domainItems.filter(
      (item) => item.slipProbability >= 0.12 && state.itemIds.includes(item.id),
    )

    for (const item of slipCandidates) {
      const stability = 2.2
      const difficulty = 5.5

      cards.push({
        id: `kst-card-slip-${item.id}`,
        cardType: 'slip_misconception',
        targetItemId: item.id,
        prerequisiteItemIds: item.skillsRequired,
        front: `[Slip & Misconception Alert: ${item.title}]\n\nWhat is the most frequent careless trap or edge-case slip when solving:\n"${item.prompt}"?`,
        back: `Slip Mitigation Diagnostic:\n${item.solution}\n\nHeuristic Safeguard: Always verify prerequisite constraints before finalizing your result.`,
        stability,
        difficulty,
        fsrsParameters: { stability, difficulty },
        tags: ['kst', 'slip-diagnostic', 'error-prevention'],
      })
    }
  }

  // Limit deck size if needed
  return cards.slice(0, fullConfig.maxCards)
}
