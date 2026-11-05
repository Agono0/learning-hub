/**
 * Learning HUB — curriculum engine (Agent C).
 * Backward-design course generation + parsing, prerequisite-DAG gating on BKT
 * mastery, exam countdown planning, mock exam construction, and the Ramirez &
 * Beilock expressive-writing intervention. Pure logic + zod validation.
 */
import { z } from 'zod'
import { bktUpdate, unlockProbability } from '../bkt'
import { dateKeyOf } from '../streaks'
import { masteryLevelFor, type MasteryLevel, type CardContent, type CardFormat } from '../types'
import { exerciseToText } from '../practice/to-text'

const DAY_MS = 86_400_000

// ─── Bloom verbs (one measurable verb per lesson objective) ─────────────────

export const BLOOM_VERBS = [
  // remember
  'define',
  'list',
  'name',
  'recall',
  'state',
  'identify',
  'label',
  // understand
  'explain',
  'describe',
  'summarize',
  'paraphrase',
  'classify',
  'compare',
  'contrast',
  'illustrate',
  // apply
  'apply',
  'compute',
  'solve',
  'use',
  'demonstrate',
  'implement',
  'calculate',
  'sketch',
  // analyze
  'analyze',
  'derive',
  'differentiate',
  'deconstruct',
  'diagnose',
  'examine',
  'prove',
  'verify',
  // evaluate
  'evaluate',
  'critique',
  'justify',
  'assess',
  'judge',
  'validate',
  'refute',
  // create
  'design',
  'construct',
  'create',
  'formulate',
  'propose',
  'write',
  'build',
  'compose',
] as const

/** Any measurable Bloom-taxonomy verb allowed in a lesson objective. */
export type BloomVerb = (typeof BLOOM_VERBS)[number]

/** True when `v` (case-insensitive, trimmed) is one of the Bloom verbs. */
export function isBloomVerb(v: string): v is BloomVerb {
  return (BLOOM_VERBS as readonly string[]).includes(v.trim().toLowerCase())
}

// ─── Generated course JSON (validated) ──────────────────────────────────────

export const lessonCardSpecSchema = z.object({
  format: z.enum(['basic', 'cloze', 'typein', 'mcq']),
  front: z.string().optional(),
  back: z.string().optional(),
  question: z.string().optional(),
  answer: z.string().optional(),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  text: z.string().optional(),
  answers: z.array(z.string()).optional(),
  hint: z.string().optional(),
})

/** One AI-generated lesson: title, Bloom objective and its card specs. */
export const generatedLessonSchema = z.object({
  title: z.string().min(1),
  objective: z.string().min(1),
  bloomVerb: z.string().min(1),
  type: z.string().optional(),
  cards: z.array(lessonCardSpecSchema).optional().default([]),
})

/** One AI-generated unit: a title and 1+ lessons. */
export const generatedUnitSchema = z.object({
  title: z.string().min(1),
  lessons: z.array(generatedLessonSchema).min(1),
})

/** Full AI-generated course payload (units + prerequisite-DAG skills). */
export const generatedCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  units: z.array(generatedUnitSchema).min(1),
  skills: z
    .array(
      z.object({
        name: z.string().min(1),
        requires: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
})

/** Parsed AI-generated course (see {@link generatedCourseSchema}). */
export type GeneratedCourse = z.infer<typeof generatedCourseSchema>
/** Parsed AI-generated unit (see {@link generatedUnitSchema}). */
export type GeneratedUnit = z.infer<typeof generatedUnitSchema>
/** Parsed AI-generated lesson (see {@link generatedLessonSchema}). */
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>
/** Parsed card spec inside a generated lesson (see {@link lessonCardSpecSchema}). */
export type LessonCardSpec = z.infer<typeof lessonCardSpecSchema>

/** Thrown by parseGeneratedCourse when the course JSON or Bloom rule fails. */
export class CourseParseError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message)
    this.name = 'CourseParseError'
  }
}

/**
 * Validate an AI-generated course JSON. Enforces the research rule: every
 * lesson objective carries exactly ONE measurable Bloom verb.
 * Throws CourseParseError with per-lesson issues when invalid.
 */
export function parseGeneratedCourse(json: unknown): GeneratedCourse {
  const parsed = generatedCourseSchema.safeParse(json)
  if (!parsed.success) {
    throw new CourseParseError(
      'Generated course does not match the required structure',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    )
  }
  const issues: string[] = []
  for (const [ui, unit] of parsed.data.units.entries()) {
    for (const [li, lesson] of unit.lessons.entries()) {
      if (!isBloomVerb(lesson.bloomVerb)) {
        // try to rescue: first word of the objective
        const first = lesson.objective.trim().split(/\W+/)[0] ?? ''
        if (isBloomVerb(first)) {
          lesson.bloomVerb = first
        } else {
          issues.push(
            `unit ${ui + 1} lesson ${li + 1} "${lesson.title}": bloomVerb "${lesson.bloomVerb}" is not a measurable Bloom verb`,
          )
        }
      }
    }
  }
  if (issues.length) {
    throw new CourseParseError('Lessons must each have one measurable Bloom-verb objective', issues)
  }
  return parsed.data
}

/** Prompt pair for course generation (system is COURSE_GENERATOR_SYSTEM in ai.ts). */
export function generateCoursePrompt(opts: { topic?: string; pdfText?: string; depth?: string }): {
  system: string
  prompt: string
} {
  // Keep the prompt text with the parser so schema and prompt can't drift.
  const depth = opts.depth ?? 'standard'
  const source = opts.pdfText
    ? `Source text (build the course FROM this material only):\n"""\n${opts.pdfText.slice(0, 24000)}\n"""`
    : `Topic: ${opts.topic ?? ''}`
  return {
    system: `You are a curriculum designer using backward design. Rules: (1) every lesson objective starts with exactly ONE measurable Bloom verb (define, explain, compute, derive, compare, evaluate, design…); (2) sequence prerequisites before applications; (3) 2-5 lessons per unit, 2-5 units; (4) each lesson gets 2-6 atomic card specs testing its objective; (5) when source text is given stay faithful to it; (6) list course skills as a DAG with prerequisite names. Return ONLY the JSON structure.`,
    prompt: `${source}\nDepth: ${depth} (light = 2 units, standard = 3-4, deep = 5).\n\nRespond with JSON: { "title", "description", "emoji", "units": [{ "title", "lessons": [{ "title", "objective", "bloomVerb", "type", "cards": [{ "format": "basic|cloze|typein|mcq", "front", "back", "question", "answer", "options", "correctIndex", "text", "answers", "hint" }] }] }], "skills": [{ "name", "requires": [string] }] }.`,
  }
}

// ─── DAG gating on BKT mastery ──────────────────────────────────────────────

export interface SkillEdgeInput {
  fromSkillId: number // prerequisite
  toSkillId: number // dependant
}

/** Minimal mastery row used for DAG-gating lookups. */
export interface MasteryInput {
  skillId: number
  pKnown: number
  attempts?: number
}

/**
 * Which skills are unlocked: a skill is available when EVERY prerequisite has
 * unlockProbability(pKnown) ≥ threshold (default 0.7 → pKnown ≈ 0.815).
 * Skills without prerequisites are always unlocked.
 * Returns the set of unlocked skill ids.
 */
export function unlockedSkills(
  skills: { id: number }[],
  edges: SkillEdgeInput[],
  masteryRows: MasteryInput[],
  threshold = 0.7,
): Set<number> {
  const pBySkill = new Map(masteryRows.map((m) => [m.skillId, m.pKnown]))
  const prereqs = new Map<number, number[]>()
  for (const e of edges) {
    const list = prereqs.get(e.toSkillId) ?? []
    list.push(e.fromSkillId)
    prereqs.set(e.toSkillId, list)
  }
  const unlocked = new Set<number>()
  for (const s of skills) {
    const reqs = prereqs.get(s.id) ?? []
    const ok = reqs.every((rid) => unlockProbability(pBySkill.get(rid) ?? 0.1) >= threshold)
    if (ok) unlocked.add(s.id)
  }
  return unlocked
}

/** Wrapper over the shared mastery ladder (types.ts). */
export function masteryLevel(pKnown: number, attempts: number): MasteryLevel {
  return masteryLevelFor(pKnown, attempts)
}

/** Mutable per-skill mastery counters (BKT + attempt/correct tallies). */
export interface MasteryState {
  pKnown: number
  attempts: number
  correct: number
}

/** Apply one review outcome to a mastery row via BKT (pure — caller persists). */
export function applyReviewToMastery(row: MasteryState, correct: boolean): MasteryState {
  return {
    pKnown: bktUpdate(row.pKnown, correct),
    attempts: row.attempts + 1,
    correct: row.correct + (correct ? 1 : 0),
  }
}

// ─── Exam countdown (spacing + weakest-first) ───────────────────────────────

export const CRAM_WARNING =
  'EXAM IN LESS THAN 7 DAYS — cramming mode. Spaced repetition cannot build new memories this fast: ' +
  'prioritize your WEAKEST skills only, do short high-intensity retrieval sessions (25 min max, frequent breaks), ' +
  'and sleep tonight — sleep consolidates what you retrieve today. Do NOT pull an all-nighter: it trades ' +
  'tomorrow\u2019s recall for tonight\u2019s anxiety.'

/** Skill mastery snapshot feeding the exam countdown planner. */
export interface ExamSkillMastery extends MasteryInput {
  name?: string
}

/** One planned study day before an exam (weakest-first focus skills). */
export interface ExamDayPlan {
  date: string // YYYY-MM-DD
  daysUntilExam: number
  focusSkills: { skillId: number; name: string; pKnown: number; minutes: number }[]
  mockExam: boolean
  expressiveWriting: boolean
}

/** Full exam countdown: per-day plans plus the cram-mode warning. */
export interface ExamCountdownPlan {
  daysLeft: number
  cramWarning: boolean
  warning: string | null
  days: ExamDayPlan[]
  /**
   * Cepeda optimal-gap window (10–20 % of the retention interval, Cepeda et
   * al. 2006/2008) — how far apart reviews for THIS exam should be. Null when
   * the interval is too short to space (≤ 2 days; cram mode applies).
   */
  optimalGap: { minDays: number; maxDays: number; recommendedDays: number } | null
}

/**
 * Optimal study gap for a retention interval (Cepeda 2006 meta + Cepeda 2008:
 * spacing ≈ 10–20 % of the interval, e.g. exam in 30 days → review every 3–6
 * days). Returns null for intervals too short to space.
 */
export function optimalGapDays(retentionDays: number): {
  minDays: number
  maxDays: number
  recommendedDays: number
} | null {
  if (!Number.isFinite(retentionDays)) return null
  const maxDays = Math.ceil(retentionDays * 0.2)
  // below ~9 days the window collapses to "study daily" — cram territory
  if (maxDays < 2) return null
  return {
    minDays: Math.max(1, Math.floor(retentionDays * 0.1)),
    maxDays,
    recommendedDays: Math.max(
      2,
      Math.round((Math.max(1, Math.floor(retentionDays * 0.1)) + maxDays) / 2),
    ),
  }
}

/**
 * Daily study plan from today (exclusive) to the exam: skills ordered
 * weakest-first (lowest pKnown), rotated across days so coverage varies while
 * the weakest keep appearing. Day before the exam: light review + expressive
 * writing (Ramirez & Beilock). Mock exam mid-way when ≥ 6 days remain.
 */
export function examCountdownPlan(
  examDate: string | Date,
  skillMastery: ExamSkillMastery[],
  today: Date = new Date(),
  minutesPerDay = 45,
): ExamCountdownPlan {
  const exam = typeof examDate === 'string' ? new Date(examDate) : examDate
  const msLeft = exam.getTime() - today.getTime()
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS))
  const cramWarning = daysLeft < 7 && daysLeft >= 0
  const ordered = [...skillMastery].sort((a, b) => a.pKnown - b.pKnown || a.skillId - b.skillId)
  const days: ExamDayPlan[] = []
  for (let d = 1; d <= daysLeft; d++) {
    const date = new Date(today.getTime() + d * DAY_MS)
    // rotate the weakest-first list so each day leads with a different skill
    const rotation = ordered.length ? (d - 1) % ordered.length : 0
    const rotated = ordered.length
      ? [...ordered.slice(rotation), ...ordered.slice(0, rotation)]
      : []
    const focusSkills = rotated.slice(0, 3).map((s) => ({
      skillId: s.skillId,
      name: s.name ?? `skill ${s.skillId}`,
      pKnown: s.pKnown,
      minutes: Math.max(10, Math.round(minutesPerDay / Math.max(1, Math.min(3, rotated.length)))),
    }))
    days.push({
      date: dateKeyOf(date),
      daysUntilExam: daysLeft - d,
      focusSkills,
      mockExam: d === Math.max(1, Math.floor(daysLeft / 2)) && daysLeft >= 6,
      expressiveWriting: d === daysLeft,
    })
  }
  return {
    daysLeft,
    cramWarning,
    warning: cramWarning ? CRAM_WARNING : null,
    days,
    optimalGap: optimalGapDays(daysLeft),
  }
}

// ─── Mock exam construction ─────────────────────────────────────────────────

export interface MockCard {
  id: number
  type: CardFormat
  content: CardContent
  skillId?: number | null
  deckId?: number
}

/** One exam question rendered from a card, with grading keys attached. */
export interface MockQuestion {
  index: number
  cardId: number
  format: CardFormat
  prompt: string
  options?: string[]
  /** grading keys — hidden from the exam-taker view by the UI */
  answers: string[]
  correctIndex?: number
  skillId?: number | null
  points: number
}

/** A complete mock exam: timed questions, points and format-match flag. */
export interface MockExam {
  title: string
  minutes: number
  formatMatch: boolean
  questions: MockQuestion[]
  totalPoints: number
}

/** Rough per-format time cost in minutes. */
const FORMAT_MINUTES: Record<string, number> = {
  basic: 1,
  cloze: 1.25,
  mcq: 1.5,
  typein: 2,
  proof_step: 3,
  grammar: 1.25,
  matching: 1.5,
  occlusion: 1,
  exercise: 2,
}

function questionFromCard(card: MockCard, formatMatch: boolean): MockQuestion | null {
  const c = card.content
  const base = { index: 0, cardId: card.id, skillId: card.skillId ?? null, points: 1 }
  switch (card.type) {
    case 'basic':
      if (!c.basic) return null
      return { ...base, format: 'basic', prompt: c.basic.front, answers: [c.basic.back] }
    case 'cloze':
      if (!c.cloze) return null
      return { ...base, format: 'cloze', prompt: c.cloze.text, answers: c.cloze.answers }
    case 'mcq':
      if (!c.mcq) return null
      return {
        ...base,
        format: 'mcq',
        prompt: c.mcq.question,
        options: c.mcq.options,
        correctIndex: c.mcq.correctIndex,
        answers: [c.mcq.options[c.mcq.correctIndex] ?? ''],
      }
    case 'typein':
      if (!c.typein) return null
      return {
        ...base,
        format: 'typein',
        prompt: c.typein.question,
        answers: c.typein.acceptedAnswers,
      }
    case 'proof_step':
      if (!c.proof_step) return null
      return {
        ...base,
        format: 'proof_step',
        prompt: `Justify step ${c.proof_step.stepIndex + 1} of the proof of: ${c.proof_step.theorem}\n\n${c.proof_step.proofSteps[c.proof_step.stepIndex] ?? ''}`,
        answers: [c.proof_step.justification],
      }
    case 'grammar':
      if (!c.grammar) return null
      return {
        ...base,
        format: 'grammar',
        prompt:
          c.grammar.sentence.replace(c.grammar.target, '____') +
          (c.grammar.translation ? `\n(${c.grammar.translation})` : ''),
        answers: [c.grammar.target],
      }
    case 'matching': {
      if (!c.matching) return null
      if (!formatMatch) return null // pair sets only appear in format-matched exams
      return {
        ...base,
        format: 'matching',
        prompt: `Match each item:\n${c.matching.pairs.map((p, i) => `${i + 1}. ${p.left}`).join('\n')}`,
        answers: c.matching.pairs.map((p) => `${p.left} → ${p.right}`),
      }
    }
    case 'exercise': {
      if (!c.exercise) return null
      // Only exercises with short exact answers fit an exam paper.
      const t = exerciseToText(c.exercise)
      if (t.answers.length === 0) return null
      return { ...base, format: 'exercise', prompt: t.front, answers: t.answers }
    }
    case 'occlusion':
      return null // image-based — not exam-paper friendly
    default:
      return null
  }
}

/**
 * Build an exam paper from cards under a time budget. formatMatch=true keeps
 * native formats (mcq shows options, matching stays pairing); false renders
 * everything as plain written-answer questions. Selection is greedy in deck
 * order until the time budget is exhausted (deterministic).
 */
export function buildMockExam(
  cards: MockCard[],
  opts: { minutes?: number; formatMatch?: boolean; title?: string } = {},
): MockExam {
  const minutes = Math.max(0, opts.minutes ?? 30)
  const formatMatch = opts.formatMatch ?? true
  const questions: MockQuestion[] = []
  let used = 0
  for (const card of cards) {
    const q = questionFromCard(card, formatMatch)
    if (!q) continue
    const cost = FORMAT_MINUTES[q.format] ?? 1.5
    if (used + cost > minutes) continue
    q.index = questions.length
    questions.push(q)
    used += cost
  }
  return {
    title: opts.title ?? 'Mock exam',
    minutes,
    formatMatch,
    questions,
    totalPoints: questions.length,
  }
}

// ─── Expressive writing (Ramirez & Beilock 2011) ────────────────────────────

export const EXPRESSIVE_WRITING_PROMPT = `Before you begin, take the next 10 minutes to write — as freely and continuously as you can — about your thoughts and feelings regarding this exam. What worries you? What are you afraid might happen? What is at stake? Don't worry about spelling, grammar, or structure: put the worries on the page so your working memory doesn't carry them into the exam. (Ramirez & Beilock: a 10-minute expressive writing bout before a high-stakes test significantly improves scores for anxious students.)`

/** The Ramirez & Beilock pre-exam expressive-writing prompt. */
export function expressiveWritingPrompt(): string {
  return EXPRESSIVE_WRITING_PROMPT
}

// ─── Backward design (Wiggins & McTighe) ────────────────────────────────────

export interface BackwardDesignSkeleton {
  outcome: string
  stage1: { bigIdeas: string[]; essentialQuestions: string[]; objectives: string[] }
  stage2: { formative: string[]; summative: string[] }
  stage3: { title: string; objective: string; bloomVerb: string }[]
}

/**
 * Deterministic backward-design skeleton: outcomes → acceptable evidence →
 * learning plan. The AI (or the learner) fills in content; the structure here
 * enforces "design the assessment before the lessons".
 */
export function backwardDesign(opts: {
  outcomeVerb: string
  topic: string
}): BackwardDesignSkeleton {
  const verb = opts.outcomeVerb.trim().toLowerCase()
  const topic = opts.topic.trim()
  return {
    outcome: `Students will be able to ${verb} ${topic}.`,
    stage1: {
      bigIdeas: [
        `What is the transferable core of ${topic}?`,
        `How does ${topic} connect to what learners already know?`,
      ],
      essentialQuestions: [
        `Why does ${topic} matter beyond this course?`,
        `What distinguishes expert from novice thinking about ${topic}?`,
        `What evidence would convince a skeptic that someone truly understands ${topic}?`,
      ],
      objectives: [
        `Define the key terms of ${topic} (define).`,
        `Explain how ${topic} works, in own words (explain).`,
        `Apply ${topic} to a novel problem (apply).`,
        `Critique a flawed application of ${topic} (critique).`,
      ],
    },
    stage2: {
      formative: [
        'Daily retrieval warm-ups on the previous lesson (4-6 cards)',
        'One Feynman teach-back per unit (graded for misconceptions)',
        'Exit ticket: one self-generated exam-style question',
      ],
      summative: [
        `Mock exam mixing ${topic} formats under time pressure`,
        `Transfer task: apply ${topic} to an unseen, real-world case`,
      ],
    },
    stage3: [
      {
        title: `${topic}: core vocabulary`,
        objective: `Define the key terms of ${topic}`,
        bloomVerb: 'define',
      },
      {
        title: `${topic}: the mechanism`,
        objective: `Explain how ${topic} works`,
        bloomVerb: 'explain',
      },
      {
        title: `${topic}: worked applications`,
        objective: `Apply ${topic} to standard problems`,
        bloomVerb: 'apply',
      },
      {
        title: `${topic}: transfer and edge cases`,
        objective: `Apply ${topic} to a novel situation`,
        bloomVerb: 'apply',
      },
      {
        title: `${topic}: critique`,
        objective: `Critique a flawed use of ${topic}`,
        bloomVerb: 'critique',
      },
    ],
  }
}
