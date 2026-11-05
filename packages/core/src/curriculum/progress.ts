/**
 * Course progress rules — pure functions the course catalog, overview, lesson
 * player and certificate all share.
 *
 * Gating follows mastery learning (Bloom 1968; Hyperskill's topic graph): a
 * lesson whose skills require prerequisites the learner hasn't mastered yet is
 * SOFT-locked — shown as "recommended later", never hard-blocked, because
 * learners often know more than the model believes (self-determination:
 * autonomy matters for motivation, Deci & Ryan 1985).
 */
import { unlockProbability } from '../bkt'

/** Default BKT probability above which a prerequisite counts as mastered. */
export const PREREQ_MASTERY_THRESHOLD = 0.7

export type LessonStatus = 'not_started' | 'in_progress' | 'completed'

/** Minimal lesson facts needed for course-level decisions (in course order). */
export interface LessonFacts {
  id: number
  status: LessonStatus
  /** Skill ids this lesson trains. */
  skillIds: number[]
}

/** Prerequisite edges: skill id → ids of skills it requires. */
export type PrereqMap = ReadonlyMap<number, readonly number[]>

/**
 * Skill ids the learner hasn't unlocked yet: some prerequisite's mastery
 * (mapped through {@link unlockProbability}) is below the threshold.
 */
export function lockedSkills(
  prereqs: PrereqMap,
  pKnown: ReadonlyMap<number, number>,
  threshold = PREREQ_MASTERY_THRESHOLD,
): Set<number> {
  const locked = new Set<number>()
  for (const [skill, requires] of prereqs) {
    if (requires.some((r) => unlockProbability(pKnown.get(r) ?? 0) < threshold)) locked.add(skill)
  }
  return locked
}

/** A lesson is soft-locked when any of its skills is locked (completed lessons never are). */
export function isLessonLocked(lesson: LessonFacts, locked: ReadonlySet<number>): boolean {
  return lesson.status !== 'completed' && lesson.skillIds.some((s) => locked.has(s))
}

/**
 * The lesson to continue with: the first in-progress lesson, else the first
 * unlocked not-started one, else the first not-started one (even if
 * soft-locked). Null when everything is completed.
 */
export function nextLessonId(
  lessons: readonly LessonFacts[],
  locked: ReadonlySet<number>,
): number | null {
  const inProgress = lessons.find((l) => l.status === 'in_progress')
  if (inProgress) return inProgress.id
  const open = lessons.find((l) => l.status === 'not_started' && !isLessonLocked(l, locked))
  if (open) return open.id
  return lessons.find((l) => l.status !== 'completed')?.id ?? null
}

/** Completion summary for rings and bars. */
export interface CourseProgress {
  completed: number
  total: number
  /** 0..1 */
  fraction: number
}

export function courseProgress(lessons: readonly Pick<LessonFacts, 'status'>[]): CourseProgress {
  const completed = lessons.filter((l) => l.status === 'completed').length
  return {
    completed,
    total: lessons.length,
    fraction: lessons.length ? completed / lessons.length : 0,
  }
}

/** Inputs for the certificate decision. */
export interface CertificateInput {
  rules: { minLessonCompletion: number; requireFinalExam: boolean; requireProjects: boolean }
  progress: CourseProgress
  hasFinalExam: boolean
  /** Best final-exam score so far (0..1), null if never taken. */
  bestExamScore: number | null
  examPassScore: number
  stagesTotal: number
  stagesCompleted: number
}

/** Whether the certificate can be issued, and what is still missing (human-readable). */
export function certificateEligibility(input: CertificateInput): {
  eligible: boolean
  missing: string[]
} {
  const missing: string[] = []
  const neededLessons = Math.ceil(input.rules.minLessonCompletion * input.progress.total)
  if (input.progress.completed < neededLessons) {
    missing.push(`Complete ${neededLessons - input.progress.completed} more lesson(s)`)
  }
  if (input.rules.requireFinalExam && input.hasFinalExam) {
    if (input.bestExamScore === null) missing.push('Take the final exam')
    else if (input.bestExamScore < input.examPassScore)
      missing.push(`Pass the final exam (${Math.round(input.examPassScore * 100)}% needed)`)
  }
  if (input.rules.requireProjects && input.stagesCompleted < input.stagesTotal) {
    missing.push(`Finish ${input.stagesTotal - input.stagesCompleted} project stage(s)`)
  }
  return { eligible: missing.length === 0, missing }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I

/** Short human-friendly certificate code, e.g. "LH-7K3M-QX9D". */
export function certificateCode(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = random(8)
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return `LH-${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}
