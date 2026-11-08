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
  return prompts[userLevel % prompts.length]
}
