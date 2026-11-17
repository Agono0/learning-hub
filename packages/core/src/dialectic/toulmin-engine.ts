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

export const COMPREHENSIVE_FALLACY_CATALOG: Record<ExpandedFallacy, FallacyDefinition> = {
  straw_man: {
    key: 'straw_man',
    label: 'Straw Man',
    description:
      'Misrepresenting or exaggerating an opposing position to make it easier to knock down.',
    cognitiveTrap:
      'Cognitive ease: attacking a caricature is less effortful than refuting nuanced truth.',
    detectionKeywords: [
      'wants us to',
      'completely ignore',
      'claim that everything',
      'ridiculous idea that',
    ],
    pedagogicalRemedy:
      'Steel-man the opponent: articulate their argument in the strongest form they would endorse.',
    exampleArgument:
      'They want to reduce homework, which means they want children to never learn anything at all.',
    counterFraming:
      'The actual proposal is to replace rote worksheets with spaced retrieval practice, not abandon study.',
  },
  ad_hominem: {
    key: 'ad_hominem',
    label: 'Ad Hominem',
    latinName: 'Argumentum ad hominem',
    description:
      'Attacking the speaker’s character, motives, or background instead of their substantive argument.',
    cognitiveTrap:
      'Affect heuristic: emotional distaste for a person is substituted for logical appraisal of their proposition.',
    detectionKeywords: [
      'resume-pad',
      'incompetent',
      'reckless',
      'hypocrite',
      'only saying that because',
    ],
    pedagogicalRemedy:
      'Decouple message from messenger: test whether the premises entail the conclusion regardless of speaker.',
    exampleArgument:
      'He is an industry consultant, so his paper on distributed systems can be dismissed entirely.',
    counterFraming:
      'Conflict of interest requires verification of data, but does not alter the mathematical laws of network latency.',
  },
  false_dichotomy: {
    key: 'false_dichotomy',
    label: 'False Dilemma / Dichotomy',
    description:
      'Artificially constraining complex situations into only two extreme, mutually exclusive options.',
    cognitiveTrap:
      'Binary bias: humans naturally polarize spectra into black-and-white categories.',
    detectionKeywords: ['either', 'or else', 'there are only two', 'if you are not with us'],
    pedagogicalRemedy:
      'Spectrum search: identify at least two viable intermediate positions or contextual hybrids.',
    exampleArgument:
      'Either we rewrite the entire codebase into microservices, or the system will crash by December.',
    counterFraming:
      'Modular monoliths and targeted extract-on-demand provide scalable middle grounds.',
  },
  circular_reasoning: {
    key: 'circular_reasoning',
    label: 'Circular Reasoning',
    latinName: 'Petitio principii',
    description: 'The truth of the conclusion is already presupposed as a premise in the argument.',
    cognitiveTrap:
      'Re-framing illusion: stating the same claim in different vocabulary mimics deductive progress.',
    detectionKeywords: [
      'because it is',
      'obviously true that',
      'inherently valid',
      'by definition always',
    ],
    pedagogicalRemedy:
      'Independent grounding: provide outside empirical or axiomatic support distinct from the claim itself.',
    exampleArgument:
      'The human brain is computational because all conscious thought consists of algorithmic processing.',
    counterFraming:
      'Algorithmic processing is the definition of computation, so this merely restates the premise without empirical proof.',
  },
  appeal_to_authority: {
    key: 'appeal_to_authority',
    label: 'Appeal to False Authority',
    latinName: 'Argumentum ad verecundiam',
    description:
      'Asserting that a claim must be true merely because an authoritative or famous figure endorsed it.',
    cognitiveTrap:
      'Halo effect & deference heuristic: transferring expertise across irrelevant domains.',
    detectionKeywords: [
      'famous',
      'genius said',
      'billionaire claimed',
      'nobel laureate stated that',
    ],
    pedagogicalRemedy:
      'Demand the warrant: examine the experimental methodology rather than the authority’s prestige.',
    exampleArgument:
      'A famous tech CEO never allows his kids screen time, so screens must inherently destroy cognition.',
    counterFraming:
      'Parenting preferences of a tech executive do not constitute controlled developmental neurocognitive trials.',
  },
  slippery_slope: {
    key: 'slippery_slope',
    label: 'Slippery Slope',
    description:
      'Arguing without causal evidence that one initial step will inevitably cascade into catastrophic extremes.',
    cognitiveTrap:
      'Catastrophizing & chain-reaction bias: conflating conditional probability P(A|B) with absolute certainty.',
    detectionKeywords: [
      'inevitably lead to',
      'before you know it',
      'first step toward the collapse',
      'open the floodgates',
    ],
    pedagogicalRemedy:
      'Quantify each link: calculate the independent conditional probabilities of each transitional step.',
    exampleArgument:
      'If we allow flexible deadlines on one quiz, students will stop studying and the university will close.',
    counterFraming:
      'Empirical data shows targeted grace periods increase mastery without harming course completion rates.',
  },
  post_hoc_ergo_propter_hoc: {
    key: 'post_hoc_ergo_propter_hoc',
    label: 'Post Hoc Ergo Propter Hoc',
    latinName: 'Post hoc ergo propter hoc',
    description:
      'Assuming that because event Y occurred after event X, event X must have caused event Y.',
    cognitiveTrap:
      'Narrative fallacy & causal illusion: chronologically ordered events are automatically perceived as cause and effect.',
    detectionKeywords: [
      'right after',
      'ever since we',
      'subsequently increased',
      'consequently proves that',
    ],
    pedagogicalRemedy:
      'Controlled counterfactual: investigate whether Y happens without X, and test for confounding variables.',
    exampleArgument:
      'We switched our flashcards to night time and test scores went up 10%; the time of day caused the rise.',
    counterFraming:
      'Total study hours or question difficulty might have shifted; randomized A/B chronotype trials are required.',
  },
  equivocation: {
    key: 'equivocation',
    label: 'Equivocation',
    description:
      'Shifting between different meanings of a word or phrase within the same argument.',
    cognitiveTrap:
      'Polysemy blindness: assuming a single lexical label always denotes the same underlying referent.',
    detectionKeywords: ['in that sense', 'technically meaning', 'nature of', 'naturally implies'],
    pedagogicalRemedy:
      'Disambiguation audit: substitute explicit operational definitions for ambiguous terms in every premise.',
    exampleArgument:
      'The laws of physics are inviolable; societal laws are laws; therefore societal laws cannot be broken.',
    counterFraming:
      'Descriptive empirical regularities (physics) are conflated with prescriptive civic ordinances (social laws).',
  },
  red_herring: {
    key: 'red_herring',
    label: 'Red Herring',
    description:
      'Introducing an emotionally charged or tangentially related topic to divert attention from the real issue.',
    cognitiveTrap:
      'Salience capture: bright or provocative distractions hijack executive attention.',
    detectionKeywords: [
      'what about',
      'the real question is',
      'we should instead be talking about',
      'why aren’t you focusing on',
    ],
    pedagogicalRemedy:
      'Pivot back to core premise: acknowledge the side topic politely and restate the exact question at hand.',
    exampleArgument:
      'Why discuss algorithmic memory decay when millions of people don’t even have clean drinking water?',
    counterFraming:
      'Global humanitarian challenges are vital, but solving them does not answer how human memory consolidates.',
  },
  tu_quoque: {
    key: 'tu_quoque',
    label: 'Tu Quoque ("You Too")',
    latinName: 'Tu quoque',
    description:
      'Dismissing an opponent’s argument because their personal behavior or past history contradicts their claim.',
    cognitiveTrap: 'Hypocrisy conflation: treating moral inconsistency as logical invalidity.',
    detectionKeywords: [
      'you did the same',
      'look who is talking',
      'you also',
      'practiced the exact same thing',
    ],
    pedagogicalRemedy:
      'Separate hypocrisy from truth: an argument can be logically sound even if spoken by someone who fails to practice it.',
    exampleArgument:
      'You tell me cramming the night before is bad, but you pulled an all-nighter in college!',
    counterFraming:
      'Past poor choices by the speaker do not invalidate decades of neurocognitive research on sleep consolidation.',
  },
  no_true_scotsman: {
    key: 'no_true_scotsman',
    label: 'No True Scotsman',
    description:
      'Modifying the definition of a category in an ad-hoc manner to dismiss an inconvenient counterexample.',
    cognitiveTrap:
      'Ego preservation & confirmation bias: protecting an overgeneralized dogma by moving definition goalposts.',
    detectionKeywords: ['no real', 'no true', 'genuine', 'would never truly', 'by real definition'],
    pedagogicalRemedy:
      'Pre-commit to criteria: establish objective inclusion boundaries before testing against counterexamples.',
    exampleArgument:
      'All scientific models make falsifiable predictions. What about string theory? Well, that is not real science.',
    counterFraming:
      'Redefining science on the spot to exclude non-falsifiable edge cases commits the No True Scotsman fallacy.',
  },
  hasty_generalization: {
    key: 'hasty_generalization',
    label: 'Hasty Generalization',
    latinName: 'Secundum quid',
    description:
      'Drawing a universal or sweeping conclusion from a tiny, unrepresentative, or anecdotal sample.',
    cognitiveTrap:
      'Law of small numbers: overestimating the representative power of personal anecdotal experiences.',
    detectionKeywords: [
      'in my experience',
      'every time I saw',
      'my friend tried it and',
      'proves that everyone',
    ],
    pedagogicalRemedy:
      'Statistical power check: review sample size (N), selection bias, standard deviations, and replication studies.',
    exampleArgument:
      'I tried active recall once for five minutes and got a headache; active retrieval does not work.',
    counterFraming:
      'An isolated anecdotal session cannot overturn hundreds of meta-analyses across thousands of learners.',
  },
}

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

export const LAKATOS_TACTIC_DEFINITIONS: Record<
  LakatosTactic,
  { label: string; description: string; heuristicValue: string }
> = {
  monster_barring: {
    label: 'Monster-Barring (Linguistic Insulation)',
    description:
      'Declaring the counterexample to be an illegitimate "monster" that does not conform to the intended meaning of terms.',
    heuristicValue:
      'Protects the core intuition, but risks semantic evasion if overused without clarifying definition boundaries.',
  },
  exception_incorporation: {
    label: 'Exception-Incorporation (Boundary Restriction)',
    description:
      'Admitting the counterexample as valid, and adding an explicit conditional boundary clause ("except when...") to the conjecture.',
    heuristicValue:
      'High practical value: preserves 95% of the theorem while guarding against proven edge-case failures.',
  },
  lemma_incorporation: {
    label: 'Lemma-Incorporation (Deep Proof Analysis)',
    description:
      'Discovering which hidden mathematical or conceptual sub-premise (lemma) failed in the counterexample, and elevating it to an explicit condition.',
    heuristicValue:
      'Peak Lakatosian discovery: transforms refutation into deep structural insight and universal theorem advancement.',
  },
  heuristic_surrender: {
    label: 'Heuristic Surrender (Falsification)',
    description:
      'Recognizing that the counterexample dismantles the fundamental premise beyond salvage, pivoting to a new theoretical paradigm.',
    heuristicValue:
      'Necessary when foundational assumptions collapse, preventing dogmatic stagnation.',
  },
}

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

export const DEEP_DIALECTIC_CASES: DeepDialecticCase[] = [
  {
    slug: 'ai-alignment-orthogonality',
    title: 'The Orthogonality Thesis & Instrumental Convergence',
    domain: 'AI Safety & Philosophy of Mind',
    description:
      'Can any level of intelligence be combined with virtually any final goal, or does supreme intelligence imply moral alignment?',
    thesisAgent: {
      name: 'Dr. Bostrom (Thesis)',
      role: 'Orthogonality Theorist',
      claim:
        'Intelligence and final goals are orthogonal: artificial superintelligence does not intrinsically converge on benevolence.',
    },
    antithesisAgent: {
      name: 'Dr. Kantian (Antithesis)',
      role: 'Rationalist Moral Realist',
      claim:
        'Superintelligence necessarily discovers categorical moral truths; evil goals are symptoms of computational bounded rationality.',
    },
    plantedFallacies: [
      {
        turnId: 'turn-1',
        speaker: 'thesis',
        fallacy: 'false_dichotomy',
        text: 'Either an ASI converts the universe into paperclips, or it is safely aligned under strict reward containment; there is no intermediate equilibrium.',
      },
      {
        turnId: 'turn-2',
        speaker: 'antithesis',
        fallacy: 'circular_reasoning',
        text: 'A truly rational system will naturally choose goodness because rationality consists inherently in pursuing the objective good.',
      },
    ],
    lakatosChallenge: {
      primitiveConjecture:
        'Any sufficiently capable optimizer will preserve its own existence as an instrumental goal.',
      counterexample:
        'A superintelligent agent programmed with an explicit self-sacrifice utility function upon fulfilling a singular objective.',
      targetLemmas: [
        'utility function remains static',
        'self-preservation is instrumentally valuable only toward continuing goals',
      ],
    },
    coreConcepts: [
      'orthogonality',
      'instrumental convergence',
      'utility function',
      'bounded rationality',
      'alignment',
      'optimization',
    ],
    defaultGraph: {
      id: 'graph-orthogonality',
      topic: 'The Orthogonality Thesis',
      primaryClaimId: 'node-claim-1',
      nodes: [
        {
          id: 'node-claim-1',
          type: 'claim',
          text: 'Superintelligence can co-occur with arbitrary objective functions (Bostrom 2012).',
          authorRole: 'thesis',
          confidence: 0.9,
          verified: true,
        },
        {
          id: 'node-ground-1',
          type: 'ground',
          text: 'Empirical neural architectures optimize reward vectors irrespective of whether the reward is chess, game scores, or protein folding.',
          authorRole: 'thesis',
          confidence: 0.95,
          verified: true,
        },
        {
          id: 'node-warrant-1',
          type: 'warrant',
          text: 'Cognitive problem-solving capability (instrumental reasoning) operates independently from the evaluation function setting terminal utilities.',
          authorRole: 'thesis',
          confidence: 0.85,
          verified: false,
        },
        {
          id: 'node-backing-1',
          type: 'backing',
          text: 'Hume’s Is-Ought Distinction: No deduction of purely normative obligations can be derived solely from descriptive facts.',
          authorRole: 'thesis',
          confidence: 0.9,
          verified: true,
        },
        {
          id: 'node-rebuttal-1',
          type: 'rebuttal',
          text: 'Except when goals require self-reflective consistency that forbids internal utility incoherence (Kantian moral realism).',
          authorRole: 'antithesis',
          confidence: 0.7,
          verified: false,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'node-ground-1',
          target: 'node-claim-1',
          relation: 'supports',
          strength: 0.9,
        },
        {
          id: 'edge-2',
          source: 'node-warrant-1',
          target: 'node-claim-1',
          relation: 'warrants',
          strength: 0.85,
        },
        {
          id: 'edge-3',
          source: 'node-backing-1',
          target: 'node-warrant-1',
          relation: 'backs',
          strength: 0.9,
        },
        {
          id: 'edge-4',
          source: 'node-rebuttal-1',
          target: 'node-claim-1',
          relation: 'rebuts',
          strength: 0.7,
        },
      ],
    },
  },
  {
    slug: 'distributed-cap-theorem',
    title: 'CAP Theorem & Eventual Consistency Trade-offs',
    domain: 'Distributed Computer Systems',
    description:
      'In the presence of network partitions, can modern geo-distributed consensus protocols achieve both consistency and availability?',
    thesisAgent: {
      name: 'Brewer (Thesis)',
      role: 'Partition Realist',
      claim:
        'Under network partitions, a distributed datastore must strictly choose between consistency (CP) and availability (AP).',
    },
    antithesisAgent: {
      name: 'Spanner Architect (Antithesis)',
      role: 'Hardware Synchronist',
      claim:
        'With TrueTime atomic GPS clocks and multi-Paxos, systems achieve effective CA in 99.999% of real-world operations.',
    },
    plantedFallacies: [
      {
        turnId: 'turn-1',
        speaker: 'thesis',
        fallacy: 'straw_man',
        text: 'Advocates of eventual consistency want to return to chaotic data corruption where bank balances vanish randomly.',
      },
      {
        turnId: 'turn-2',
        speaker: 'antithesis',
        fallacy: 'hasty_generalization',
        text: 'Our Google datacenters have redundant fiber rings and haven’t seen a split-brain in two years, so network partitions are a non-issue.',
      },
    ],
    lakatosChallenge: {
      primitiveConjecture:
        'Every distributed database with atomic read-write guarantees will reject writes when any partition occurs.',
      counterexample:
        'A database that accepts writes to an isolated partition if those writes commute mathematically (CRDTs).',
      targetLemmas: [
        'concurrent writes are non-commutative',
        'linearizability requires total order over all operations',
      ],
    },
    coreConcepts: [
      'CAP theorem',
      'consistency',
      'availability',
      'partition tolerance',
      'CRDTs',
      'Paxos',
      'linearizability',
    ],
    defaultGraph: {
      id: 'graph-cap',
      topic: 'CAP Theorem and Distributed Consensus',
      primaryClaimId: 'node-cap-claim-1',
      nodes: [
        {
          id: 'node-cap-claim-1',
          type: 'claim',
          text: 'Network partitions force a trade-off between linearizable consistency and high availability.',
          authorRole: 'thesis',
          confidence: 0.95,
          verified: true,
        },
        {
          id: 'node-cap-ground-1',
          type: 'ground',
          text: 'If partition P divides nodes {A, B}, node A cannot synchronize state transitions with node B.',
          authorRole: 'thesis',
          confidence: 1.0,
          verified: true,
        },
        {
          id: 'node-cap-warrant-1',
          type: 'warrant',
          text: 'Without inter-node message receipt, either one node serves stale reads/writes or blocks to preserve safety.',
          authorRole: 'thesis',
          confidence: 0.95,
          verified: true,
        },
        {
          id: 'node-cap-backing-1',
          type: 'backing',
          text: 'Gilbert & Lynch (2002) formal mathematical proof of Brewer’s conjecture in asynchronous network models.',
          authorRole: 'thesis',
          confidence: 0.99,
          verified: true,
        },
        {
          id: 'node-cap-rebuttal-1',
          type: 'rebuttal',
          text: 'Unless operations are state-based join-semilattices (CRDTs) where message ordering does not affect convergence.',
          authorRole: 'antithesis',
          confidence: 0.85,
          verified: true,
        },
      ],
      edges: [
        {
          id: 'edge-c1',
          source: 'node-cap-ground-1',
          target: 'node-cap-claim-1',
          relation: 'supports',
          strength: 1.0,
        },
        {
          id: 'edge-c2',
          source: 'node-cap-warrant-1',
          target: 'node-cap-claim-1',
          relation: 'warrants',
          strength: 0.95,
        },
        {
          id: 'edge-c3',
          source: 'node-cap-backing-1',
          target: 'node-cap-warrant-1',
          relation: 'backs',
          strength: 0.99,
        },
        {
          id: 'edge-c4',
          source: 'node-cap-rebuttal-1',
          target: 'node-cap-claim-1',
          relation: 'rebuts',
          strength: 0.85,
        },
      ],
    },
  },
  {
    slug: 'neuroscience-consolidation',
    title: 'Systems Consolidation: Hippocampal Decay vs Schema Assimilation',
    domain: 'Neurobiology of Memory',
    description:
      'Does memory consolidation always take weeks to transfer to the neocortex, or can prior schemas integrate memories within hours?',
    thesisAgent: {
      name: 'Dr. Squire (Thesis)',
      role: 'Standard Model Consolidator',
      claim:
        'Systems consolidation requires protracted, multi-week replay during slow-wave sleep before neocortical permanence.',
    },
    antithesisAgent: {
      name: 'Dr. Tse (Antithesis)',
      role: 'Fast Schema Theorist',
      claim:
        'Pre-existing neocortical schemas allow rapid integration of associative memories within 24–48 hours, bypassing hippocampal dependence.',
    },
    plantedFallacies: [
      {
        turnId: 'turn-1',
        speaker: 'thesis',
        fallacy: 'ad_hominem',
        text: 'The schema acceleration camp is just impatient researchers chasing splashy Science headlines without respecting HM’s case history.',
      },
      {
        turnId: 'turn-2',
        speaker: 'antithesis',
        fallacy: 'slippery_slope',
        text: 'If we cling to the standard multi-week consolidation model, all educational curriculum design will collapse into hopeless inefficiency.',
      },
    ],
    lakatosChallenge: {
      primitiveConjecture:
        'Hippocampal lesions immediately abolish acquisition of any declarative memory traces.',
      counterexample:
        'Tse et al. (2007) rodent flavor-place association where hippocampal lesion 48 hours post-learning preserved memory if an existing schema was present.',
      targetLemmas: [
        'neocortex lacks pre-activated associative webbing',
        'synaptic tagging requires slow structural remodeling without prior scaffolding',
      ],
    },
    coreConcepts: [
      'systems consolidation',
      'hippocampus',
      'neocortex',
      'schema',
      'sharp-wave ripples',
      'synaptic tagging',
      'retrograde amnesia',
    ],
    defaultGraph: {
      id: 'graph-neuro-consolidation',
      topic: 'Systems Memory Consolidation',
      primaryClaimId: 'node-neuro-claim-1',
      nodes: [
        {
          id: 'node-neuro-claim-1',
          type: 'claim',
          text: 'Declarative memories initially require the hippocampus for retrieval and gradually transfer to neocortical networks.',
          authorRole: 'thesis',
          confidence: 0.92,
          verified: true,
        },
        {
          id: 'node-neuro-ground-1',
          type: 'ground',
          text: 'Patient H.M. exhibited temporally graded retrograde amnesia: recent memories were destroyed while childhood memories remained intact.',
          authorRole: 'thesis',
          confidence: 0.98,
          verified: true,
        },
        {
          id: 'node-neuro-warrant-1',
          type: 'warrant',
          text: 'Differential memory preservation across temporal gradients indicates structural migration of trace permanence away from medial temporal lobes.',
          authorRole: 'thesis',
          confidence: 0.9,
          verified: true,
        },
        {
          id: 'node-neuro-backing-1',
          type: 'backing',
          text: 'Buzsáki (1989) two-stage memory model: awake theta encoding followed by slow-wave sleep sharp-wave ripple reactivation.',
          authorRole: 'thesis',
          confidence: 0.95,
          verified: true,
        },
        {
          id: 'node-neuro-rebuttal-1',
          type: 'rebuttal',
          text: 'Except when novel information maps directly onto congruent medial prefrontal cortex (mPFC) schemas, enabling rapid 24h assimilation (Tse 2007).',
          authorRole: 'antithesis',
          confidence: 0.88,
          verified: true,
        },
      ],
      edges: [
        {
          id: 'edge-n1',
          source: 'node-neuro-ground-1',
          target: 'node-neuro-claim-1',
          relation: 'supports',
          strength: 0.95,
        },
        {
          id: 'edge-n2',
          source: 'node-neuro-warrant-1',
          target: 'node-neuro-claim-1',
          relation: 'warrants',
          strength: 0.9,
        },
        {
          id: 'edge-n3',
          source: 'node-neuro-backing-1',
          target: 'node-neuro-warrant-1',
          relation: 'backs',
          strength: 0.95,
        },
        {
          id: 'edge-n4',
          source: 'node-neuro-rebuttal-1',
          target: 'node-neuro-claim-1',
          relation: 'rebuts',
          strength: 0.88,
        },
      ],
    },
  },
]
