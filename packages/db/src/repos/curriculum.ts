/**
 * Curriculum repository — import/export LHCF courses.
 *
 * Shared by every host (web handlers, MCP tools, CLI) so a course imported
 * anywhere behaves identically.
 *
 * Import is an idempotent UPSERT keyed by slugs:
 * - same course slug → the course is updated in place, never duplicated;
 * - lessons/modules/project stages are matched by slug (progress survives);
 * - every lesson exercise is a real `exercise` card keyed by
 *   `lhcf:<course>/<lesson>/<exercise id|position>` — re-importing updates the
 *   card content but KEEPS its FSRS memory state and review history;
 * - exercises removed from the course are SUSPENDED, never deleted, so the
 *   review log stays intact. Removed modules/lessons are deleted (their cards
 *   are suspended first).
 * Everything happens in one transaction: an import fully lands or not at all.
 */
import { and, eq, inArray, like } from 'drizzle-orm'
import {
  isBloomVerb,
  slugify,
  type LhcfCourse,
  type LhcfLesson,
} from '@learning-hub/core/curriculum'
import type { LearningHubDB } from '../index'
import {
  cards,
  courseProjectStages,
  courses,
  decks,
  lessons,
  mastery,
  skillEdges,
  skills,
  tracks,
  units,
  type LessonContent,
} from '../schema'
import { withTransaction, type Transaction } from '../transaction'

/** What an import changed — shown to the learner after importing. */
export interface CurriculumImportReport {
  courseId: number
  trackId: number
  deckId: number
  /** false when an existing course (same slug) was updated. */
  created: boolean
  modules: { added: number; updated: number; removed: number }
  lessons: { added: number; updated: number; removed: number }
  exercises: { added: number; updated: number; suspended: number }
  skills: { added: number; reused: number; edges: number }
  stages: { added: number; updated: number; removed: number }
}

/** Card key for one lesson exercise (stable across re-imports). */
export function exerciseSourceKey(
  courseSlug: string,
  lessonSlug: string,
  exerciseId: string | undefined,
  position: number,
): string {
  return `lhcf:${courseSlug}/${lessonSlug}/${exerciseId ?? position + 1}`
}

const DEFAULT_TRACK = { slug: 'my-courses', title: 'My courses' }
const now = () => new Date().toISOString()

function bloomVerbOf(objective: string): string | null {
  const first =
    objective
      .split(/\s+/)[0]
      ?.replace(/[^\p{L}]/gu, '')
      .toLowerCase() ?? ''
  return isBloomVerb(first) ? first : null
}

function lessonContent(lesson: LhcfLesson, cardIds: number[]): LessonContent {
  return {
    body: lesson.summary ?? lesson.objective,
    cardIds,
    summary: lesson.summary,
    theory: lesson.theory,
    workedExamples: lesson.workedExamples,
    keyTerms: lesson.keyTerms,
    resources: lesson.resources,
    reflection: lesson.reflection,
    skills: lesson.skills,
  }
}

/** Find or create the course's deck (deck names are unique; avoid stealing a user's deck). */
function ensureDeck(tx: Transaction, course: LhcfCourse, existingDeckId: number | null): number {
  if (existingDeckId !== null) {
    const deck = tx.select({ id: decks.id }).from(decks).where(eq(decks.id, existingDeckId)).get()
    if (deck) return deck.id
  }
  const base = course.title
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? base : `${base} (${n})`
    const taken = tx.select({ id: decks.id }).from(decks).where(eq(decks.name, name)).get()
    if (!taken) {
      const [deck] = tx
        .insert(decks)
        .values({
          name,
          description: `Exercises of the course “${course.title}”`,
          emoji: course.emoji ?? '📘',
        })
        .returning()
        .all()
      return deck!.id
    }
  }
  throw new Error('could not find a free deck name for this course')
}

/**
 * Import (or re-import) a validated LHCF course. Returns what changed.
 * Pass `database` to target a specific connection (tests); defaults to the active DB.
 */
export function importCurriculum(
  course: LhcfCourse,
  database?: LearningHubDB,
): CurriculumImportReport {
  return withTransaction((tx) => {
    const stamp = now()

    // ── track ──
    const trackKey = course.track
      ? { slug: slugify(course.track), title: course.track }
      : DEFAULT_TRACK
    let track = tx.select().from(tracks).where(eq(tracks.slug, trackKey.slug)).get()
    if (!track) {
      ;[track] = tx
        .insert(tracks)
        .values({
          slug: trackKey.slug,
          title: trackKey.title,
          emoji: course.track ? (course.emoji ?? '🎯') : '📚',
        })
        .returning()
        .all()
    }
    const trackId = track!.id

    // ── course ──
    const existing = tx.select().from(courses).where(eq(courses.slug, course.slug)).get()
    const courseValues = {
      trackId,
      title: course.title,
      description: course.description ?? null,
      slug: course.slug,
      subtitle: course.subtitle ?? null,
      emoji: course.emoji ?? null,
      level: course.level ?? null,
      language: course.language ?? null,
      estHours: course.estHours ?? null,
      spec: course,
      updatedAt: stamp,
    }
    let courseId: number
    if (existing) {
      tx.update(courses).set(courseValues).where(eq(courses.id, existing.id)).run()
      courseId = existing.id
    } else {
      const [row] = tx
        .insert(courses)
        .values({ ...courseValues, order: 0 })
        .returning()
        .all()
      courseId = row!.id
    }
    const deckId = ensureDeck(tx, course, existing?.deckId ?? null)
    if (existing?.deckId !== deckId)
      tx.update(courses).set({ deckId }).where(eq(courses.id, courseId)).run()

    // ── skills (global by name — knowledge is shared across courses) ──
    const skillIdBySlug = new Map<string, number>()
    const report: CurriculumImportReport = {
      courseId,
      trackId,
      deckId,
      created: !existing,
      modules: { added: 0, updated: 0, removed: 0 },
      lessons: { added: 0, updated: 0, removed: 0 },
      exercises: { added: 0, updated: 0, suspended: 0 },
      skills: { added: 0, reused: 0, edges: 0 },
      stages: { added: 0, updated: 0, removed: 0 },
    }
    for (const s of course.skills) {
      const found = tx.select().from(skills).where(eq(skills.name, s.name)).get()
      if (found) {
        skillIdBySlug.set(s.slug, found.id)
        report.skills.reused++
      } else {
        const [row] = tx
          .insert(skills)
          .values({ name: s.name, description: s.description ?? null, trackId })
          .returning()
          .all()
        skillIdBySlug.set(s.slug, row!.id)
        report.skills.added++
      }
      tx.insert(mastery)
        .values({ skillId: skillIdBySlug.get(s.slug)! })
        .onConflictDoNothing()
        .run()
    }
    for (const s of course.skills) {
      const to = skillIdBySlug.get(s.slug)!
      for (const req of s.requires) {
        const from = skillIdBySlug.get(req)
        if (from === undefined || from === to) continue
        const result = tx
          .insert(skillEdges)
          .values({ fromSkillId: from, toSkillId: to })
          .onConflictDoNothing()
          .run()
        report.skills.edges += result.changes
      }
    }

    // ── modules (units) ──
    const oldUnits = tx.select().from(units).where(eq(units.courseId, courseId)).all()
    const unitBySlug = new Map(oldUnits.filter((u) => u.slug).map((u) => [u.slug!, u]))
    const unitIdBySlug = new Map<string, number>()
    course.modules.forEach((m, order) => {
      const prev = unitBySlug.get(m.slug)
      if (prev) {
        tx.update(units)
          .set({ title: m.title, description: m.description ?? null, order })
          .where(eq(units.id, prev.id))
          .run()
        unitIdBySlug.set(m.slug, prev.id)
        report.modules.updated++
      } else {
        const [row] = tx
          .insert(units)
          .values({
            courseId,
            slug: m.slug,
            title: m.title,
            description: m.description ?? null,
            order,
          })
          .returning()
          .all()
        unitIdBySlug.set(m.slug, row!.id)
        report.modules.added++
      }
    })

    // ── lessons + exercise cards ──
    const oldLessons = oldUnits.length
      ? tx
          .select()
          .from(lessons)
          .where(
            inArray(
              lessons.unitId,
              oldUnits.map((u) => u.id),
            ),
          )
          .all()
      : []
    const lessonBySlug = new Map(oldLessons.filter((l) => l.slug).map((l) => [l.slug!, l]))
    const keyPrefix = `lhcf:${course.slug}/`
    const oldCards = tx
      .select({ id: cards.id, sourceKey: cards.sourceKey })
      .from(cards)
      .where(like(cards.sourceKey, `${keyPrefix}%`))
      .all()
    const cardByKey = new Map(oldCards.map((c) => [c.sourceKey!, c.id]))
    const liveKeys = new Set<string>()
    const keptLessonIds = new Set<number>()

    for (const m of course.modules) {
      const unitId = unitIdBySlug.get(m.slug)!
      m.lessons.forEach((lesson, order) => {
        const lessonSkillId = lesson.skills.length
          ? (skillIdBySlug.get(lesson.skills[0]!) ?? null)
          : null
        const cardIds: number[] = []
        lesson.exercises.forEach((exercise, position) => {
          const key = exerciseSourceKey(course.slug, lesson.slug, exercise.id, position)
          liveKeys.add(key)
          const exerciseSkillId = exercise.skill
            ? skillIdBySlug.get(slugify(exercise.skill))
            : undefined
          const skillId = exerciseSkillId ?? lessonSkillId
          const tags = ['lhcf', course.slug, m.slug]
          const prevId = cardByKey.get(key)
          if (prevId !== undefined) {
            // content changes; FSRS state (due/stability/reps…) is untouched
            tx.update(cards)
              .set({
                deckId,
                type: 'exercise',
                content: { exercise },
                tags,
                skillId,
                suspended: false,
              })
              .where(eq(cards.id, prevId))
              .run()
            cardIds.push(prevId)
            report.exercises.updated++
          } else {
            const [row] = tx
              .insert(cards)
              .values({
                deckId,
                type: 'exercise',
                content: { exercise },
                tags,
                source: 'curriculum',
                skillId,
                sourceKey: key,
                due: stamp,
              })
              .returning({ id: cards.id })
              .all()
            cardIds.push(row!.id)
            report.exercises.added++
          }
        })

        const values = {
          unitId,
          slug: lesson.slug,
          title: lesson.title,
          type: lesson.type,
          objective: lesson.objective,
          bloomVerb: bloomVerbOf(lesson.objective),
          estMinutes: lesson.estMinutes ?? null,
          skillId: lessonSkillId,
          order,
          content: lessonContent(lesson, cardIds),
        }
        const prev = lessonBySlug.get(lesson.slug)
        if (prev) {
          tx.update(lessons).set(values).where(eq(lessons.id, prev.id)).run()
          keptLessonIds.add(prev.id)
          report.lessons.updated++
        } else {
          const [row] = tx.insert(lessons).values(values).returning({ id: lessons.id }).all()
          keptLessonIds.add(row!.id)
          report.lessons.added++
        }
      })
    }

    // exercises no longer in the course: suspend (keep history)
    const stale = oldCards.filter((c) => !liveKeys.has(c.sourceKey!)).map((c) => c.id)
    if (stale.length) {
      report.exercises.suspended = tx
        .update(cards)
        .set({ suspended: true })
        .where(inArray(cards.id, stale))
        .run().changes
    }
    // lessons / modules no longer in the course
    const goneLessons = oldLessons.filter((l) => !keptLessonIds.has(l.id)).map((l) => l.id)
    if (goneLessons.length)
      report.lessons.removed = tx
        .delete(lessons)
        .where(inArray(lessons.id, goneLessons))
        .run().changes
    const liveUnitIds = new Set(unitIdBySlug.values())
    const goneUnits = oldUnits.filter((u) => !liveUnitIds.has(u.id)).map((u) => u.id)
    if (goneUnits.length)
      report.modules.removed = tx.delete(units).where(inArray(units.id, goneUnits)).run().changes

    // ── project stages ──
    const oldStages = tx
      .select()
      .from(courseProjectStages)
      .where(eq(courseProjectStages.courseId, courseId))
      .all()
    const stageKey = (p: string, s: string) => `${p}/${s}`
    const stageByKey = new Map(oldStages.map((s) => [stageKey(s.projectSlug, s.stageSlug), s]))
    const liveStages = new Set<string>()
    let stageOrder = 0
    for (const project of course.projects) {
      for (const stage of project.stages) {
        const key = stageKey(project.slug, stage.slug)
        liveStages.add(key)
        const prev = stageByKey.get(key)
        const sameChecklist =
          prev && JSON.stringify(prev.checklist) === JSON.stringify(stage.checklist)
        const values = {
          projectTitle: project.title,
          title: stage.title,
          description: stage.description,
          checklist: stage.checklist,
          checked: sameChecklist ? prev!.checked : stage.checklist.map(() => false),
          order: stageOrder++,
        }
        if (prev) {
          tx.update(courseProjectStages)
            .set(values)
            .where(eq(courseProjectStages.id, prev.id))
            .run()
          report.stages.updated++
        } else {
          tx.insert(courseProjectStages)
            .values({ ...values, courseId, projectSlug: project.slug, stageSlug: stage.slug })
            .run()
          report.stages.added++
        }
      }
    }
    const goneStages = oldStages
      .filter((s) => !liveStages.has(stageKey(s.projectSlug, s.stageSlug)))
      .map((s) => s.id)
    if (goneStages.length) {
      report.stages.removed = tx
        .delete(courseProjectStages)
        .where(
          and(
            eq(courseProjectStages.courseId, courseId),
            inArray(courseProjectStages.id, goneStages),
          ),
        )
        .run().changes
    }

    return report
  }, database)
}

/**
 * Export a course as LHCF. Courses imported from LHCF return their stored
 * document (exact round-trip); legacy courses are rebuilt from their rows.
 * Returns null when the course does not exist.
 */
export function exportCurriculum(courseId: number, database?: LearningHubDB): LhcfCourse | null {
  return withTransaction((tx) => {
    const course = tx.select().from(courses).where(eq(courses.id, courseId)).get()
    if (!course) return null
    if (course.spec) return course.spec

    // legacy course → minimal LHCF (no exercises: legacy lessons had none as cards)
    const courseUnits = tx
      .select()
      .from(units)
      .where(eq(units.courseId, courseId))
      .orderBy(units.order)
      .all()
    const slugger = new Set<string>()
    const unique = (s: string) => {
      let c = s
      for (let n = 2; slugger.has(c); n++) c = `${s}-${n}`
      slugger.add(c)
      return c
    }
    const modules = courseUnits.map((u) => {
      const rows = tx
        .select()
        .from(lessons)
        .where(eq(lessons.unitId, u.id))
        .orderBy(lessons.order)
        .all()
      return {
        slug: u.slug ?? unique(slugify(u.title)),
        title: u.title,
        description: u.description ?? undefined,
        lessons: rows.map((l) => ({
          slug: l.slug ?? unique(slugify(l.title)),
          title: l.title,
          objective: l.objective ?? `Explain ${l.title}`,
          type: 'concept' as const,
          estMinutes: l.estMinutes ?? undefined,
          skills: [],
          summary: l.content?.body && l.content.body !== l.objective ? l.content.body : undefined,
          theory: l.content?.theory ?? [],
          workedExamples: l.content?.workedExamples ?? [],
          keyTerms: l.content?.keyTerms ?? [],
          resources: l.content?.resources ?? [],
          exercises: [],
          reflection: l.content?.reflection ?? [],
        })),
      }
    })
    return {
      lhcf: 1,
      slug: course.slug ?? slugify(course.title),
      title: course.title,
      description: course.description ?? undefined,
      tags: [],
      outcomes: [],
      prerequisites: [],
      skills: [],
      modules: modules.length ? modules : [{ slug: 'lessons', title: 'Lessons', lessons: [] }],
      projects: [],
      certificate: { minLessonCompletion: 1, requireFinalExam: true, requireProjects: true },
    } as LhcfCourse
  }, database)
}
