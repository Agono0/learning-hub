/**
 * Exercise types of the practice engine — the shapes a curriculum (LHCF),
 * a deck or an AI can use to describe practice. This is a PUBLIC CONTRACT
 * (other people's AIs produce it): extend additively, never repurpose a field.
 *
 * Why so many types: varied retrieval formats ("desirable difficulties",
 * Bjork 1994) and matching the format to the skill (recognition vs. recall vs.
 * production) both improve transfer. Production formats (type-in, numeric,
 * code, free text) give the strongest testing effect (Roediger & Karpicke 2006).
 */
import { z } from 'zod'

const text = (max = 4000) => z.string().trim().min(1).max(max)

/** Fields every exercise shares. `prompt` and `explanation` are Markdown (+ KaTeX). */
const base = {
  /** Stable id within its lesson (optional; derived from position when absent). */
  id: z.string().trim().min(1).max(80).optional(),
  /** The question / task, Markdown. */
  prompt: text(),
  /** Shown after answering: why the answer is right (worked solution). */
  explanation: z.string().trim().max(8000).optional(),
  /** Optional nudge shown on request before answering. */
  hint: z.string().trim().max(1000).optional(),
  /** Skill name this exercise trains (links to the course skill graph / BKT). */
  skill: z.string().trim().max(120).optional(),
  /** 1 (warm-up) … 5 (challenge). */
  difficulty: z.number().int().min(1).max(5).optional(),
}

/** Single correct choice. `why[i]` explains option i (shown after answering). */
export const mcqSchema = z
  .object({
    ...base,
    type: z.literal('mcq'),
    options: z.array(text(500)).min(2).max(8),
    answer: z.number().int().min(0),
    why: z.array(z.string().max(1000)).optional(),
  })
  .refine((e) => e.answer < e.options.length, {
    message: 'answer must index into options',
    path: ['answer'],
  })

/** Several correct choices; partial credit for each correct decision. */
export const multiSchema = z
  .object({
    ...base,
    type: z.literal('multi'),
    options: z.array(text(500)).min(2).max(10),
    answers: z.array(z.number().int().min(0)).min(1),
  })
  .refine((e) => e.answers.every((a) => a < e.options.length), {
    message: 'every answer must index into options',
    path: ['answers'],
  })

/** A statement to judge true or false. */
export const trueFalseSchema = z.object({
  ...base,
  type: z.literal('truefalse'),
  answer: z.boolean(),
})

/** A number, with absolute and/or relative tolerance and an optional unit. */
export const numericSchema = z.object({
  ...base,
  type: z.literal('numeric'),
  answer: z.number().finite(),
  /** Accept |given − answer| ≤ tolerance. */
  tolerance: z.number().nonnegative().optional(),
  /** Accept |given − answer| ≤ relTolerance·|answer| (e.g. 0.01 = 1%). */
  relTolerance: z.number().nonnegative().max(1).optional(),
  unit: z.string().trim().max(30).optional(),
})

/** Type the answer; any of `answers` is accepted (typo-tolerant unless `exact`). */
export const typeInSchema = z.object({
  ...base,
  type: z.literal('typein'),
  answers: z.array(text(500)).min(1).max(20),
  exact: z.boolean().optional(),
})

/**
 * Fill the blanks. `text` marks blanks as `{{answer}}` or `{{answer|alt|alt}}`;
 * the learner submits one string per blank, in order.
 */
export const clozeSchema = z
  .object({ ...base, type: z.literal('cloze'), text: text(8000), exact: z.boolean().optional() })
  .refine((e) => /\{\{[^{}]+\}\}/.test(e.text), {
    message: 'text needs at least one {{blank}}',
    path: ['text'],
  })

/** Put items in the correct order (`items` is listed in the CORRECT order). */
export const orderingSchema = z.object({
  ...base,
  type: z.literal('ordering'),
  items: z.array(text(500)).min(2).max(15),
})

/**
 * Parsons problem: arrange code lines (given in correct order) — optional
 * `distractors` are wrong lines that must be left out.
 */
export const parsonsSchema = z.object({
  ...base,
  type: z.literal('parsons'),
  lines: z.array(z.string().max(300)).min(2).max(30),
  distractors: z.array(z.string().max(300)).max(10).optional(),
  language: z.string().trim().max(30).optional(),
})

/** Match each left item to its right item. */
export const matchingSchema = z.object({
  ...base,
  type: z.literal('matching'),
  pairs: z
    .array(z.object({ left: text(300), right: text(300) }))
    .min(2)
    .max(12),
})

/** Sort items into categories. */
export const categorizeSchema = z.object({
  ...base,
  type: z.literal('categorize'),
  categories: z
    .array(z.object({ name: text(120), items: z.array(text(300)).min(1).max(15) }))
    .min(2)
    .max(6),
})

/**
 * Open answer graded against a rubric — by the AI when configured, otherwise
 * by the learner comparing with `modelAnswer` (self-assessment still produces
 * the generation effect; Slamecka & Graf 1978).
 */
export const freeTextSchema = z.object({
  ...base,
  type: z.literal('freetext'),
  rubric: z.array(text(500)).min(1).max(10),
  modelAnswer: z.string().trim().max(8000).optional(),
})

/**
 * Write code that passes tests. JavaScript/TypeScript run in a sandboxed
 * worker (each test: `call` is an expression, `expected` its JSON value);
 * other languages are self-checked against `solution`.
 */
export const codeSchema = z.object({
  ...base,
  type: z.literal('code'),
  language: z.string().trim().min(1).max(30),
  starter: z.string().max(20000).optional(),
  solution: z.string().max(20000).optional(),
  tests: z
    .array(
      z.object({
        call: text(1000),
        expected: z.unknown(),
        description: z.string().max(300).optional(),
      }),
    )
    .max(30)
    .optional(),
})

/** Any exercise — a discriminated union on `type`. */
export const exerciseSchema = z.discriminatedUnion('type', [
  mcqSchema,
  multiSchema,
  trueFalseSchema,
  numericSchema,
  typeInSchema,
  clozeSchema,
  orderingSchema,
  parsonsSchema,
  matchingSchema,
  categorizeSchema,
  freeTextSchema,
  codeSchema,
])

export type Exercise = z.infer<typeof exerciseSchema>
export type ExerciseType = Exercise['type']
/** Narrow the union by type: `ExerciseOf<'mcq'>`. */
export type ExerciseOf<T extends ExerciseType> = Extract<Exercise, { type: T }>
