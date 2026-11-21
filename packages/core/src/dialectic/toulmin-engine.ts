/**
 * Learning HUB — Socratic Dialectic & Toulmin Argumentation Engine.
 *
 * Implements:
 * 1. Stephen Toulmin's Argumentation Model (1958: Claim, Grounds, Warrant, Backing, Qualifier, Rebuttal).
 * 2. Imre Lakatos's Proofs & Refutations Heuristic Lifecycle (1976: Monster-Barring, Exception-Incorporation, Lemma-Incorporation).
 * 3. 12-Fallacy Epistemic Taxonomy with automated heuristic detection and pedagogical remedies.
 * 4. Epistemic Rigor & Graph Structural Evaluator (Bloom Level 6: Evaluation & Synthesis).
 * 5. Dialectical Spaced Repetition Bridge (Toulmin to FSRS Flashcards).
 */
import { z } from 'zod'

import { COMPREHENSIVE_FALLACY_CATALOG } from './content'

// TD-05: scenario corpora (12-fallacy catalog, Lakatos tactic definitions, deep
// dialectic cases) are CONTENT, not logic — they live in ./content.ts so engine diffs
// stay about algorithms. Re-exported so every existing import path keeps working (the
// barrel does `export * from` this file).
export {
  COMPREHENSIVE_FALLACY_CATALOG,
  DEEP_DIALECTIC_CASES,
  LAKATOS_TACTIC_DEFINITIONS,
} from './content'

// ─── 1. Toulmin Argumentation Model Schemas ─────────────────────────────────

export const toulminNodeTypeSchema = z.enum([
  'claim', // The central assertion or conclusion
  'ground', // Empirical data, observational evidence, measurements
  'warrant', // Inferential rule / bridge legitimizing movement from ground to claim
  'backing', // Secondary theoretical or empirical support validating the warrant
  'qualifier', // Degree of force / modal certainty ('necessarily', 'probably', 'ceteris paribus')
  'rebuttal', // Boundary exceptions, defeaters, counter-conditions where warrant fails
])
export type ToulminNodeType = z.infer<typeof toulminNodeTypeSchema>

export const toulminRelationSchema = z.enum([
  'supports', // Ground supports Claim
  'warrants', // Warrant connects Ground to Claim
  'backs', // Backing strengthens Warrant
  'qualifies', // Qualifier limits Claim
  'rebuts', // Rebuttal challenges Claim or Warrant
])
export type ToulminRelation = z.infer<typeof toulminRelationSchema>

export const toulminNodeSchema = z.object({
  id: z.string().min(1),
  type: toulminNodeTypeSchema,
  text: z.string().min(1),
  authorRole: z.enum(['thesis', 'antithesis', 'learner', 'neutral']).default('neutral'),
  confidence: z.number().min(0).max(1).default(0.8),
  verified: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type ToulminNode = z.infer<typeof toulminNodeSchema>

export const toulminEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1), // Source node id
  target: z.string().min(1), // Target node id
  relation: toulminRelationSchema,
  strength: z.number().min(0).max(1).default(1.0),
})
export type ToulminEdge = z.infer<typeof toulminEdgeSchema>

export const toulminArgumentGraphSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  primaryClaimId: z.string().min(1),
  nodes: z.array(toulminNodeSchema),
  edges: z.array(toulminEdgeSchema),
  createdAt: z.string().optional(),
})
export type ToulminArgumentGraph = z.infer<typeof toulminArgumentGraphSchema>

// ─── 2. Expanded 12-Fallacy Cognitive Taxonomy ─────────────────────────────

export const expandedFallacySchema = z.enum([
  // Original 6
  'straw_man',
  'ad_hominem',
  'false_dichotomy',
  'circular_reasoning',
  'appeal_to_authority',
  'slippery_slope',
  // Advanced 6
  'post_hoc_ergo_propter_hoc', // Confusing temporal sequence with causation
  'equivocation', // Semantic shift of a crucial term
  'red_herring', // Distraction by tangential irrelevance
  'tu_quoque', // Deflecting via opponent hypocrisy ("you too")
  'no_true_scotsman', // Ad-hoc purity qualification to dodge counterexample
  'hasty_generalization', // Drawing universal conclusions from insufficient sample
])
export type ExpandedFallacy = z.infer<typeof expandedFallacySchema>

export interface FallacyDefinition {
  key: ExpandedFallacy
  label: string
  latinName?: string
  description: string
  cognitiveTrap: string
  detectionKeywords: string[]
  pedagogicalRemedy: string
  exampleArgument: string
  counterFraming: string
}

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// above so import paths are unchanged.

// ─── 3. Epistemic Rigor & Toulmin Graph Evaluator ───────────────────────────

export interface EpistemicRigorEvaluation {
  epistemicRigorScore: number // 0 to 100
  groundingRatio: number // grounds / claims
  warrantBackingRatio: number // backed warrants / total warrants
  rebuttalIntegrity: number // presence of qualified rebuttals
  structuralVulnerabilities: Array<{
    nodeId: string
    severity: 'critical' | 'moderate' | 'minor'
    issue: string
    recommendation: string
  }>
  strengths: string[]
  isBloomLevel6Synthesized: boolean
}

/**
 * Evaluates an argument graph according to Toulmin's model and Bloom's Level 6 evaluation criteria.
 */
export function evaluateToulminGraph(graph: ToulminArgumentGraph): EpistemicRigorEvaluation {
  const claims = graph.nodes.filter((n) => n.type === 'claim')
  const grounds = graph.nodes.filter((n) => n.type === 'ground')
  const warrants = graph.nodes.filter((n) => n.type === 'warrant')
  const backings = graph.nodes.filter((n) => n.type === 'backing')
  const qualifiers = graph.nodes.filter((n) => n.type === 'qualifier')
  const rebuttals = graph.nodes.filter((n) => n.type === 'rebuttal')

  const vulnerabilities: EpistemicRigorEvaluation['structuralVulnerabilities'] = []
  const strengths: string[] = []

  // 1. Check for floating claims (claims with zero incoming supporting edges)
  for (const c of claims) {
    const hasIncomingGround = graph.edges.some(
      (e) => e.target === c.id && (e.relation === 'supports' || e.relation === 'warrants'),
    )
    if (!hasIncomingGround) {
      vulnerabilities.push({
        nodeId: c.id,
        severity: 'critical',
        issue: `Floating Claim: "${c.text.slice(0, 40)}..." has no supporting grounds or empirical data linked to it.`,
        recommendation:
          'Attach concrete observational data or empirical measurements to ground this assertion.',
      })
    }
  }

  // 2. Check for unbacked warrants
  for (const w of warrants) {
    const hasBacking = graph.edges.some((e) => e.target === w.id && e.relation === 'backs')
    if (!hasBacking) {
      vulnerabilities.push({
        nodeId: w.id,
        severity: 'moderate',
        issue: `Unbacked Warrant: "${w.text.slice(0, 40)}..." asserts an inferential leap without theoretical or empirical backing.`,
        recommendation:
          'Link an established scientific principle, theoretical backing, or meta-analysis.',
      })
    }
  }

  // 3. Check for unqualified claims / missing rebuttals (overconfidence vulnerability)
  if (claims.length > 0 && rebuttals.length === 0 && qualifiers.length === 0) {
    vulnerabilities.push({
      nodeId: graph.primaryClaimId,
      severity: 'moderate',
      issue:
        'Absence of Boundary Defeaters: The argument asserts unconditional certainty without qualifiers or rebuttal edge cases.',
      recommendation:
        'Incorporate counter-conditions or modal qualifiers (e.g., "under standard atmospheric conditions").',
    })
  }

  // Calculate Sub-metrics
  const groundingRatio = claims.length > 0 ? Math.min(1.0, grounds.length / claims.length) : 0
  const warrantBackingRatio =
    warrants.length > 0 ? Math.min(1.0, backings.length / warrants.length) : 0.5
  const rebuttalIntegrity = (rebuttals.length > 0 ? 0.6 : 0) + (qualifiers.length > 0 ? 0.4 : 0)

  // Composite Epistemic Rigor Score (0-100)
  let score = Math.round(
    groundingRatio * 35 +
      warrantBackingRatio * 25 +
      rebuttalIntegrity * 20 +
      (warrants.length > 0 ? 15 : 0) +
      (vulnerabilities.filter((v) => v.severity === 'critical').length === 0 ? 5 : 0),
  )
  score = Math.max(0, Math.min(100, score))

  if (grounds.length >= 2) {
    strengths.push(
      'Empirically grounded: Multiple independent grounds provide robust observational evidence.',
    )
  }
  if (backings.length > 0) {
    strengths.push('Theoretical depth: Warrants are anchored in established theoretical backings.')
  }
  if (rebuttals.length > 0) {
    strengths.push('Defeater-aware: The argument proactively acknowledges conditions of exception.')
  }

  const isBloomLevel6Synthesized = score >= 75 && rebuttals.length >= 1 && backings.length >= 1

  return {
    epistemicRigorScore: score,
    groundingRatio,
    warrantBackingRatio,
    rebuttalIntegrity,
    structuralVulnerabilities: vulnerabilities,
    strengths,
    isBloomLevel6Synthesized,
  }
}

// ─── 4. Automated Heuristic Fallacy Detector ────────────────────────────────

export interface DetectedFallacyMatch {
  fallacy: ExpandedFallacy
  matchedTextSnippet: string
  confidence: number // 0.0 to 1.0
  explanation: string
  pedagogicalRemedy: string
}

/**
 * Detects potential logical fallacies in argument text using syntactic markers,
 * trigger keywords, and heuristic pattern matching.
 */
export function detectArgumentFallacies(text: string): DetectedFallacyMatch[] {
  const matches: DetectedFallacyMatch[] = []
  const lower = text.toLowerCase()

  for (const def of Object.values(COMPREHENSIVE_FALLACY_CATALOG)) {
    for (const kw of def.detectionKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        const startIdx = lower.indexOf(kw.toLowerCase())
        const snippetStart = Math.max(0, startIdx - 15)
        const snippetEnd = Math.min(text.length, startIdx + kw.length + 30)
        const snippet = text.slice(snippetStart, snippetEnd).trim()

        matches.push({
          fallacy: def.key,
          matchedTextSnippet: `"...${snippet}..."`,
          confidence: 0.85,
          explanation: `${def.label}: ${def.description}`,
          pedagogicalRemedy: def.pedagogicalRemedy,
        })
        break // Match at most once per fallacy type
      }
    }
  }

  return matches
}

// ─── 5. Imre Lakatos Proofs & Refutations Heuristic Engine ─────────────────

export const lakatosTacticSchema = z.enum([
  'monster_barring', // Redefining definitions to exclude the counterexample as an illegitimate monster
  'exception_incorporation', // Narrowing the conjecture's boundary domain to explicitly exclude the exception
  'lemma_incorporation', // Unpacking the hidden lemma presupposed by the proof and embedding it into the theorem
  'heuristic_surrender', // Abandoning the conjecture entirely in light of a lethal global counterexample
])
export type LakatosTactic = z.infer<typeof lakatosTacticSchema>

export interface LakatosStep {
  stepIndex: number
  conjecture: string
  counterexample?: string
  chosenTactic?: LakatosTactic
  refinedConjecture?: string
  pedagogicalAnalysis: string
  epistemicGrowthAwardXp: number
}

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// above so import paths are unchanged.

/**
 * Evaluates a learner's Lakatosian dialectic move when challenged by a counterexample.
 */
export function evaluateLakatosMove(
  originalConjecture: string,
  counterexample: string,
  chosenTactic: LakatosTactic,
  learnerRefinement: string,
): { valid: boolean; score: number; feedback: string; awardedXp: number } {
  const words = (learnerRefinement.match(/\S+/g) ?? []).length
  const lower = learnerRefinement.toLowerCase()

  if (words < 8) {
    return {
      valid: false,
      score: 20,
      feedback:
        'Your refined formulation is too brief. Articulate how your chosen Lakatosian tactic resolves the counterexample.',
      awardedXp: 5,
    }
  }

  let tacticBonus = 0
  let feedback = ''

  switch (chosenTactic) {
    case 'lemma_incorporation':
      // Looks for conditions: provided, assumes, conditional on, lemma, premise
      if (/\b(provided|assuming|condition|premise|lemma|underlying|requires)\b/i.test(lower)) {
        tacticBonus = 40
        feedback =
          'Masterful Lemma-Incorporation! You identified the implicit lemma and made it an explicit condition in the theorem.'
      } else {
        tacticBonus = 20
        feedback =
          'Good attempt at Lemma-Incorporation. To maximize rigor, explicitly state which hidden assumption failed.'
      }
      break

    case 'exception_incorporation':
      // Looks for exception markers: except, unless, excluding, outside of
      if (/\b(except|unless|excluding|with the exception of|apart from)\b/i.test(lower)) {
        tacticBonus = 35
        feedback =
          'Excellent Exception-Incorporation! You delimited the boundary domain to protect the conjecture from the counterexample.'
      } else {
        tacticBonus = 18
        feedback =
          'Exception-Incorporation requires explicit boundary syntax (e.g. "except in cases where...").'
      }
      break

    case 'monster_barring':
      // Looks for definitional markers: by definition, strictly speaking, legitimate, not a true
      if (/\b(definition|strictly|qualify|proper|legitimate|true)\b/i.test(lower)) {
        tacticBonus = 25
        feedback =
          'Valid Monster-Barring: You refined the conceptual taxonomy to exclude pathological edge cases.'
      } else {
        tacticBonus = 12
        feedback =
          'Monster-Barring requires defining why the counterexample falls outside the legitimate scope of terms.'
      }
      break

    case 'heuristic_surrender':
      tacticBonus = 30
      feedback =
        'Sober epistemic honesty: You conceded the refutation and prepared the ground for a paradigm shift.'
      break
  }

  const score = Math.min(100, 40 + tacticBonus + Math.min(20, words * 0.8))
  const awardedXp = Math.round(score * 0.6)

  return {
    valid: score >= 60,
    score,
    feedback,
    awardedXp,
  }
}

// ─── 6. Bridge to Spaced Repetition (Toulmin to Flashcards) ─────────────────

export interface GeneratedToulminFlashcard {
  front: string
  back: string
  tags: string[]
  conceptId?: string
  mnemonicNote?: string
}

/**
 * Converts a synthesized Toulmin argument graph into high-yield spaced retrieval flashcards.
 * Uses Lakatosian and Toulmin schema prompts:
 * 1. Claim -> Grounds (Recall empirical foundation)
 * 2. Ground & Claim -> Warrant (Identify inferential bridge)
 * 3. Claim -> Rebuttal (Boundary exceptions)
 */
export function convertToulminToFlashcards(
  graph: ToulminArgumentGraph,
): GeneratedToulminFlashcard[] {
  const cards: GeneratedToulminFlashcard[] = []
  const claims = graph.nodes.filter((n) => n.type === 'claim')
  const grounds = graph.nodes.filter((n) => n.type === 'ground')
  const warrants = graph.nodes.filter((n) => n.type === 'warrant')
  const rebuttals = graph.nodes.filter((n) => n.type === 'rebuttal')

  for (const claim of claims) {
    // 1. Claim-Grounds Card
    if (grounds.length > 0) {
      cards.push({
        front: `[Toulmin Grounding] What empirical grounds or observational evidence support the claim: "${claim.text}"?`,
        back: grounds.map((g, i) => `${i + 1}. ${g.text}`).join('\n\n'),
        tags: [
          'toulmin',
          'dialectic',
          'empirical-grounding',
          graph.topic.toLowerCase().replace(/\s+/g, '-'),
        ],
        mnemonicNote: 'Recall observational measurements before evaluating theoretical claims.',
      })
    }

    // 2. Warrant Bridge Card
    if (warrants.length > 0) {
      cards.push({
        front: `[Toulmin Warrant] By what inferential principle or warrant can we move from grounds to the claim: "${claim.text}"?`,
        back: warrants.map((w, i) => `${i + 1}. ${w.text}`).join('\n\n'),
        tags: ['toulmin', 'warrant', 'inferential-bridge'],
        mnemonicNote: 'The warrant explains why the data justifies the conclusion.',
      })
    }

    // 3. Boundary Defeater Card
    if (rebuttals.length > 0) {
      cards.push({
        front: `[Toulmin Boundary] Under what conditions or exceptions ([Rebuttal]) does the claim "${claim.text}" break down?`,
        back: rebuttals.map((r, i) => `${i + 1}. ${r.text}`).join('\n\n'),
        tags: ['toulmin', 'rebuttal', 'boundary-conditions'],
        mnemonicNote: 'Mastery requires knowing where a theory fails as much as where it holds.',
      })
    }
  }

  return cards
}

// ─── 7. Preset High-Yield Socratic Dialectic Cases ──────────────────────────

export interface DeepDialecticCase {
  slug: string
  title: string
  domain: string
  description: string
  thesisAgent: {
    name: string
    role: string
    claim: string
  }
  antithesisAgent: {
    name: string
    role: string
    claim: string
  }
  plantedFallacies: Array<{
    turnId: string
    speaker: 'thesis' | 'antithesis'
    fallacy: ExpandedFallacy
    text: string
  }>
  lakatosChallenge: {
    primitiveConjecture: string
    counterexample: string
    targetLemmas: string[]
  }
  coreConcepts: string[]
  defaultGraph: ToulminArgumentGraph
}

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// above so import paths are unchanged.
