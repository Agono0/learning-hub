/**
 * Course quality checks that `validateLhcf` does not make. Cycles, unknown
 * skills and malformed fields stay with the validator; these are about whether
 * the course can be planned and followed.
 */
import { analyzeGraph } from './graph'
import type { CourseModel } from './model'

export type Severity = 'warning' | 'info'

export type LintCode =
  | 'duplicate-lesson-slug'
  | 'unknown-skill-ref'
  | 'lesson-without-skills'
  | 'skill-never-trained'
  | 'lesson-without-estimate'
  | 'lesson-too-long'
  | 'chain-too-deep'
  | 'prerequisite-taught-later'

export interface LintFinding {
  code: LintCode
  severity: Severity
  /** Lesson or skill slug the finding is about. */
  subject: string
  message: string
  hint: string
}

export interface LintOptions {
  /** Warn above this many minutes (default 90). */
  maxLessonMinutes?: number
  /** Warn when a skill needs a chain longer than this (default 5). */
  maxChainDepth?: number
}

export function lintCourse(model: CourseModel, options: LintOptions = {}): LintFinding[] {
  const maxMinutes = options.maxLessonMinutes ?? 90
  const maxDepth = options.maxChainDepth ?? 5
  const out: LintFinding[] = []
  const graph = analyzeGraph(model)

  const seen = new Set<string>()
  for (const l of model.lessons) {
    if (seen.has(l.slug)) {
      out.push({
        code: 'duplicate-lesson-slug',
        severity: 'warning',
        subject: l.slug,
        message: `Lesson slug "${l.slug}" is used more than once.`,
        hint: 'Progress is saved per lesson slug, so repeats share one status. Give each lesson its own slug.',
      })
    }
    seen.add(l.slug)
  }

  for (const slug of model.unknownSkillRefs) {
    out.push({
      code: 'unknown-skill-ref',
      severity: 'warning',
      subject: slug,
      message: `"${slug}" is used as a skill but is not declared in skills.`,
      hint: 'Declare the skill or fix the slug. It is ignored in planning until then.',
    })
  }

  const trained = new Set<number>()
  for (const l of model.lessons) {
    for (const s of l.skillIds) trained.add(s)
    if (!l.skillIds.length) {
      out.push({
        code: 'lesson-without-skills',
        severity: 'info',
        subject: l.slug,
        message: `"${l.title}" trains no skill, so it never gates or unlocks anything.`,
        hint: 'Add the skills it covers to the lesson if it should count toward mastery.',
      })
    }
    if (l.estimated) {
      out.push({
        code: 'lesson-without-estimate',
        severity: 'info',
        subject: l.slug,
        message: `"${l.title}" has no estMinutes; plans assume the default.`,
        hint: 'Set estMinutes so deadline plans are honest.',
      })
    } else if (l.minutes > maxMinutes) {
      out.push({
        code: 'lesson-too-long',
        severity: 'warning',
        subject: l.slug,
        message: `"${l.title}" is ${l.minutes} minutes, over ${maxMinutes}.`,
        hint: 'Split it into shorter lessons so each can be finished in one sitting.',
      })
    }
  }

  for (const s of model.skills) {
    if (!trained.has(s.id)) {
      out.push({
        code: 'skill-never-trained',
        severity: 'warning',
        subject: s.slug,
        message: `Skill "${s.name}" is not trained by any lesson.`,
        hint: 'Add it to a lesson, or remove it. Nothing in the course can raise its mastery.',
      })
    }
    const d = graph.depth.get(s.id) ?? 0
    if (d > maxDepth) {
      out.push({
        code: 'chain-too-deep',
        severity: 'info',
        subject: s.slug,
        message: `Skill "${s.name}" sits at the end of a ${d}-step prerequisite chain.`,
        hint: 'Long chains lock a lot of the course early. Check each link is a real dependency.',
      })
    }
  }

  // a lesson placed before every lesson that trains one of its prerequisite skills
  for (const l of model.lessons) {
    const late = new Set<number>()
    for (const s of l.skillIds) {
      for (const p of model.prereqs.get(s) ?? []) {
        const teachers = model.lessons.filter((x) => x.skillIds.includes(p))
        if (teachers.length && teachers.every((x) => x.id > l.id)) late.add(p)
      }
    }
    if (late.size) {
      const names = [...late].map((id) => model.skills[id - 1]!.slug).join(', ')
      out.push({
        code: 'prerequisite-taught-later',
        severity: 'warning',
        subject: l.slug,
        message: `"${l.title}" comes before every lesson that trains its prerequisite skill(s): ${names}.`,
        hint: 'Move it after those lessons, or learners will see it soft-locked.',
      })
    }
  }
  return out
}
