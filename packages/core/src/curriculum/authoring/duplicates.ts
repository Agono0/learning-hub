/**
 * Duplicate and overlap detection across a course.
 *
 * Near-duplicate exercises waste practice time, and a final exam item that
 * copies a lesson item tests memory of the item, not of the skill. Scores come
 * from word shingles and the core linter's bigram similarity, so reworded
 * duplicates can slip through and honest repetition (spaced review) can match.
 */
import { exerciseToText } from '../../practice/to-text'
import type { LhcfCourse } from '../lhcf/schema'
import { indexCourse, type CourseIndex, type IndexedExercise } from './course-index'
import { jaccard, shingles, termSet, textSimilarity } from './terms'
import { clip, finding, type Finding, type RuleInfo } from './types'

export const DUPLICATE_THRESHOLD = 0.82
export const EXAM_OVERLAP_THRESHOLD = 0.7

export interface DuplicatePair {
  a: IndexedExercise
  b: IndexedExercise
  score: number
  sameAnswer: boolean
}

export interface DuplicateOptions {
  threshold?: number
  /** Maximum pairs to return (highest scores first). */
  limit?: number
}

function questionKey(ie: IndexedExercise): string {
  const t = exerciseToText(ie.exercise)
  return `${ie.exercise.type === 'truefalse' ? 'tf' : ''} ${t.front}`
}

function answerKey(ie: IndexedExercise): string {
  return exerciseToText(ie.exercise).back.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Find similar exercise pairs. Uses an inverted shingle index so large courses stay fast. */
export function findDuplicateExercises(
  exercises: readonly IndexedExercise[],
  options: DuplicateOptions = {},
): DuplicatePair[] {
  const threshold = options.threshold ?? DUPLICATE_THRESHOLD
  const limit = options.limit ?? 200
  const fronts = exercises.map(questionKey)
  const sh = fronts.map((f) => shingles(f))
  const postings = new Map<string, number[]>()
  sh.forEach((set, i) => {
    for (const g of set) {
      const list = postings.get(g)
      if (list) list.push(i)
      else postings.set(g, [i])
    }
  })
  const pairs: DuplicatePair[] = []
  const seen = new Set<string>()
  for (let i = 0; i < exercises.length; i++) {
    const counts = new Map<number, number>()
    for (const g of sh[i]!) {
      const list = postings.get(g)!
      if (list.length > 40) continue // very common phrasing, no signal
      for (const j of list) if (j > i) counts.set(j, (counts.get(j) ?? 0) + 1)
    }
    for (const [j, c] of counts) {
      if (c < Math.max(2, Math.floor(Math.min(sh[i]!.size, sh[j]!.size) * 0.3))) continue
      const key = `${i}:${j}`
      if (seen.has(key)) continue
      seen.add(key)
      const score = textSimilarity(fronts[i]!, fronts[j]!)
      if (score >= threshold) {
        pairs.push({
          a: exercises[i]!,
          b: exercises[j]!,
          score: Math.round(score * 100) / 100,
          sameAnswer: answerKey(exercises[i]!) === answerKey(exercises[j]!),
        })
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.a.path.localeCompare(y.a.path, 'en', { numeric: true }))
  return pairs.slice(0, limit)
}

export const DUPLICATE_RULES: RuleInfo[] = [
  {
    ruleId: 'dup.exercise-near-duplicate',
    title: 'Two exercises are nearly the same',
    severity: 'notice',
    measures: 'Word-shingle and bigram similarity of the question side (0.82 or higher).',
    falsePositive:
      'Deliberate spaced repetition, or templated items that differ in one number, look alike.',
  },
  {
    ruleId: 'dup.exam-copies-lesson',
    title: 'Final exam item is close to a lesson exercise',
    severity: 'info',
    measures: 'The same similarity score between an exam item and a lesson item (0.7 or higher).',
    falsePositive: 'Some courses reuse items on purpose to check retention.',
  },
  {
    ruleId: 'dup.lesson-title',
    title: 'Two lessons have the same title',
    severity: 'notice',
    measures: 'Case-insensitive title equality.',
    falsePositive: 'Parts of a series ("Practice") in different modules.',
  },
  {
    ruleId: 'dup.objective-overlap',
    title: 'Two lessons have nearly the same objective',
    severity: 'info',
    measures: 'Jaccard overlap of objective terms (0.75 or higher, at least 4 terms).',
    falsePositive: 'A lesson and its review lesson share an objective by design.',
  },
  {
    ruleId: 'dup.key-term-repeated',
    title: 'Key term defined in several lessons',
    severity: 'info',
    measures: 'Same term text under two or more lessons.',
    falsePositive: 'Reintroducing a term where it is reused helps recall.',
  },
]

const ruleSeverity = new Map(DUPLICATE_RULES.map((r) => [r.ruleId, r]))
function mk(ruleId: string, path: string, message: string, evidence: string, suggestion?: string): Finding {
  const r = ruleSeverity.get(ruleId)!
  return finding({ ruleId, severity: r.severity, path, message, evidence, falsePositive: r.falsePositive, suggestion })
}

/** All duplicate-related findings for a course. */
export function duplicateFindings(course: LhcfCourse, index: CourseIndex = indexCourse(course)): Finding[] {
  const out: Finding[] = []
  const lessonEx = index.exercises.filter((e) => e.home.kind === 'lesson')
  const examEx = index.exercises.filter((e) => e.home.kind === 'finalExam')
  for (const p of findDuplicateExercises(lessonEx)) {
    out.push(
      mk(
        'dup.exercise-near-duplicate',
        p.b.path,
        `Exercise is ${Math.round(p.score * 100)}% similar to ${p.a.path}.`,
        `"${clip(questionKey(p.a), 60)}" vs "${clip(questionKey(p.b), 60)}"${p.sameAnswer ? '; same answer' : '; different answers'}.`,
        p.sameAnswer ? 'Remove one, or change what it asks.' : 'Check that the pair is not contradictory.',
      ),
    )
  }
  const combined = [...lessonEx, ...examEx]
  for (const p of findDuplicateExercises(combined, { threshold: EXAM_OVERLAP_THRESHOLD })) {
    const examSide = p.a.home.kind === 'finalExam' ? p.a : p.b.home.kind === 'finalExam' ? p.b : null
    const lessonSide = examSide === p.a ? p.b : p.a
    if (!examSide || lessonSide.home.kind !== 'lesson') continue
    out.push(
      mk(
        'dup.exam-copies-lesson',
        examSide.path,
        `Exam item resembles lesson exercise ${lessonSide.path}.`,
        `Similarity ${Math.round(p.score * 100)}%: "${clip(questionKey(examSide), 70)}".`,
        'Reword the exam item to test transfer, or keep it if retention is the point.',
      ),
    )
  }
  const titles = new Map<string, string>()
  for (const il of index.lessons) {
    const key = il.lesson.title.trim().toLowerCase()
    const prev = titles.get(key)
    if (prev) out.push(mk('dup.lesson-title', `${il.path}.title`, `Same title as ${prev}.`, `"${il.lesson.title}"`))
    else titles.set(key, il.path)
  }
  const objTerms = index.lessons.map((il) => termSet(il.lesson.objective))
  for (let i = 0; i < index.lessons.length; i++)
    for (let j = i + 1; j < index.lessons.length; j++) {
      const a = objTerms[i]!
      const b = objTerms[j]!
      if (a.size < 4 || b.size < 4) continue
      const score = jaccard(a, b)
      if (score >= 0.75)
        out.push(
          mk(
            'dup.objective-overlap',
            `${index.lessons[j]!.path}.objective`,
            `Objective overlaps ${index.lessons[i]!.path} (${Math.round(score * 100)}%).`,
            `"${clip(index.lessons[i]!.lesson.objective, 60)}" / "${clip(index.lessons[j]!.lesson.objective, 60)}"`,
          ),
        )
    }
  const terms = new Map<string, string[]>()
  for (const il of index.lessons)
    for (const kt of il.lesson.keyTerms) {
      const k = kt.term.trim().toLowerCase()
      const list = terms.get(k) ?? []
      if (!list.includes(il.lesson.slug)) list.push(il.lesson.slug)
      terms.set(k, list)
    }
  for (const [term, lessons] of terms)
    if (lessons.length > 1)
      out.push(mk('dup.key-term-repeated', 'modules', `"${clip(term, 40)}" is a key term in ${lessons.length} lessons.`, lessons.join(', ')))
  return out
}
