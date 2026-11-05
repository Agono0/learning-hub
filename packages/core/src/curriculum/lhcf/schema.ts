/**
 * LHCF — the Learning HUB Curriculum Format, version 1.
 *
 * A portable, AI-friendly description of a whole course, modelled on how the
 * best platforms teach (Coursera: modules of lessons with outcomes; Hyperskill:
 * theory → practice → projects in stages, gated by prerequisite topics):
 *
 *   course
 *   ├── skills[]          the prerequisite graph (BKT mastery per skill)
 *   ├── modules[]
 *   │   └── lessons[]     theory → worked examples → exercises → reflection
 *   ├── projects[]        hands-on, in stages (Hyperskill-style)
 *   └── finalExam         exercises + pass score → certificate
 *
 * PUBLIC CONTRACT (other people's AIs produce it): additive changes only
 * within `lhcf: 1`. Published as JSON Schema at docs/curriculum/lhcf.schema.json.
 * Design record: docs/adr/0003-curriculum-format-lhcf.md.
 */
import { z } from 'zod'
import { exerciseSchema } from '../../practice/schema'

/** Current format version. */
export const LHCF_VERSION = 1 as const

/** kebab-case identifier, stable across re-imports (the upsert key). */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'use lowercase letters, digits and dashes (e.g. "intro-to-sql")',
  )

const md = (max: number) => z.string().trim().max(max)

/** An external resource (article, video, book…). Only http(s) links. */
export const resourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'only http(s) links are allowed'),
  kind: z.enum(['article', 'video', 'book', 'course', 'tool', 'paper', 'other']).optional(),
})

/** One section of lesson theory (Markdown + KaTeX math). */
export const theorySectionSchema = z.object({
  heading: z.string().trim().max(200).optional(),
  body: md(20000).min(1),
})

/**
 * A worked example — the most effective way to teach novices a procedure
 * (worked-example effect, Sweller & Cooper 1985): problem, explicit steps, answer.
 */
export const workedExampleSchema = z.object({
  title: z.string().trim().max(200).optional(),
  problem: md(8000).min(1),
  steps: z.array(md(4000).min(1)).min(1).max(30),
  answer: md(4000).optional(),
})

/** A key term with its definition (feeds the glossary and term cards). */
export const keyTermSchema = z.object({
  term: z.string().trim().min(1).max(200),
  definition: md(2000).min(1),
})

/** Lesson kinds — drive the lesson player layout and icons. */
export const LESSON_TYPES = [
  'concept',
  'practice',
  'reading',
  'video',
  'project',
  'review',
] as const

/** The atomic unit of study. */
export const lessonSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  /** Measurable outcome starting with a Bloom verb: "Explain…", "Implement…". */
  objective: z.string().trim().min(1).max(500),
  type: z.enum(LESSON_TYPES).default('concept'),
  /** Estimated study time in minutes. */
  estMinutes: z.number().int().min(1).max(600).optional(),
  /** Slugs of course skills this lesson trains. */
  skills: z.array(slugSchema).max(10).default([]),
  /** Optional advance organizer / pre-reading summary (shown first). */
  summary: md(4000).optional(),
  theory: z.array(theorySectionSchema).max(30).default([]),
  workedExamples: z.array(workedExampleSchema).max(20).default([]),
  keyTerms: z.array(keyTermSchema).max(50).default([]),
  resources: z.array(resourceSchema).max(30).default([]),
  /** Practice — every exercise becomes a scheduled review card. */
  exercises: z.array(exerciseSchema).max(60).default([]),
  /** Self-explanation / elaboration prompts answered after practice. */
  reflection: z.array(z.string().trim().min(1).max(1000)).max(10).default([]),
})

/** A group of lessons (a "week" or "unit"). */
export const moduleSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: md(4000).optional(),
  lessons: z.array(lessonSchema).min(1).max(60),
})

/** A node of the prerequisite graph. */
export const skillSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: md(1000).optional(),
  /** Slugs of skills that must be mastered first. */
  requires: z.array(slugSchema).max(20).default([]),
})

/** One stage of a project — a shippable increment (Hyperskill-style). */
export const projectStageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: md(8000).min(1),
  /** Concrete acceptance checklist the learner ticks off. */
  checklist: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  estMinutes: z.number().int().min(1).max(6000).optional(),
})

/** A hands-on project built in stages. */
export const projectSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: md(8000).min(1),
  skills: z.array(slugSchema).max(20).default([]),
  stages: z.array(projectStageSchema).min(1).max(20),
})

/** Final assessment; passing it (plus the rules below) earns the certificate. */
export const finalExamSchema = z.object({
  /** Fraction of points needed to pass (0..1). */
  passScore: z.number().min(0).max(1).default(0.8),
  /** Suggested time limit in minutes. */
  minutes: z.number().int().min(1).max(600).optional(),
  exercises: z.array(exerciseSchema).min(1).max(100),
})

/** What a learner must complete to earn the certificate. */
export const certificateRulesSchema = z.object({
  /** Fraction of lessons that must be completed (0..1). */
  minLessonCompletion: z.number().min(0).max(1).default(1),
  /** Require passing the final exam (ignored when the course has none). */
  requireFinalExam: z.boolean().default(true),
  /** Require completing every project stage. */
  requireProjects: z.boolean().default(true),
})

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

/** A complete course — the LHCF document. */
export const lhcfCourseSchema = z.object({
  /** Format version marker — always 1 for this schema. */
  lhcf: z.literal(LHCF_VERSION),
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).optional(),
  description: md(8000).optional(),
  emoji: z.string().trim().max(8).optional(),
  /** Groups courses on the catalog (e.g. "Data Science"); a track is created on import. */
  track: z.string().trim().min(1).max(120).optional(),
  level: z.enum(LEVELS).optional(),
  /** BCP-47 language tag of the content, e.g. "en", "ar", "pt-BR". */
  language: z.string().trim().max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  /** Total estimated hours (shown on the overview). */
  estHours: z.number().min(0).max(2000).optional(),
  /** "By the end you will be able to…" — measurable outcomes. */
  outcomes: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  /** Prior knowledge expected (free text). */
  prerequisites: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  audience: z.string().trim().max(500).optional(),
  author: z.string().trim().max(200).optional(),
  /** Who/what produced it — e.g. "Claude", "ChatGPT", "hand-written". */
  generatedBy: z.string().trim().max(200).optional(),
  /** Content version of THIS course (free text, e.g. "1.2"). */
  version: z.string().trim().max(40).optional(),
  skills: z.array(skillSchema).max(200).default([]),
  modules: z.array(moduleSchema).min(1).max(50),
  projects: z.array(projectSchema).max(20).default([]),
  finalExam: finalExamSchema.optional(),
  certificate: certificateRulesSchema.default({
    minLessonCompletion: 1,
    requireFinalExam: true,
    requireProjects: true,
  }),
})

/** A validated, defaults-applied LHCF course. */
export type LhcfCourse = z.infer<typeof lhcfCourseSchema>
/** The input shape (before defaults) — what authors and AIs write. */
export type LhcfCourseInput = z.input<typeof lhcfCourseSchema>
export type LhcfModule = LhcfCourse['modules'][number]
export type LhcfLesson = LhcfModule['lessons'][number]
export type LhcfSkill = LhcfCourse['skills'][number]
export type LhcfProject = LhcfCourse['projects'][number]
