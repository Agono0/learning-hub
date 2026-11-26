/**
 * Elaborative Interrogation — pure domain logic (no I/O, no DB, no fetch).
 *
 * Elaborative interrogation (EI) asks a learner to explain WHY a stated fact is true
 * instead of re-reading it. Pressley et al. (1987) and Woloshyn, Pressley & Schneider
 * (1992) found it roughly doubles factual recall when learners have some prior
 * knowledge; Dunlosky et al. (2013) rate it "moderate utility". Gains shrink for
 * learners with little prior knowledge, so this module (a) generates varied "why"
 * prompts from a fact, (b) grades an explanation with transparent, deterministic
 * heuristics (never an opaque score), and (c) adapts the next prompt to the result.
 *
 * Everything is deterministic: the same input always yields the same output.
 */
import { z } from 'zod'

/** The kind of relation a fact states. Drives which prompt templates apply. */
export const factKindSchema = z.enum([
  'causal',
  'categorical',
  'quantitative',
  'contrast',
  'general',
])
export type FactKind = z.infer<typeof factKindSchema>

/** One fact the learner should understand, validated at every boundary. */
export const eiFactSchema = z.object({
  id: z.string().trim().min(1).max(80),
  statement: z.string().trim().min(8).max(600),
  /** Optional hand-picked key terms the explanation should touch. */
  keyTerms: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  /** Optional self-rated prior knowledge 0..1; lowers difficulty of prompts when low. */
  priorKnowledge: z.number().min(0).max(1).default(0.5),
})
export type EiFact = z.infer<typeof eiFactSchema>

/** Prompt styles, from the classic "why" to deeper transfer questions. */
export const promptStyleSchema = z.enum([
  'why-true',
  'why-not-otherwise',
  'mechanism',
  'prerequisite',
  'transfer',
  'contrast-case',
  'analogy',
  'counterexample',
  'predict-outcome',
  'teach-back',
])
export type PromptStyle = z.infer<typeof promptStyleSchema>

export interface EiPrompt {
  factId: string
  style: PromptStyle
  text: string
  /** 1 (easy) .. 4 (hard). */
  level: 1 | 2 | 3 | 4
}

const CAUSAL_MARKERS = [
  'because',
  'therefore',
  'so that',
  'since',
  'as a result',
  'which means',
  'leads to',
  'causes',
  'due to',
  'thus',
  'hence',
  'in order to',
  'results in',
  'allows',
  'enables',
  'prevents',
]
const CONTRAST_MARKERS = [
  'unlike',
  'whereas',
  'however',
  'on the other hand',
  'instead',
  'but',
  'in contrast',
  'rather than',
  'whereas',
]
const LINK_MARKERS = [
  'for example',
  'for instance',
  'similar to',
  'like when',
  'reminds me',
  'i already know',
  'analogy',
  'just as',
  'in the same way',
  'such as',
]
const HEDGES = [
  'i think',
  'maybe',
  'probably',
  'not sure',
  'i guess',
  'i dont know',
  "i don't know",
  'idk',
]
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'it',
  'that',
  'this',
  'with',
  'as',
  'by',
  'at',
  'from',
  'its',
  'their',
  'than',
  'then',
  'there',
  'which',
  'who',
  'what',
  'when',
  'how',
  'why',
  'not',
  'no',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'can',
  'will',
  'would',
  'should',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'so',
  'if',
  'but',
  'because',
  'also',
  'more',
  'most',
  'very',
])

/** Lowercase word tokens (letters, digits, apostrophes). */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9\u00c0-\u024f']+/g) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
}

/** Content words: tokens without stopwords and with a light plural/suffix stem. */
export function contentWords(text: string): string[] {
  return tokenize(text)
    .filter((w) => !STOPWORDS.has(w) && w.length > 2)
    .map(stem)
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/**
 * Classify what relation a statement expresses. Causal wording wins, then contrast,
 * then quantities, then "is a/are" categories. Anything else is `general`.
 */
export function classifyFact(statement: string): FactKind {
  const s = statement.toLowerCase()
  if (
    /\b(causes?|leads? to|results? in|because|due to|produces?|prevents?|triggers?|increases?|decreases?|reduces?|enables?)\b/.test(
      s,
    )
  )
    return 'causal'
  if (
    /\b(unlike|whereas|in contrast|rather than|instead of|differs? from|compared (to|with))\b/.test(
      s,
    )
  )
    return 'contrast'
  if (/\d/.test(s) || /\b(percent|ratio|twice|half|double|per|average|minimum|maximum)\b/.test(s))
    return 'quantitative'
  if (/\b(is an?|are|is the|belongs? to|consists? of|is called|known as|type of|kind of)\b/.test(s))
    return 'categorical'
  return 'general'
}

const TEMPLATES: Record<FactKind, Record<PromptStyle, string>> = {
  causal: {
    'why-true': 'Why does this happen? "{s}"',
    'why-not-otherwise': 'What would change if this were not true, and why? "{s}"',
    mechanism: 'Walk through the step-by-step mechanism behind this. "{s}"',
    prerequisite: 'What must already be true for this to work? "{s}"',
    transfer: 'Name a different situation where the same cause would apply, and explain why. "{s}"',
    'contrast-case':
      'Describe a case that looks similar but would NOT follow this, and say why. "{s}"',
    analogy: 'Give an analogy from everyday life that shows why this works. "{s}"',
    counterexample:
      'Find a counterexample that seems to break this, then explain what is really going on. "{s}"',
    'predict-outcome': 'Predict what happens if the cause doubles or disappears, and why. "{s}"',
    'teach-back': 'Explain this to a friend with no background, using a reason at each step. "{s}"',
  },
  categorical: {
    'why-true': 'Why does this belong in that category? "{s}"',
    'why-not-otherwise': 'Why is it not a member of a nearby category? "{s}"',
    mechanism: 'Which defining features put it in this category? "{s}"',
    prerequisite:
      'What do you need to know to tell members of this category apart from others? "{s}"',
    transfer: 'Give another member of the category and explain why it fits. "{s}"',
    'contrast-case':
      'Give a near-miss that is NOT in this category and explain the difference. "{s}"',
    analogy: 'Give an analogy that captures what defines this category. "{s}"',
    counterexample: 'Find a counterexample that seems to fit but does not, and say why. "{s}"',
    'predict-outcome': 'Predict how you would classify a new borderline case, and why. "{s}"',
    'teach-back': 'Teach the defining features to a beginner, with a reason for each. "{s}"',
  },
  quantitative: {
    'why-true': 'Why is the number or ratio what it is, and not much higher or lower? "{s}"',
    'why-not-otherwise': 'What would push this value up or down, and why? "{s}"',
    mechanism: 'What process produces this quantity? "{s}"',
    prerequisite: 'What assumptions make this number valid? "{s}"',
    transfer: 'How would you estimate a similar quantity in another setting? "{s}"',
    'contrast-case': 'When would this value be badly wrong? "{s}"',
    analogy: 'Give an everyday analogy for the size of this quantity. "{s}"',
    counterexample:
      'Find a situation where this number looks wrong but is right, and explain. "{s}"',
    'predict-outcome': 'Predict the value if one input doubles, and justify it. "{s}"',
    'teach-back': 'Explain why this number matters to a friend, with reasons. "{s}"',
  },
  contrast: {
    'why-true': 'Why do these two things differ in this way? "{s}"',
    'why-not-otherwise': 'Why can one not simply be swapped for the other? "{s}"',
    mechanism: 'What underlying mechanism explains the difference? "{s}"',
    prerequisite: 'What does each side depend on? "{s}"',
    transfer: 'Find another pair that differs for the same reason. "{s}"',
    'contrast-case': 'When would the difference vanish? "{s}"',
    analogy: 'Give an analogy that makes the difference easy to feel. "{s}"',
    counterexample:
      'Find a counterexample where the difference does not hold, and explain why. "{s}"',
    'predict-outcome': 'Predict what happens when you swap one side for the other, and why. "{s}"',
    'teach-back': 'Explain the difference to a friend, giving a reason at each step. "{s}"',
  },
  general: {
    'why-true': 'Why do you think this is true? "{s}"',
    'why-not-otherwise': 'Why is it not the opposite? "{s}"',
    mechanism: 'Explain how this works in your own words. "{s}"',
    prerequisite: 'What earlier knowledge does this build on? "{s}"',
    transfer: 'Where else would this idea apply, and why? "{s}"',
    'contrast-case': 'Describe an exception and what makes it different. "{s}"',
    analogy: 'Give an analogy that explains this in plain terms. "{s}"',
    counterexample: 'Find a counterexample or exception, and explain why it differs. "{s}"',
    'predict-outcome': 'Predict what follows from this, and justify the prediction. "{s}"',
    'teach-back': 'Teach this to a beginner, saying why at each step. "{s}"',
  },
}

/** Styles unlocked at each level, easiest first. */
export const STYLE_LADDER: readonly PromptStyle[] = [
  'why-true',
  'prerequisite',
  'mechanism',
  'why-not-otherwise',
  'contrast-case',
  'analogy',
  'counterexample',
  'predict-outcome',
  'transfer',
  'teach-back',
]
const STYLE_LEVEL: Record<PromptStyle, 1 | 2 | 3 | 4> = {
  'why-true': 1,
  prerequisite: 2,
  mechanism: 2,
  'why-not-otherwise': 3,
  'contrast-case': 4,
  transfer: 4,
  analogy: 3,
  counterexample: 4,
  'predict-outcome': 3,
  'teach-back': 4,
}

/** Build the prompt for a fact in a given style. */
export function buildPrompt(fact: EiFact, style: PromptStyle): EiPrompt {
  const kind = classifyFact(fact.statement)
  return {
    factId: fact.id,
    style,
    level: STYLE_LEVEL[style],
    text: TEMPLATES[kind][style].replace('{s}', fact.statement.replace(/\s+/g, ' ').trim()),
  }
}

/**
 * Pick a starting level: low prior knowledge keeps learners on easy "why" prompts
 * (EI helps little without a knowledge base, Woloshyn et al. 1992).
 */
export function startingLevel(priorKnowledge: number): 1 | 2 | 3 | 4 {
  if (priorKnowledge < 0.25) return 1
  if (priorKnowledge < 0.5) return 2
  if (priorKnowledge < 0.8) return 3
  return 4
}

/** One graded rubric dimension, so the learner can see exactly why. */
export interface EiRubricItem {
  key: 'length' | 'causal' | 'coverage' | 'originality' | 'linking' | 'specificity'
  label: string
  score: number
  max: number
  note: string
}

export interface EiGrade {
  total: number
  band: 'restating' | 'shallow' | 'developing' | 'solid' | 'deep'
  rubric: EiRubricItem[]
  /** True when the answer mostly copies the source statement. */
  copied: boolean
  feedback: string[]
}

/** Share of the statement's content words that appear in the answer (0..1). */
export function overlapWithSource(statement: string, answer: string): number {
  const src = new Set(contentWords(statement))
  if (src.size === 0) return 0
  const ans = new Set(contentWords(answer))
  let hit = 0
  for (const w of src) if (ans.has(w)) hit++
  return hit / src.size
}

/** Share of the ANSWER's content words that are not in the statement: new ideas. */
export function novelShare(statement: string, answer: string): number {
  const src = new Set(contentWords(statement))
  const ansList = contentWords(answer)
  if (ansList.length === 0) return 0
  const uniq = new Set(ansList)
  let fresh = 0
  for (const w of uniq) if (!src.has(w)) fresh++
  return fresh / uniq.size
}

function countMarkers(text: string, markers: readonly string[]): number {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `
  let n = 0
  for (const m of markers) {
    const re = new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    n += (t.match(re) ?? []).length
  }
  return n
}

/**
 * Grade an explanation out of 100 with six visible rubric items. It rewards
 * causal reasoning, coverage of key ideas, new wording and links to prior
 * knowledge, and penalises copying and hedging. It is a heuristic, not a judge
 * of truth: surface it as coaching, never as a hard fail.
 */
export function gradeExplanation(fact: EiFact, answer: string): EiGrade {
  const text = answer.trim()
  const words = tokenize(text)
  const n = words.length
  const feedback: string[] = []

  const lengthScore = n >= 40 ? 15 : n >= 25 ? 12 : n >= 15 ? 8 : n >= 8 ? 4 : 0
  if (n < 15) feedback.push('Write at least a couple of full sentences: say why, not just what.')

  const causal = Math.min(
    countMarkers(text, CAUSAL_MARKERS) + Math.min(countMarkers(text, CONTRAST_MARKERS), 1),
    4,
  )
  const causalScore = [0, 10, 18, 24, 25][causal] ?? 25
  if (causal === 0)
    feedback.push(
      'Use a reason word such as "because" or "which means" to connect cause and effect.',
    )

  const terms =
    fact.keyTerms.length > 0
      ? fact.keyTerms.flatMap((t) => contentWords(t))
      : contentWords(fact.statement).slice(0, 6)
  const ansSet = new Set(contentWords(text))
  const termSet = [...new Set(terms)]
  const covered = termSet.filter((t) => ansSet.has(t)).length
  const coverageRatio = termSet.length === 0 ? 0 : covered / termSet.length
  const coverageScore = Math.round(coverageRatio * 20)
  if (coverageRatio < 0.5 && termSet.length > 0)
    feedback.push('Bring in more of the key ideas from the fact.')

  const overlap = overlapWithSource(fact.statement, text)
  const novel = novelShare(fact.statement, text)
  const copied = n > 0 && overlap >= 0.8 && novel < 0.25
  const originalityScore = copied ? 0 : Math.round(Math.min(1, novel / 0.6) * 20)
  if (copied)
    feedback.push(
      'This mostly repeats the fact. Put it in your own words and add the reason behind it.',
    )

  const links = Math.min(countMarkers(text, LINK_MARKERS), 2)
  const linkScore = links * 5
  if (links === 0) feedback.push('Tie it to something you already know: an example or an analogy.')

  const hedges = countMarkers(text, HEDGES)
  const hasNumber = /\d/.test(text)
  const longWords = new Set(words.filter((w) => w.length >= 7)).size
  let specificity = Math.min(10, longWords * 2 + (hasNumber ? 2 : 0)) - hedges * 3
  specificity = Math.max(0, specificity)
  if (hedges > 0)
    feedback.push('Hedging words suggest a gap. Note which part you are unsure of and review it.')

  const rubric: EiRubricItem[] = [
    { key: 'length', label: 'Developed answer', score: lengthScore, max: 15, note: `${n} words` },
    {
      key: 'causal',
      label: 'Causal reasoning',
      score: causalScore,
      max: 25,
      note: `${causal} reasoning link(s)`,
    },
    {
      key: 'coverage',
      label: 'Key ideas covered',
      score: coverageScore,
      max: 20,
      note: `${covered}/${termSet.length} ideas`,
    },
    {
      key: 'originality',
      label: 'Own words',
      score: originalityScore,
      max: 20,
      note: `${Math.round(novel * 100)}% new wording`,
    },
    {
      key: 'linking',
      label: 'Links to prior knowledge',
      score: linkScore,
      max: 10,
      note: `${links} link(s)`,
    },
    {
      key: 'specificity',
      label: 'Specific, confident',
      score: specificity,
      max: 10,
      note: hedges > 0 ? `${hedges} hedge(s)` : 'no hedging',
    },
  ]
  const total = Math.max(
    0,
    Math.min(
      100,
      rubric.reduce((a, r) => a + r.score, 0),
    ),
  )
  const band: EiGrade['band'] = copied
    ? 'restating'
    : total >= 80
      ? 'deep'
      : total >= 62
        ? 'solid'
        : total >= 42
          ? 'developing'
          : 'shallow'
  if (feedback.length === 0)
    feedback.push('Strong explanation. Next time try a harder prompt style.')
  return { total, band, rubric, copied, feedback }
}

/** Per-fact adaptive state the client keeps and sends back (stateless server). */
export const eiFactStateSchema = z.object({
  factId: z.string().min(1).max(80),
  level: z.number().int().min(1).max(4).default(1),
  attempts: z.number().int().min(0).max(10_000).default(0),
  bestScore: z.number().min(0).max(100).default(0),
  lastScore: z.number().min(0).max(100).default(0),
  streak: z.number().int().min(0).max(1000).default(0),
  intervalDays: z.number().min(0).max(365).default(0),
  dueDay: z.number().int().min(0).default(0),
  stylesSeen: z.array(promptStyleSchema).max(12).default([]),
})
export type EiFactState = z.infer<typeof eiFactStateSchema>

/** A fresh state for a fact, starting level from prior knowledge. */
export function initialState(fact: EiFact): EiFactState {
  return eiFactStateSchema.parse({ factId: fact.id, level: startingLevel(fact.priorKnowledge) })
}

/**
 * Update adaptive state after a graded attempt. Solid or deep answers raise the
 * level after two in a row and lengthen the review gap (x2.2); weak answers drop
 * a level and bring the fact back tomorrow. `today` is an integer day number.
 */
export function updateState(
  state: EiFactState,
  grade: EiGrade,
  style: PromptStyle,
  today: number,
): EiFactState {
  const good = grade.band === 'solid' || grade.band === 'deep'
  const streak = good ? state.streak + 1 : 0
  let level = state.level
  if (good && streak >= 2) level = Math.min(4, level + 1)
  if (grade.band === 'restating' || grade.band === 'shallow') level = Math.max(1, level - 1)
  const interval = good
    ? Math.min(365, Math.max(1, Math.round((state.intervalDays || 1) * 2.2)))
    : grade.band === 'developing'
      ? Math.max(1, Math.round((state.intervalDays || 1) * 0.8))
      : 1
  return {
    factId: state.factId,
    level,
    attempts: state.attempts + 1,
    bestScore: Math.max(state.bestScore, grade.total),
    lastScore: grade.total,
    streak: good && streak >= 2 ? 0 : streak,
    intervalDays: interval,
    dueDay: today + interval,
    stylesSeen: [...new Set([...state.stylesSeen, style])].slice(-12),
  }
}

/** Choose the next prompt style at the fact's level, rotating through unseen styles first. */
export function nextStyle(state: EiFactState): PromptStyle {
  const allowed = STYLE_LADDER.filter((s) => STYLE_LEVEL[s] <= state.level)
  const unseen = allowed.filter((s) => !state.stylesSeen.includes(s))
  if (unseen.length > 0) return unseen[unseen.length - 1] as PromptStyle
  return allowed[state.attempts % allowed.length] as PromptStyle
}

/** One queue entry for a study session. */
export interface EiQueueItem {
  fact: EiFact
  state: EiFactState
  prompt: EiPrompt
  overdueDays: number
  isNew: boolean
}

/**
 * Build a session queue: overdue facts first (most overdue first), then new facts
 * (lowest prior knowledge first so scaffolding comes early), capped at `limit`.
 * Facts not yet due are left out.
 */
export function buildQueue(
  facts: EiFact[],
  states: EiFactState[],
  today: number,
  limit = 10,
): EiQueueItem[] {
  const byId = new Map(states.map((s) => [s.factId, s]))
  const items: EiQueueItem[] = []
  for (const fact of facts) {
    const existing = byId.get(fact.id)
    const state = existing ?? initialState(fact)
    const isNew = !existing || existing.attempts === 0
    if (!isNew && state.dueDay > today) continue
    items.push({
      fact,
      state,
      prompt: buildPrompt(fact, nextStyle(state)),
      overdueDays: isNew ? 0 : today - state.dueDay,
      isNew,
    })
  }
  items.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1
    if (!a.isNew) return b.overdueDays - a.overdueDays
    return a.fact.priorKnowledge - b.fact.priorKnowledge || a.fact.id.localeCompare(b.fact.id)
  })
  return items.slice(0, Math.max(1, limit))
}

/** Aggregate view over facts for the dashboard. */
export interface EiSummary {
  facts: number
  attempted: number
  due: number
  meanBest: number
  deep: number
  weakest: string[]
}

export function summarize(facts: EiFact[], states: EiFactState[], today: number): EiSummary {
  const byId = new Map(states.map((s) => [s.factId, s]))
  let attempted = 0
  let due = 0
  let sum = 0
  let deep = 0
  const scored: { id: string; score: number }[] = []
  for (const f of facts) {
    const s = byId.get(f.id)
    if (!s || s.attempts === 0) {
      due++
      continue
    }
    attempted++
    sum += s.bestScore
    if (s.bestScore >= 80) deep++
    if (s.dueDay <= today) due++
    scored.push({ id: f.id, score: s.lastScore })
  }
  scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
  return {
    facts: facts.length,
    attempted,
    due,
    meanBest: attempted ? Math.round(sum / attempted) : 0,
    deep,
    weakest: scored.slice(0, 3).map((s) => s.id),
  }
}

/**
 * Split pasted study text into candidate facts: one sentence each, 8 to 40 words,
 * with key terms taken from capitalised words and the longest content words.
 */
export function extractFacts(text: string, max = 30): EiFact[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => {
      const n = tokenize(s).length
      return n >= 8 && n <= 40
    })
  return sentences.slice(0, max).map((statement, i) => {
    const caps = (statement.match(/\b[A-Z][a-z]{3,}\b/g) ?? []).slice(1, 4)
    const long = [...new Set(tokenize(statement).filter((w) => w.length >= 8))].slice(0, 4)
    const keyTerms = [...new Set([...caps, ...long])].slice(0, 6)
    return eiFactSchema.parse({ id: `f${i + 1}`, statement, keyTerms })
  })
}
