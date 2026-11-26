/**
 * Objective ↔ exercise alignment.
 *
 * For each lesson objective and each course outcome we ask a narrow question:
 * "does any exercise share this objective's skill link or content terms?"
 * The answer is a lexical overlap score, not a judgment of fit. A course that
 * teaches by analogy or uses synonyms will score low even when it is fine.
 */
import type { Exercise } from '../../practice/schema'
import { exerciseToText } from '../../practice/to-text'
import type { LhcfCourse } from '../lhcf/schema'
import { BLOOM_LEVELS, bloomRank, formatCanReach, readObjective, type BloomLevel } from './bloom'
import { indexCourse, type CourseIndex, type IndexedExercise } from './course-index'
import { containment, sharedTerms, termSet, termSetOf } from './terms'
import { clip, finding, pct, type Finding, type RuleInfo } from './types'

/** Overlap at or above this counts as a match for a lesson's own exercises. */
export const ALIGN_MATCH_THRESHOLD = 0.34
/** Lower bar for matching a course outcome to a lesson (objectives are short). */
export const OUTCOME_MATCH_THRESHOLD = 0.4

export type MatchBasis = 'skill' | 'terms' | 'skill+terms' | 'none'

export interface AlignmentCell {
  exercisePath: string
  /** 0..1 overlap of the objective's terms with the exercise text. */
  score: number
  basis: MatchBasis
  matched: boolean
  shared: string[]
}

export interface ObjectiveRow {
  lessonSlug: string
  lessonPath: string
  objective: string
  verb: string
  level: BloomLevel | null
  /** Cells for this lesson's own exercises, in order. */
  cells: AlignmentCell[]
  matchedCount: number
  /** Matched exercises whose format can reach the objective's level. */
  reachingCount: number
  /** Final exam exercises that overlap the objective's terms. */
  examMatches: string[]
}

export interface OutcomeRow {
  outcome: string
  path: string
  /** Lessons whose objective or title overlaps, best first. */
  lessons: { slug: string; score: number; shared: string[] }[]
  /** Final exam exercises that overlap. */
  examMatches: string[]
  covered: boolean
}

export interface AlignmentMatrix {
  rows: ObjectiveRow[]
  outcomes: OutcomeRow[]
  /** Exercises (lesson only) that match none of their own lesson's objective terms or skills. */
  offObjective: IndexedExercise[]
  /** Counts of lesson objectives by Bloom level (`null` level counted under `unknown`). */
  levelCounts: Record<BloomLevel | 'unknown', number>
}

export function exerciseTerms(e: Exercise): Set<string> {
  const t = exerciseToText(e)
  const extra: string[] = []
  if (e.type === 'code') extra.push(e.language)
  if (e.skill) extra.push(e.skill)
  return termSetOf([e.prompt, t.front, t.back, e.explanation, e.hint, ...extra])
}

function skillMatches(exSkill: string | undefined, lessonSkills: readonly string[]): boolean {
  if (!exSkill) return false
  const wanted = exSkill.trim().toLowerCase()
  return lessonSkills.some((s) => s.toLowerCase() === wanted || s.replace(/-/g, ' ') === wanted)
}

/** Build the alignment matrix for a validated course. */
export function alignCourse(
  course: LhcfCourse,
  index: CourseIndex = indexCourse(course),
): AlignmentMatrix {
  const examExercises = index.exercises.filter((e) => e.home.kind === 'finalExam')
  const examTerms = examExercises.map((e) => ({ e, terms: exerciseTerms(e.exercise) }))
  const skillNames = new Map(course.skills.map((s) => [s.slug, s.name.toLowerCase()]))

  const rows: ObjectiveRow[] = []
  const offObjective: IndexedExercise[] = []
  const levelCounts = Object.fromEntries([...BLOOM_LEVELS, 'unknown'].map((l) => [l, 0])) as Record<
    BloomLevel | 'unknown',
    number
  >

  for (const il of index.lessons) {
    const { lesson } = il
    const reading = readObjective(lesson.objective)
    levelCounts[reading.level ?? 'unknown'] += 1
    const objTerms = termSet(reading.object || lesson.objective)
    const skillLabels = lesson.skills.flatMap((s) => [s, skillNames.get(s) ?? ''])
    const own = index.exercises.filter(
      (e) => e.lessonSlug === lesson.slug && e.home.kind === 'lesson',
    )
    const cells: AlignmentCell[] = own.map((ie) => {
      const terms = exerciseTerms(ie.exercise)
      const score = containment(objTerms, terms)
      const bySkill = skillMatches(ie.exercise.skill, skillLabels.filter(Boolean))
      const byTerms = score >= ALIGN_MATCH_THRESHOLD
      const basis: MatchBasis =
        bySkill && byTerms ? 'skill+terms' : bySkill ? 'skill' : byTerms ? 'terms' : 'none'
      return {
        exercisePath: ie.path,
        score: Math.round(score * 100) / 100,
        basis,
        matched: basis !== 'none',
        shared: sharedTerms(objTerms, terms),
      }
    })
    own.forEach((ie, i) => {
      if (!cells[i]!.matched) offObjective.push(ie)
    })
    const matchedExercises = own.filter((_, i) => cells[i]!.matched)
    const reachingCount = reading.level
      ? matchedExercises.filter((ie) => formatCanReach(ie.exercise.type, reading.level!)).length
      : matchedExercises.length
    const examMatches = examTerms
      .filter(({ terms }) => containment(objTerms, terms) >= ALIGN_MATCH_THRESHOLD)
      .map(({ e }) => e.path)
    rows.push({
      lessonSlug: lesson.slug,
      lessonPath: il.path,
      objective: lesson.objective,
      verb: reading.verb,
      level: reading.level,
      cells,
      matchedCount: cells.filter((c) => c.matched).length,
      reachingCount,
      examMatches,
    })
  }

  const outcomes: OutcomeRow[] = course.outcomes.map((outcome, i) => {
    const reading = readObjective(outcome)
    const terms = termSet(reading.object || outcome)
    const lessons = index.lessons
      .map((il) => {
        const lt = termSetOf([
          il.lesson.objective,
          il.lesson.title,
          ...il.lesson.keyTerms.map((k) => k.term),
        ])
        return {
          slug: il.lesson.slug,
          score: containment(terms, lt),
          shared: sharedTerms(terms, lt),
        }
      })
      .filter((l) => l.score >= OUTCOME_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
      .slice(0, 5)
      .map((l) => ({ ...l, score: Math.round(l.score * 100) / 100 }))
    const examMatches = examTerms
      .filter(({ terms: t }) => containment(terms, t) >= ALIGN_MATCH_THRESHOLD)
      .map(({ e }) => e.path)
    return { outcome, path: `outcomes[${i}]`, lessons, examMatches, covered: lessons.length > 0 }
  })

  return { rows, outcomes, offObjective, levelCounts }
}

export const ALIGNMENT_RULES: RuleInfo[] = [
  {
    ruleId: 'align.objective-no-exercises',
    title: 'Lesson has an objective but no exercises',
    severity: 'notice',
    measures: 'Count of exercises inside the lesson.',
    falsePositive:
      'Reading, video or project lessons may practice through a project stage or the final exam instead.',
  },
  {
    ruleId: 'align.objective-unmatched',
    title: 'No exercise overlaps the objective',
    severity: 'notice',
    measures:
      'Shared stemmed terms between the objective and each exercise, or a shared skill link.',
    falsePositive:
      'Synonyms, translated content and objectives phrased abstractly score low even when practice fits.',
  },
  {
    ruleId: 'align.level-below-objective',
    title: 'Exercise formats sit below the objective verb',
    severity: 'info',
    measures: 'Objective verb level versus the highest level each matched format usually reaches.',
    falsePositive:
      'A carefully written multiple choice item can test analysis; the format ceiling is a rough guide.',
  },
  {
    ruleId: 'align.exercise-off-objective',
    title: 'Exercise shares nothing with its lesson objective',
    severity: 'info',
    measures: 'Term overlap and skill link between one exercise and its lesson objective.',
    falsePositive: 'Review or interleaved items are meant to sit outside the lesson topic.',
  },
  {
    ruleId: 'align.outcome-uncovered',
    title: 'Course outcome matches no lesson',
    severity: 'warning',
    measures: 'Term overlap between the outcome and each lesson objective, title and key terms.',
    falsePositive:
      'An outcome worded at a higher level than any lesson can still be met by the whole course.',
  },
  {
    ruleId: 'align.outcome-not-assessed',
    title: 'Course outcome has no matching final exam item',
    severity: 'info',
    measures: 'Term overlap between the outcome and final exam exercises.',
    falsePositive: 'Projects may assess the outcome instead of the exam.',
  },
]

/** Turn an alignment matrix into findings. */
export function alignmentFindings(
  course: LhcfCourse,
  matrix: AlignmentMatrix = alignCourse(course),
): Finding[] {
  const out: Finding[] = []
  for (const row of matrix.rows) {
    if (row.cells.length === 0) {
      out.push(
        finding({
          ruleId: 'align.objective-no-exercises',
          severity: 'notice',
          path: `${row.lessonPath}.exercises`,
          message: `"${clip(row.objective, 60)}" has no exercises in its lesson.`,
          evidence: `0 exercises; ${row.examMatches.length} final exam item(s) overlap the objective.`,
          falsePositive:
            'Reading, video or project lessons may be practiced elsewhere. Dismiss if that is intended.',
          suggestion:
            'Add one production exercise (type-in, cloze or code) that uses the objective wording.',
        }),
      )
      continue
    }
    if (row.matchedCount === 0) {
      const best = [...row.cells].sort((a, b) => b.score - a.score)[0]!
      out.push(
        finding({
          ruleId: 'align.objective-unmatched',
          severity: 'notice',
          path: row.lessonPath,
          message: `None of the ${row.cells.length} exercises overlaps the objective "${clip(row.objective, 60)}".`,
          evidence: `Best overlap ${pct(best.score * 100, 100)} (needs ${pct(ALIGN_MATCH_THRESHOLD * 100, 100)}) at ${best.exercisePath}.`,
          falsePositive:
            'Synonyms or a different language can hide a real match. Link the exercise skill to the lesson skills to override.',
          suggestion:
            'Reword the objective or an exercise so they use the same key terms, or set the exercise skill.',
        }),
      )
    } else if (row.level && row.reachingCount === 0 && bloomRank(row.level) >= 3) {
      out.push(
        finding({
          ruleId: 'align.level-below-objective',
          severity: 'info',
          path: row.lessonPath,
          message: `Objective verb "${row.verb}" is level ${row.level}, but matched exercise formats usually stop lower.`,
          evidence: `Matched formats: ${matchedFormats(row, matrix, course).join(', ')}.`,
          falsePositive:
            'A strong multiple choice or cloze item can test applied skills. This only compares format names.',
          suggestion: 'Consider a production format (numeric, code, free text) for this objective.',
        }),
      )
    }
  }
  for (const ie of matrix.offObjective) {
    const row = matrix.rows.find((r) => r.cells.some((c) => c.exercisePath === ie.path))
    if (!row || row.matchedCount === 0) continue // already reported at lesson level
    out.push(
      finding({
        ruleId: 'align.exercise-off-objective',
        severity: 'info',
        path: ie.path,
        message: 'This exercise shares no terms or skill with the lesson objective.',
        evidence: `Objective: "${clip(row.objective, 70)}". Exercise: "${clip(ie.exercise.prompt, 70)}".`,
        falsePositive: 'Review items from earlier lessons are expected to look unrelated.',
      }),
    )
  }
  for (const o of matrix.outcomes) {
    if (!o.covered) {
      out.push(
        finding({
          ruleId: 'align.outcome-uncovered',
          severity: 'warning',
          path: o.path,
          message: `Outcome "${clip(o.outcome, 70)}" does not overlap any lesson objective or title.`,
          evidence: `Checked ${course.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons at ${pct(OUTCOME_MATCH_THRESHOLD * 100, 100)} overlap.`,
          falsePositive:
            'Broad outcomes may be met by several lessons together without sharing words with any one.',
          suggestion: 'Add a lesson for it, or reword the outcome with the course vocabulary.',
        }),
      )
    } else if (course.finalExam && o.examMatches.length === 0) {
      out.push(
        finding({
          ruleId: 'align.outcome-not-assessed',
          severity: 'info',
          path: o.path,
          message: `Outcome "${clip(o.outcome, 70)}" has no overlapping final exam item.`,
          evidence: `Lessons matched: ${o.lessons.map((l) => l.slug).join(', ')}.`,
          falsePositive: 'A project may be the assessment for this outcome.',
        }),
      )
    }
  }
  return out
}

function matchedFormats(row: ObjectiveRow, matrix: AlignmentMatrix, course: LhcfCourse): string[] {
  const index = indexCourse(course)
  const types = new Set<string>()
  for (const c of row.cells) {
    if (!c.matched) continue
    const ie = index.exercises.find((e) => e.path === c.exercisePath)
    if (ie) types.add(ie.exercise.type)
  }
  void matrix
  return [...types].sort()
}

/** A dense numeric grid for the heatmap: rows are lessons, columns are Bloom levels. */
export function levelGrid(matrix: AlignmentMatrix): { levels: BloomLevel[]; counts: number[] } {
  return {
    levels: [...BLOOM_LEVELS],
    counts: BLOOM_LEVELS.map((l) => matrix.levelCounts[l]),
  }
}
