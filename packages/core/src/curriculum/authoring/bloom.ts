/**
 * Bloom-level reading of lesson objectives and exercise formats.
 *
 * Both mappings are CONVENTIONS, not measurements. A verb tells us what the
 * author claims the learner will do; an exercise type tells us the kind of
 * response the exercise asks for. Neither says how hard the item really is.
 */
import type { Exercise, ExerciseType } from '../../practice/schema'
import { BLOOM_VERBS, type BloomVerb } from '../pedagogy'

export const BLOOM_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const
export type BloomLevel = (typeof BLOOM_LEVELS)[number]

/** 1 (remember) … 6 (create). */
export function bloomRank(level: BloomLevel): number {
  return BLOOM_LEVELS.indexOf(level) + 1
}

/** Verb → level. Mirrors the groups in `pedagogy.ts` (remember … create). */
export const BLOOM_LEVEL_OF_VERB: Readonly<Record<BloomVerb, BloomLevel>> = (() => {
  const groups: Record<BloomLevel, readonly string[]> = {
    remember: ['define', 'list', 'name', 'recall', 'state', 'identify', 'label'],
    understand: [
      'explain',
      'describe',
      'summarize',
      'paraphrase',
      'classify',
      'compare',
      'contrast',
      'illustrate',
    ],
    apply: ['apply', 'compute', 'solve', 'use', 'demonstrate', 'implement', 'calculate', 'sketch'],
    analyze: [
      'analyze',
      'derive',
      'differentiate',
      'deconstruct',
      'diagnose',
      'examine',
      'prove',
      'verify',
    ],
    evaluate: ['evaluate', 'critique', 'justify', 'assess', 'judge', 'validate', 'refute'],
    create: ['design', 'construct', 'create', 'formulate', 'propose', 'write', 'build', 'compose'],
  }
  const out = {} as Record<BloomVerb, BloomLevel>
  for (const level of BLOOM_LEVELS) for (const v of groups[level]) out[v as BloomVerb] = level
  return out
})()

/** Sanity check used by tests: every known verb has a level. */
export function unmappedBloomVerbs(): string[] {
  return BLOOM_VERBS.filter((v) => !(v in BLOOM_LEVEL_OF_VERB))
}

export interface ObjectiveReading {
  /** First word, lowercased, with punctuation trimmed. */
  verb: string
  level: BloomLevel | null
  /** Everything after the verb. */
  object: string
}

/** Read the leading verb of an objective like "Explain how joins work". */
export function readObjective(objective: string): ObjectiveReading {
  const cleaned = objective
    .trim()
    .replace(
      /^(?:you will be able to|students? will be able to|learners? will be able to|swbat|by the end,?)\s*/i,
      '',
    )
    .replace(/^[-*•\d.)\s]+/, '')
  const m = /^([\p{L}'-]+)\s*(.*)$/su.exec(cleaned)
  if (!m) return { verb: '', level: null, object: cleaned }
  const verb = m[1]!.toLowerCase()
  const level = (BLOOM_LEVEL_OF_VERB as Record<string, BloomLevel | undefined>)[verb] ?? null
  return { verb, level, object: m[2]!.trim() }
}

/**
 * Highest level an exercise FORMAT can plausibly exercise. Recognition formats
 * (choice, true/false, matching) top out low; production formats go higher.
 * A well-written MCQ can reach "analyze", so this is a ceiling guess, not a rule.
 */
export const FORMAT_CEILING: Readonly<Record<ExerciseType, BloomLevel>> = {
  truefalse: 'remember',
  mcq: 'analyze',
  multi: 'analyze',
  matching: 'understand',
  categorize: 'understand',
  ordering: 'understand',
  typein: 'remember',
  cloze: 'understand',
  numeric: 'apply',
  parsons: 'apply',
  freetext: 'create',
  code: 'create',
}

/** `recall` formats make the learner produce the answer, `recognition` formats show it. */
export type ResponseKind = 'recognition' | 'production'

export const RESPONSE_KIND: Readonly<Record<ExerciseType, ResponseKind>> = {
  truefalse: 'recognition',
  mcq: 'recognition',
  multi: 'recognition',
  matching: 'recognition',
  categorize: 'recognition',
  ordering: 'recognition',
  typein: 'production',
  cloze: 'production',
  numeric: 'production',
  parsons: 'production',
  freetext: 'production',
  code: 'production',
}

/** Can this exercise format reach the level an objective names? */
export function formatCanReach(type: ExerciseType, level: BloomLevel): boolean {
  return bloomRank(FORMAT_CEILING[type]) >= bloomRank(level)
}

/** Count exercises per Bloom ceiling, for the coverage chart. */
export function ceilingHistogram(exercises: readonly Exercise[]): Record<BloomLevel, number> {
  const out = Object.fromEntries(BLOOM_LEVELS.map((l) => [l, 0])) as Record<BloomLevel, number>
  for (const e of exercises) out[FORMAT_CEILING[e.type]] += 1
  return out
}
