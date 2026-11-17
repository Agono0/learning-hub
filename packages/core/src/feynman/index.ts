/**
 * @fileoverview Feynman Teach-Back Simplification & Socratic Reflection Engine.
 * Grounded in:
 * - Rozenblit, L., & Keil, F. (2002). The misunderstood limits of folk science: An illusion of explanatory depth. Cognitive Science, 26(5), 521-562.
 * - Kincaid, J. P., et al. (1975). Derivation of new readability formulas for Navy enlisted personnel. Research Branch Report 8-75.
 * - Lakoff, G., & Johnson, M. (1980). Metaphors We Live By. University of Chicago Press.
 * - Chi, M. T., et al. (1989). Self-explanations: How students study and use examples in learning to solve problems. Cognitive Science, 13(2), 145-182.
 */

import { z } from 'zod'

export const feynmanEvaluationInputSchema = z.object({
  concept: z.string().min(1, 'Concept name is required'),
  explanation: z.string().min(1, 'Explanation text is required'),
  initialConfidence: z.number().min(1).max(5).default(4), // 1 (clueless) to 5 (expert)
})

export type FeynmanEvaluationInput = z.infer<typeof feynmanEvaluationInputSchema>

export const socraticProbeSchema = z.object({
  id: z.string(),
  type: z.enum(['clarify_jargon', 'causal_mechanism', 'concrete_analogy', 'counter_example']),
  prompt: z.string(),
  targetTerm: z.string().optional(),
})

export type SocraticProbe = z.infer<typeof socraticProbeSchema>

export const gapCardCandidateSchema = z.object({
  front: z.string(),
  back: z.string(),
  reason: z.string(),
  tags: z.array(z.string()),
})

export type GapCardCandidate = z.infer<typeof gapCardCandidateSchema>

export const feynmanDiagnosticReportSchema = z.object({
  concept: z.string(),
  wordCount: z.number(),
  sentenceCount: z.number(),
  syllableCount: z.number(),
  fleschReadingEase: z.number(), // 0 to 100+
  fleschKincaidGradeLevel: z.number(), // e.g. 6.2 (grade level)
  isTwelveYearOldAccessible: z.boolean(), // Grade level <= 7.5 or Ease >= 65
  jargonTerms: z.array(z.string()),
  jargonDensity: z.number(), // percentage 0 to 100
  causalMarkerCount: z.number(),
  causalDensity: z.number(), // markers per sentence
  explanatoryDepthScore: z.number(), // 0 to 100 composite
  initialConfidence: z.number(),
  ioedGap: z.number(), // Illusion of Explanatory Depth gap
  socraticProbes: z.array(socraticProbeSchema),
  suggestedGapCards: z.array(gapCardCandidateSchema),
  summaryVerdict: z.enum(['mastery_clarity', 'jargon_heavy', 'illusion_of_depth', 'rudimentary']),
})

export type FeynmanDiagnosticReport = z.infer<typeof feynmanDiagnosticReportSchema>

/** Common non-jargon stop words and plain vocabulary to ignore when extracting jargon */
const COMMON_PLAIN_WORDS = new Set([
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
  'it',
  'for',
  'not',
  'on',
  'with',
  'he',
  'as',
  'you',
  'do',
  'at',
  'this',
  'but',
  'his',
  'by',
  'from',
  'they',
  'we',
  'say',
  'her',
  'she',
  'or',
  'an',
  'will',
  'my',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'so',
  'up',
  'out',
  'if',
  'about',
  'who',
  'get',
  'which',
  'go',
  'me',
  'when',
  'make',
  'can',
  'like',
  'time',
  'no',
  'just',
  'him',
  'know',
  'understand',
  'remember',
  'everything',
  'together',
  'take',
  'people',
  'into',
  'year',
  'your',
  'good',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'two',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'new',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'us',
  'is',
  'are',
  'was',
  'were',
  'been',
  'being',
  'has',
  'had',
  'does',
  'did',
  'doing',
  'simple',
  'explain',
  'water',
  'thing',
  'things',
  'flow',
  'part',
  'parts',
  'start',
  'starts',
  'inside',
  'outside',
  'small',
  'large',
  'big',
  'change',
  'changes',
])

/** Causal connective markers (Rozenblit & Keil 2002) */
const CAUSAL_CONNECTORS = [
  'because',
  'causes',
  'caused',
  'causing',
  'leads to',
  'led to',
  'as a result',
  'therefore',
  'consequently',
  'triggers',
  'produces',
  'depends on',
  'since',
  'so that',
  'in order to',
  'mechanically',
  'which means that',
]

/**
 * Estimate the number of syllables in an English word using phonetic heuristics.
 */
export function estimateSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!clean) return 0
  if (clean.length <= 3) return 1

  // Handle common prefixes and suffixes
  const processed = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '').replace(/^y/, '')

  const matches = processed.match(/[aeiouy]{1,2}/g)
  const syllables = matches ? matches.length : 1
  return Math.max(1, syllables)
}

/**
 * Count total sentences, ignoring common abbreviations.
 */
export function countSentences(text: string): number {
  const sanitized = text.replace(/(?:e\.g\.|i\.e\.|etc\.|vs\.|dr\.|mr\.|ms\.)/gi, 'abbr').trim()
  const rawSentences = sanitized
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return Math.max(1, rawSentences.length)
}

/**
 * Extract words from text.
 */
export function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim().replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 0)
}

/**
 * Compute Flesch-Kincaid Reading Ease and Grade Level.
 * - Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 * - Grade Level: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
 */
export function computeReadability(text: string): {
  words: number
  sentences: number
  syllables: number
  readingEase: number
  gradeLevel: number
} {
  const wordsList = extractWords(text)
  const words = Math.max(1, wordsList.length)
  const sentences = countSentences(text)
  const syllables = wordsList.reduce((acc, w) => acc + estimateSyllables(w), 0)

  const wordsPerSentence = words / sentences
  const syllablesPerWord = syllables / words

  const readingEase =
    Math.round(
      Math.max(0, Math.min(100, 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord)) * 10,
    ) / 10

  const gradeLevel =
    Math.round(
      Math.max(1, Math.min(18, 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59)) * 10,
    ) / 10

  return {
    words,
    sentences,
    syllables,
    readingEase,
    gradeLevel,
  }
}

/**
 * Detect domain jargon or complex terms (3+ syllables not in common plain words).
 */
export function extractJargon(text: string): { terms: string[]; density: number } {
  const words = extractWords(text)
  if (words.length === 0) return { terms: [], density: 0 }

  const detected = new Set<string>()
  for (const w of words) {
    if (COMMON_PLAIN_WORDS.has(w)) continue
    if (w.length >= 7 && estimateSyllables(w) >= 3) {
      detected.add(w)
    }
  }

  const terms = Array.from(detected).slice(0, 10)
  const density = Math.round((terms.length / words.length) * 100 * 10) / 10

  return {
    terms,
    density,
  }
}

/**
 * Count causal connector occurrences.
 */
export function countCausalMarkers(text: string): { count: number; density: number } {
  const lower = text.toLowerCase()
  let count = 0
  for (const marker of CAUSAL_CONNECTORS) {
    const regex = new RegExp(`\\b${marker}\\b`, 'gi')
    const matches = lower.match(regex)
    if (matches) count += matches.length
  }
  const sentences = countSentences(text)
  const density = Math.round((count / sentences) * 100) / 100

  return {
    count,
    density,
  }
}

/**
 * Compute the Rozenblit & Keil (2002) Explanatory Depth Score and IOED Gap.
 */
export function evaluateFeynmanExplanation(input: FeynmanEvaluationInput): FeynmanDiagnosticReport {
  const { concept, explanation, initialConfidence } = feynmanEvaluationInputSchema.parse(input)

  const readability = computeReadability(explanation)
  const jargon = extractJargon(explanation)
  const causal = countCausalMarkers(explanation)

  // 12-Year-Old target: Grade Level <= 7.5 or Reading Ease >= 65
  const isTwelveYearOldAccessible = readability.gradeLevel <= 7.5 || readability.readingEase >= 65

  // Calculate Explanatory Depth Score (0 to 100):
  // 1. Accessibility bonus: up to 40 pts (Ease / 100 * 40)
  // 2. Causal mechanism score: up to 35 pts (min(causal.density, 0.8) / 0.8 * 35)
  // 3. Completeness length: up to 25 pts (min(readability.words, 40) / 40 * 25)
  // 4. Jargon penalty: minus up to 20 pts (jargon.density * 1.5)
  const easePts = (readability.readingEase / 100) * 40
  const causalPts = (Math.min(causal.density, 0.8) / 0.8) * 35
  const lengthPts = (Math.min(readability.words, 40) / 40) * 25
  const jargonPenalty = Math.min(20, jargon.density * 1.5)

  const explanatoryDepthScore = Math.round(
    Math.max(5, Math.min(100, easePts + causalPts + lengthPts - jargonPenalty)),
  )

  // Normalize initial confidence (1-5) to 0-100 scale: 1->20, 3->60, 5->100
  const normalizedConfidence = initialConfidence * 20
  // IOED gap: if learner felt 100% confident but scored 40%, gap is +60 (huge illusion of depth)
  const ioedGap = Math.max(0, normalizedConfidence - explanatoryDepthScore)

  // Generate Socratic Probes
  const probes: SocraticProbe[] = []

  // Probe 1: Jargon clarification
  if (jargon.terms.length > 0) {
    const term = jargon.terms[0]!
    probes.push({
      id: `probe-jargon-${term}`,
      type: 'clarify_jargon',
      prompt: `You used "${term}". If a 12-year-old asked you what "${term}" actually means in plain English, how would you describe it?`,
      targetTerm: term,
    })
  }

  // Probe 2: Causal mechanism
  if (causal.count < 2) {
    probes.push({
      id: 'probe-causal',
      type: 'causal_mechanism',
      prompt: `How does ${concept} mechanically work step-by-step? What causes the reaction or transition from start to finish?`,
    })
  }

  // Probe 3: Concrete analogy
  probes.push({
    id: 'probe-analogy',
    type: 'concrete_analogy',
    prompt: `What is a concrete real-world physical object (like a bicycle, kitchen recipe, or water pipe) that behaves just like ${concept}?`,
  })

  // Probe 4: Counter-example / Boundary condition
  probes.push({
    id: 'probe-counter',
    type: 'counter_example',
    prompt: `When does ${concept} break down or NOT apply? What is an edge case where this rule fails?`,
  })

  // Generate Suggested Gap Cards
  const suggestedGapCards: GapCardCandidate[] = []

  // If jargon exists, make a definition card
  for (const term of jargon.terms.slice(0, 2)) {
    suggestedGapCards.push({
      front: `In simple terms, what does "${term}" mean in the context of ${concept}?`,
      back: `Plain definition of ${term} without technical jargon.`,
      reason: `Eliminate jargon barrier identified in Feynman teach-back.`,
      tags: ['feynman', 'jargon-bust', concept.toLowerCase().replace(/\s+/g, '-')],
    })
  }

  // Causal step card
  suggestedGapCards.push({
    front: `What is the core physical/causal mechanism behind ${concept}?`,
    back: `Step-by-step causal chain explaining how and why ${concept} functions.`,
    reason: `Deepen mechanistic grasp to resolve the illusion of explanatory depth.`,
    tags: ['feynman', 'causal-depth', concept.toLowerCase().replace(/\s+/g, '-')],
  })

  // Determine summary verdict
  let summaryVerdict: FeynmanDiagnosticReport['summaryVerdict'] = 'mastery_clarity'
  if (readability.words < 25) {
    summaryVerdict = 'rudimentary'
  } else if (ioedGap >= 30) {
    summaryVerdict = 'illusion_of_depth'
  } else if (jargon.density > 8 || !isTwelveYearOldAccessible) {
    summaryVerdict = 'jargon_heavy'
  }

  return {
    concept,
    wordCount: readability.words,
    sentenceCount: readability.sentences,
    syllableCount: readability.syllables,
    fleschReadingEase: readability.readingEase,
    fleschKincaidGradeLevel: readability.gradeLevel,
    isTwelveYearOldAccessible,
    jargonTerms: jargon.terms,
    jargonDensity: jargon.density,
    causalMarkerCount: causal.count,
    causalDensity: causal.density,
    explanatoryDepthScore,
    initialConfidence,
    ioedGap,
    socraticProbes: probes,
    suggestedGapCards,
    summaryVerdict,
  }
}
