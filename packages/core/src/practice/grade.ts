/**
 * Graders — one pure function per exercise type, all returning the same
 * {@link GradeResult}. Grading runs on the backend (handlers / review
 * service), never trusted from the UI, so XP, FSRS and mastery stay honest.
 *
 * Partial credit (multi, ordering, matching, categorize, cloze) gives the
 * learner precise feedback; the FSRS grade is derived from the score by
 * {@link scoreToGrade}, so "almost right" schedules sooner than "right".
 */
import { z } from 'zod'
import type { Grade } from '../types'
import type { Exercise, ExerciseOf, ExerciseType } from './schema'
import { matchText } from './text'

/** Outcome of grading one answer. */
export interface GradeResult {
  /** 0..1 — fraction of the exercise answered correctly. */
  score: number
  /** score === 1 (typo-forgiven answers count as correct). */
  correct: boolean
  /** FSRS rating derived from the score (see {@link scoreToGrade}). */
  grade: Grade
  /** Short, specific feedback lines for the learner. */
  feedback: string[]
  /** True when a human/AI must still judge it (free text without a score). */
  pending?: boolean
}

// ─── Answer shapes (validated at the API boundary) ──────────────────────────

export const answerSchemas = {
  mcq: z.object({ choice: z.number().int().min(0) }),
  multi: z.object({ choices: z.array(z.number().int().min(0)).max(10) }),
  truefalse: z.object({ value: z.boolean() }),
  numeric: z.object({ value: z.number().finite() }),
  typein: z.object({ text: z.string().max(2000) }),
  cloze: z.object({ blanks: z.array(z.string().max(500)).max(50) }),
  ordering: z.object({ order: z.array(z.number().int().min(0)).max(30) }),
  parsons: z.object({ lines: z.array(z.string().max(300)).max(40) }),
  matching: z.object({
    pairs: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(12),
  }),
  categorize: z.object({ placements: z.record(z.string(), z.string()) }),
  /** `score` comes from the AI rubric grader or the learner's self-assessment (0..1). */
  freetext: z.object({ text: z.string().max(20000), score: z.number().min(0).max(1).optional() }),
  /** Test results from the sandboxed runner, or a self-check (`selfCorrect`). */
  code: z.object({
    source: z.string().max(50000),
    passed: z.number().int().min(0).optional(),
    total: z.number().int().min(0).optional(),
    selfCorrect: z.boolean().optional(),
  }),
} satisfies Record<ExerciseType, z.ZodType>

export type AnswerOf<T extends ExerciseType> = z.infer<(typeof answerSchemas)[T]>

// ─── Score → FSRS grade ─────────────────────────────────────────────────────

/**
 * Map a 0..1 score to an FSRS rating: 1 → Good, ≥ 0.75 → Hard (mostly right —
 * review sooner), otherwise Again. Easy is reserved for the learner's own
 * "too easy" signal, never inferred from correctness alone.
 */
export function scoreToGrade(score: number): Grade {
  if (score >= 1) return 3
  if (score >= 0.75) return 2
  return 1
}

function result(score: number, feedback: string[], extra: Partial<GradeResult> = {}): GradeResult {
  const s = Math.min(1, Math.max(0, score))
  return { score: s, correct: s >= 1, grade: scoreToGrade(s), feedback, ...extra }
}

// ─── Cloze helpers ──────────────────────────────────────────────────────────

/** The accepted answers for each `{{blank|alt}}` in a cloze text, in order. */
export function clozeBlanks(textWithBlanks: string): string[][] {
  return [...textWithBlanks.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) =>
    m[1]!
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/** The cloze text with blanks replaced by `____` (what the learner sees). */
export function clozePrompt(textWithBlanks: string): string {
  return textWithBlanks.replace(/\{\{[^{}]+\}\}/g, '____')
}

// ─── Per-type graders ───────────────────────────────────────────────────────

type Grader<T extends ExerciseType> = (exercise: ExerciseOf<T>, answer: AnswerOf<T>) => GradeResult

const graders: { [T in ExerciseType]: Grader<T> } = {
  mcq(e, a) {
    const ok = a.choice === e.answer
    const why = e.why?.[a.choice]
    return result(ok ? 1 : 0, [
      ok ? 'Correct.' : `Not quite — the answer is “${e.options[e.answer]}”.`,
      ...(why ? [why] : []),
    ])
  },

  multi(e, a) {
    // Score every option as a yes/no decision: picking a correct one or
    // leaving out a wrong one both count.
    const want = new Set(e.answers)
    const got = new Set(a.choices)
    let right = 0
    e.options.forEach((_, i) => {
      if (want.has(i) === got.has(i)) right++
    })
    const missed = e.answers.filter((i) => !got.has(i)).length
    const extra = [...got].filter((i) => !want.has(i)).length
    const feedback =
      right === e.options.length
        ? ['All correct.']
        : [`${missed} correct option(s) missed, ${extra} wrong option(s) picked.`]
    return result(right / e.options.length, feedback)
  },

  truefalse(e, a) {
    const ok = a.value === e.answer
    return result(ok ? 1 : 0, [ok ? 'Correct.' : `It's ${e.answer ? 'true' : 'false'}.`])
  },

  numeric(e, a) {
    const diff = Math.abs(a.value - e.answer)
    const allowed = Math.max(e.tolerance ?? 0, (e.relTolerance ?? 0) * Math.abs(e.answer), 1e-9)
    const ok = diff <= allowed
    const unit = e.unit ? ` ${e.unit}` : ''
    return result(ok ? 1 : 0, [
      ok ? 'Correct.' : `Expected ${e.answer}${unit} (you gave ${a.value}${unit}).`,
    ])
  },

  typein(e, a) {
    const m = matchText(a.text, e.answers, !e.exact)
    if (m === 'exact') return result(1, ['Correct.'])
    if (m === 'typo') return result(1, [`Correct — watch the spelling: “${e.answers[0]}”.`])
    return result(0, [`The answer is “${e.answers[0]}”.`])
  },

  cloze(e, a) {
    const blanks = clozeBlanks(e.text)
    let right = 0
    const feedback: string[] = []
    blanks.forEach((accepted, i) => {
      if (matchText(a.blanks[i] ?? '', accepted, !e.exact) !== 'none') right++
      else feedback.push(`Blank ${i + 1}: “${accepted[0]}”.`)
    })
    return result(
      blanks.length ? right / blanks.length : 0,
      right === blanks.length ? ['All blanks correct.'] : feedback,
    )
  },

  ordering(e, a) {
    // Credit each item in its correct position.
    let right = 0
    e.items.forEach((_, i) => {
      if (a.order[i] === i) right++
    })
    return result(
      right / e.items.length,
      right === e.items.length
        ? ['Perfect order.']
        : [`${right} of ${e.items.length} in the right place.`],
    )
  },

  parsons(e, a) {
    const want = e.lines.map((l) => l.trim())
    const got = a.lines.map((l) => l.trim())
    const usedDistractor = (e.distractors ?? []).some((d) => got.includes(d.trim()))
    let right = 0
    want.forEach((line, i) => {
      if (got[i] === line) right++
    })
    const score = (right / want.length) * (got.length === want.length && !usedDistractor ? 1 : 0.75)
    const feedback =
      score >= 1
        ? ['Program assembled correctly.']
        : [
            `${right} of ${want.length} lines in place.${usedDistractor ? ' A distractor line was used.' : ''}`,
          ]
    return result(score, feedback)
  },

  matching(e, a) {
    // pairs are [leftIndex, rightIndex]; correct when they point at the same pair.
    const right = a.pairs.filter(([l, r]) => l === r && l < e.pairs.length).length
    return result(
      right / e.pairs.length,
      right === e.pairs.length ? ['All matched.'] : [`${right} of ${e.pairs.length} matched.`],
    )
  },

  categorize(e, a) {
    const truth = new Map<string, string>()
    for (const c of e.categories) for (const item of c.items) truth.set(item, c.name)
    let right = 0
    for (const [item, cat] of truth) if (a.placements[item] === cat) right++
    return result(
      right / truth.size,
      right === truth.size
        ? ['Everything sorted correctly.']
        : [`${right} of ${truth.size} sorted correctly.`],
    )
  },

  freetext(e, a) {
    if (a.score === undefined) {
      return { ...result(0, ['Compare your answer with the rubric, then rate it.']), pending: true }
    }
    return result(
      a.score,
      a.score >= 1 ? ['Meets every rubric point.'] : ['Check the rubric points you missed.'],
    )
  },

  code(e, a) {
    if (a.total !== undefined && a.total > 0 && a.passed !== undefined) {
      return result(a.passed / a.total, [`${a.passed} of ${a.total} tests passed.`])
    }
    if (a.selfCorrect !== undefined) {
      return result(a.selfCorrect ? 1 : 0, [
        a.selfCorrect ? 'Self-checked as correct.' : 'Compare with the solution and try again.',
      ])
    }
    return { ...result(0, ['Run the tests or compare with the solution.']), pending: true }
  },
}

/**
 * Grade any exercise. Validates the answer shape for the exercise's type
 * first; a malformed answer scores 0 with a clear message instead of throwing.
 */
export function gradeExercise(exercise: Exercise, answer: unknown): GradeResult {
  const parsed = answerSchemas[exercise.type].safeParse(answer)
  if (!parsed.success)
    return result(0, [`Answer is not in the expected shape for a ${exercise.type} exercise.`])
  return (graders[exercise.type] as Grader<ExerciseType>)(
    exercise as ExerciseOf<ExerciseType>,
    parsed.data as AnswerOf<ExerciseType>,
  )
}
