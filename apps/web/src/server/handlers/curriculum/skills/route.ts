/**
 * /api/curriculum/skills — GET the skill tree with mastery + DAG unlock states.
 */
import { db } from '@learning-hub/db'
import { masteryLevel, unlockedSkills, type MasteryInput } from '@learning-hub/core'

export async function GET() {
  const { skills, skillEdges, mastery } = await import('@learning-hub/db')
  const skillRows = await db.select().from(skills)
  const edgeRows = await db.select().from(skillEdges)
  const masteryRows = await db.select().from(mastery)
  const pBySkill = new Map(masteryRows.map((m) => [m.skillId, m]))
  const unlocked = unlockedSkills(
    skillRows,
    edgeRows,
    masteryRows.map((m): MasteryInput => ({
      skillId: m.skillId,
      pKnown: m.pKnown,
      attempts: m.attempts,
    })),
  )
  const out = skillRows.map((s) => {
    const m = pBySkill.get(s.id)
    const level = masteryLevel(m?.pKnown ?? 0.1, m?.attempts ?? 0)
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      trackId: s.trackId,
      pKnown: m?.pKnown ?? 0.1,
      attempts: m?.attempts ?? 0,
      correct: m?.correct ?? 0,
      elo: m?.elo ?? 1000,
      masteryLevel: level.level,
      masteryLabel: level.label,
      unlocked: unlocked.has(s.id),
      prerequisites: edgeRows.filter((e) => e.toSkillId === s.id).map((e) => e.fromSkillId),
      dependants: edgeRows.filter((e) => e.fromSkillId === s.id).map((e) => e.toSkillId),
    }
  })
  return Response.json({ skills: out, edges: edgeRows })
}
