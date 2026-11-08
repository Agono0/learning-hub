/**
 * Learning HUB — Multi-Agent Dialectic Debate & Protégé Peer Engine.
 *
 * Implements:
 * 1. Dialectical Debate Arena (Bloom's Taxonomy Level 6: Evaluation & Critique).
 * 2. Logical fallacy detection and scoring (Straw man, Ad hominem, False dichotomy, etc.).
 * 3. Protégé Effect AI peer simulator (Chase et al. 2009; Kobayashi 2019).
 */
import { z } from 'zod'

export const logicalFallacySchema = z.enum([
  'straw_man',
  'ad_hominem',
  'false_dichotomy',
  'circular_reasoning',
  'appeal_to_authority',
  'slippery_slope',
])
export type LogicalFallacy = z.infer<typeof logicalFallacySchema>

export const debateTurnSchema = z.object({
  id: z.string().min(1),
  speaker: z.enum(['thesis_agent', 'antithesis_agent', 'human_judge']),
  speakerName: z.string(),
  argumentText: z.string().min(1),
  fallaciesFlagged: z.array(logicalFallacySchema).default([]),
  timestamp: z.string(),
})
export type DebateTurn = z.infer<typeof debateTurnSchema>

export const debateTopicSchema = z.object({
  topic: z.string().min(1),
  domain: z.string().default('General'),
  thesisRole: z.string(),
  thesisStatement: z.string(),
  antithesisRole: z.string(),
  antithesisStatement: z.string(),
  coreConcepts: z.array(z.string()).default([]),
})
export type DebateTopic = z.infer<typeof debateTopicSchema>

export interface FallacyEvaluationResult {
  correct: boolean
  fallacy: LogicalFallacy
  explanation: string
  awardedXp: number
}

/**
 * Standard fallacy definitions and detection keywords for Socratic grading.
 */
export const FALLACY_DEFINITIONS: Record<LogicalFallacy, { label: string; description: string }> = {
  straw_man: {
    label: 'Straw Man',
    description:
      'Misrepresenting or exaggerating the opponent’s argument to make it easier to attack.',
  },
  ad_hominem: {
    label: 'Ad Hominem',
    description:
      'Attacking the opponent’s character or motive rather than addressing the substance of the argument.',
  },
  false_dichotomy: {
    label: 'False Dilemma / Dichotomy',
    description:
      'Presenting only two extreme alternatives when nuanced intermediate options exist.',
  },
  circular_reasoning: {
    label: 'Circular Reasoning (Begging the Question)',
    description: 'The premise of the argument assumes the truth of the conclusion.',
  },
  appeal_to_authority: {
    label: 'Appeal to False Authority',
    description:
      'Claiming something is true solely because a prominent figure asserted it without supporting evidence.',
  },
  slippery_slope: {
    label: 'Slippery Slope',
    description:
      'Arguing without evidence that one small step will inevitably trigger a chain of disastrous events.',
  },
}

/**
 * Evaluates whether a learner correctly identified a fallacy within an agent's argument.
 */
export function evaluateFallacyFlag(
  argumentText: string,
  chosenFallacy: LogicalFallacy,
  plantedFallacies: LogicalFallacy[] = [],
): FallacyEvaluationResult {
  const isCorrect = plantedFallacies.includes(chosenFallacy)
  const meta = FALLACY_DEFINITIONS[chosenFallacy]

  if (isCorrect) {
    return {
      correct: true,
      fallacy: chosenFallacy,
      explanation: `Sharp eye! You accurately spotted ${meta.label}: ${meta.description}`,
      awardedXp: 35,
    }
  }

  return {
    correct: false,
    fallacy: chosenFallacy,
    explanation: `Not quite. ${meta.label} involves: ${meta.description}. Review the argument premises carefully.`,
    awardedXp: 5,
  }
}

// ─── Protégé AI Study Partner Simulation ────────────────────────────────────

export interface ProtegeState {
  name: string
  curiosityLevel: number // 0.0 to 1.0
  simulatedRetention: number // Decays over time
  misconceptionsRemaining: number
}

/**
 * Generates an inquiry from "Alex" (the simulated peer student) asking the learner
 * to teach or explain a concept (Feynman Protégé effect).
 */
export function generateProtegeInquiry(conceptTitle: string, userLevel: number): string {
  const prompts = [
    `Hey, I've been struggling to wrap my head around "${conceptTitle}". Could you explain the core mechanism to me in plain English?`,
    `I think I understand "${conceptTitle}", but I'm confused about when to use it over the alternatives. How do you decide?`,
    `If you had to teach "${conceptTitle}" to a high-schooler using an everyday analogy, how would you put it?`,
    `Wait, doesn't "${conceptTitle}" contradict what we learned earlier? Where does my intuition break down?`,
  ]
  // Any number in → a valid prompt (negative/fractional/NaN levels would index past the list).
  const level = Number.isFinite(userLevel) ? Math.abs(Math.trunc(userLevel)) : 0
  return prompts[level % prompts.length]!
}

// ─── Built-in case library (manual mode: works with AI provider `none`) ─────

/** A ready-to-judge debate: topic, two roles and turns with their planted fallacies. */
export interface DebateCase {
  /** Stable slug — the page offers cases by it. */
  slug: string
  topic: DebateTopic
  /** Turns in speaking order; `fallaciesFlagged` lists the fallacies planted in each. */
  turns: Array<Omit<DebateTurn, 'timestamp'>>
  /** What Alex (the protégé) asks the learner to explain after the debate. */
  protegeConcept: string
  /** Ideas a good explanation of {@link protegeConcept} mentions (rule-based feedback). */
  protegeKeyConcepts: string[]
}

/**
 * Hand-written cases whose fallacies are planted on purpose, one or two per turn, so
 * the learner's flag can be graded exactly without an AI. Additive: new cases may be
 * appended; existing slugs/turn ids are a stable contract (stored transcripts reference them).
 */
export const DEBATE_CASE_LIBRARY: readonly DebateCase[] = [
  {
    slug: 'monolith-vs-microservices',
    topic: {
      topic: 'Monolithic Architecture vs Distributed Microservices',
      domain: 'Software Engineering',
      thesisRole: 'Monolith Champion (Dr. Marcus)',
      thesisStatement: 'Early-stage products should ship as a single deployable monolith.',
      antithesisRole: 'Microservices Advocate (Elena V.)',
      antithesisStatement: 'Services should be split along domain boundaries from the start.',
      coreConcepts: ['latency', 'consistency', 'team', 'deploy', 'boundary', 'scale'],
    },
    turns: [
      {
        id: 'turn-1',
        speaker: 'thesis_agent',
        speakerName: 'Dr. Marcus (Thesis)',
        argumentText:
          'Monolithic systems eliminate distributed network latency and consistency nightmares. Anyone suggesting microservices for an early-stage product is either reckless or trying to resume-pad.',
        fallaciesFlagged: ['ad_hominem'],
      },
      {
        id: 'turn-2',
        speaker: 'antithesis_agent',
        speakerName: 'Elena V. (Antithesis)',
        argumentText:
          'That ignores organizational scaling. Either you decompose services cleanly across domain boundaries today, or the company will inevitably grind to a complete halt within a year.',
        fallaciesFlagged: ['false_dichotomy', 'slippery_slope'],
      },
    ],
    protegeConcept: 'distributed transactions in microservices',
    protegeKeyConcepts: ['saga', 'queue', 'eventual consistency', 'compensating', 'idempotent'],
  },
  {
    slug: 'phones-in-schools',
    topic: {
      topic: 'Should Smartphones Be Banned in Classrooms?',
      domain: 'Education',
      thesisRole: 'Ban Proponent (Mr. Okafor)',
      thesisStatement: 'Phones should be collected at the classroom door.',
      antithesisRole: 'Ban Opponent (Dr. Lindqvist)',
      antithesisStatement: 'Phones should be allowed under a clear use policy.',
      coreConcepts: ['attention', 'distraction', 'policy', 'learning', 'evidence', 'safety'],
    },
    turns: [
      {
        id: 'turn-1',
        speaker: 'thesis_agent',
        speakerName: 'Mr. Okafor (Thesis)',
        argumentText:
          'A famous tech CEO said he never lets his own kids use phones, so it is settled: phones harm learning and must be banned.',
        fallaciesFlagged: ['appeal_to_authority'],
      },
      {
        id: 'turn-2',
        speaker: 'antithesis_agent',
        speakerName: 'Dr. Lindqvist (Antithesis)',
        argumentText:
          'My opponent wants to lock children in a technology-free bunker and pretend the internet does not exist. That is absurd.',
        fallaciesFlagged: ['straw_man'],
      },
    ],
    protegeConcept: 'attention residue from notifications',
    protegeKeyConcepts: ['attention', 'switch', 'focus', 'notification', 'memory'],
  },
]

/** The library case with this slug, or undefined. */
export function getDebateCase(slug: string): DebateCase | undefined {
  return DEBATE_CASE_LIBRARY.find((c) => c.slug === slug)
}

/**
 * A case's turns as a storable transcript (timestamps stamped at `now`). The stored
 * `fallaciesFlagged` are the answer key the server grades flags against — the client
 * never supplies its own answer key.
 */
export function debateCaseTranscript(debateCase: DebateCase, now = new Date()): DebateTurn[] {
  const iso = now.toISOString()
  return debateCase.turns.map((t) => ({ ...t, timestamp: iso }))
}

/** The planted fallacies of one turn of a stored transcript ([] when the turn is unknown). */
export function plantedFallaciesForTurn(
  transcript: readonly Pick<DebateTurn, 'id' | 'fallaciesFlagged'>[],
  turnId: string,
): LogicalFallacy[] {
  return [...(transcript.find((t) => t.id === turnId)?.fallaciesFlagged ?? [])]
}

// ─── Rule-based feedback on free-text answers ───────────────────────────────

/** Lower-cased word stems a text mentions (crude stemming: strips common suffixes). */
function stems(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    // 'scaling'/'scale' → 'scal', 'boundaries'/'boundary' → 'boundari'
    out.add(
      w
        .replace(/(ations?|ing|ed|es|s)$/, '')
        .replace(/e$/, '')
        .replace(/y$/, 'i'),
    )
  }
  return out
}

/** Which of `concepts` a text touches (stem match), preserving the concepts' order. */
export function conceptCoverage(
  text: string,
  concepts: readonly string[],
): { covered: string[]; missing: string[]; ratio: number } {
  const have = stems(text)
  const covered: string[] = []
  const missing: string[] = []
  for (const c of concepts) {
    const cs = [...stems(c)]
    if (cs.length > 0 && cs.every((s) => have.has(s))) covered.push(c)
    else missing.push(c)
  }
  return { covered, missing, ratio: concepts.length ? covered.length / concepts.length : 0 }
}

/** Words that mark a conditional synthesis ("it depends when…") rather than a one-sided pick. */
const SYNTHESIS_MARKERS = /\b(when|if|unless|depends|trade-?offs?|whereas|while|until|because)\b/i

export interface VerdictAssessment {
  /** 0–100: concept coverage (70) + conditional synthesis (20) + substance (10). */
  score: number
  coveredConcepts: string[]
  missingConcepts: string[]
  isConditional: boolean
  feedback: string
}

/**
 * Scores a learner's closing ruling without an AI. A good Bloom-6 verdict names the
 * conditions under which each side wins, so it rewards (a) touching the case's core
 * concepts, (b) conditional language, (c) enough substance (≥ 25 words). It is a
 * coarse heuristic and says so in its feedback — never a claim of deep grading.
 */
export function assessDebateVerdict(
  verdict: string,
  coreConcepts: readonly string[],
): VerdictAssessment {
  const { covered, missing, ratio } = conceptCoverage(verdict, coreConcepts)
  const isConditional = SYNTHESIS_MARKERS.test(verdict)
  const words = (verdict.match(/\S+/g) ?? []).length
  const score = Math.round(ratio * 70 + (isConditional ? 20 : 0) + Math.min(1, words / 25) * 10)
  const parts: string[] = []
  if (!isConditional)
    parts.push('State the conditions under which each side is right ("when…", "if…").')
  if (missing.length) parts.push(`Consider also: ${missing.join(', ')}.`)
  if (words < 25) parts.push('Add a sentence of justification.')
  return {
    score,
    coveredConcepts: covered,
    missingConcepts: missing,
    isConditional,
    feedback: parts.length
      ? `Rule-based check (not AI grading): ${parts.join(' ')}`
      : 'Rule-based check (not AI grading): a conditional, well-grounded synthesis.',
  }
}

export interface ProtegeResponse {
  /** Alex's reply — a follow-up question when the explanation has gaps. */
  reply: string
  coverage: number
  missingConcepts: string[]
  /** True when the explanation covers ≥ 60 % of the concepts with ≥ 30 words. */
  understood: boolean
}

/**
 * Alex's reaction to an explanation (Protégé effect, Chase et al. 2009). Rule-based
 * so it works offline: if key concepts are missing, Alex asks about the first one
 * rather than pretending to understand — honest feedback is the point.
 */
export function respondAsProtege(
  explanation: string,
  conceptTitle: string,
  keyConcepts: readonly string[],
): ProtegeResponse {
  const { missing, ratio } = conceptCoverage(explanation, keyConcepts)
  const words = (explanation.match(/\S+/g) ?? []).length
  const understood = ratio >= 0.6 && words >= 30
  let reply: string
  if (understood) {
    reply = `Okay, I think I get "${conceptTitle}" now. Could you give me one concrete example to check myself?`
  } else if (missing.length > 0) {
    reply = `Thanks! I'm still unsure how "${missing[0]}" fits into ${conceptTitle}. Can you explain that part?`
  } else {
    reply = `That's a start — can you walk me through it step by step, in a bit more detail?`
  }
  return { reply, coverage: Math.round(ratio * 100) / 100, missingConcepts: missing, understood }
}
