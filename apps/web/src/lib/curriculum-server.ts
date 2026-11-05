/**
 * Server-side curriculum persistence — shared by
 * /api/ai/generate (kind: 'course') and /api/curriculum (POST generate).
 */
import { eq, inArray } from 'drizzle-orm'
import {
  withTransaction,
  courses,
  lessons,
  mastery,
  skillEdges,
  skills,
  tracks,
  units,
} from '@learning-hub/db'
import type { GeneratedCourse } from '@learning-hub/core'

/** Ids created by insertGeneratedCourse (track/course/units/lessons/skills). */
export interface InsertedCourseIds {
  trackId: number
  courseId: number
  unitIds: number[]
  lessonIds: number[]
  skillIds: number[]
  edgeCount: number
}

/**
 * Persist a validated GeneratedCourse: track → course → units → lessons +
 * skill DAG + mastery seeds. One atomic transaction — a partially-inserted
 * course (track without lessons, skills without edges) can never be committed.
 */
export function insertGeneratedCourse(parsed: GeneratedCourse): InsertedCourseIds {
  return withTransaction((tx) => {
    const [track] = tx
      .insert(tracks)
      .values({
        title: parsed.title,
        description: parsed.description ?? null,
        emoji: parsed.emoji ?? '🎯',
      })
      .returning()
      .all()
    const [course] = tx
      .insert(courses)
      .values({
        trackId: track!.id,
        title: parsed.title,
        description: parsed.description ?? null,
        order: 0,
      })
      .returning()
      .all()

    const unitIds: number[] = []
    const lessonIds: number[] = []
    for (const [ui, unit] of parsed.units.entries()) {
      const [u] = tx
        .insert(units)
        .values({ courseId: course!.id, title: unit.title, order: ui })
        .returning()
        .all()
      unitIds.push(u!.id)
      for (const [li, lesson] of unit.lessons.entries()) {
        const [l] = tx
          .insert(lessons)
          .values({
            unitId: u!.id,
            title: lesson.title,
            type: lesson.type ?? 'concept',
            objective: lesson.objective,
            bloomVerb: lesson.bloomVerb,
            content: { body: lesson.objective, quiz: lesson.cards },
            order: li,
          })
          .returning()
          .all()
        lessonIds.push(l!.id)
      }
    }

    // skill DAG (names → ids, requires → edges)
    const skillIds: number[] = []
    const idByName = new Map<string, number>()
    for (const s of parsed.skills) {
      const existing = tx.select().from(skills).where(eq(skills.name, s.name)).limit(1).get()
      let id: number
      if (existing) {
        id = existing.id
      } else {
        const [created] = tx
          .insert(skills)
          .values({ name: s.name, trackId: track!.id })
          .returning()
          .all()
        id = created!.id
      }
      skillIds.push(id)
      idByName.set(s.name, id)
    }
    let edgeCount = 0
    for (const s of parsed.skills) {
      const toId = idByName.get(s.name)
      if (!toId) continue
      for (const reqName of s.requires ?? []) {
        const fromId = idByName.get(reqName)
        if (!fromId || fromId === toId) continue
        try {
          tx.insert(skillEdges).values({ fromSkillId: fromId, toSkillId: toId }).run()
          edgeCount++
        } catch {
          // duplicate edge — ignore
        }
      }
    }
    // seed mastery rows (BKT pKnown default 0.1) for fresh skills
    const existingMastery = tx
      .select({ skillId: mastery.skillId })
      .from(mastery)
      .where(skillIds.length ? inArray(mastery.skillId, skillIds) : eq(mastery.skillId, -1))
      .all()
    const have = new Set(existingMastery.map((m) => m.skillId))
    for (const id of skillIds) {
      if (!have.has(id)) {
        tx.insert(mastery).values({ skillId: id }).onConflictDoNothing().run()
      }
    }

    return { trackId: track!.id, courseId: course!.id, unitIds, lessonIds, skillIds, edgeCount }
  })
}
