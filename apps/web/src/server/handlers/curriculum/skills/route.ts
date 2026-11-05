/**
 * /api/curriculum/skills — GET the skill tree with mastery + DAG unlock states,
 * plus the weakness radar and learning-path recommendations.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@learning-hub/db'
import {
  cardPreviewText,
  masteryLevel,
  recommendNextSkills,
  unlockedSkills,
  weaknessRadar,
  type MasteryInput,
} from '@learning-hub/core'

const WEEK_MS = 7 * 86_400_000

export async function GET() {
  const { cards, mastery, revlog, skills, skillEdges } = await import('@learning-hub/db')
  const skillRows = await db.select().from(skills)
  const edgeRows = await db.select().from(skillEdges)
  const masteryRows = await db.select().from(mastery)
  const masteryInputs = masteryRows.map((m): MasteryInput => ({
    skillId: m.skillId,
    pKnown: m.pKnown,
    attempts: m.attempts,
  }))
  const pBySkill = new Map(masteryRows.map((m) => [m.skillId, m]))
  const unlocked = unlockedSkills(skillRows, edgeRows, masteryInputs)
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

  // weakness radar: weakest skills + leeches + confident-wrong count
  const leechRows = await db
    .select({ id: cards.id, lapses: cards.lapses, type: cards.type, content: cards.content })
    .from(cards)
    .where(gte(cards.lapses, 8))
    .limit(10)
  const [overconfident] = await db
    .select({ n: sql<number>`count(distinct ${revlog.cardId})` })
    .from(revlog)
    .where(
      and(
        eq(revlog.confidence, 1),
        eq(revlog.rating, 1),
        gte(revlog.reviewedAt, new Date(Date.now() - 4 * WEEK_MS).toISOString()),
      ),
    )
  const radar = weaknessRadar({
    skills: out.map((s) => ({
      skillId: s.id,
      name: s.name,
      pKnown: s.pKnown,
      attempts: s.attempts,
      elo: s.elo,
    })),
    leeches: leechRows.map((c) => ({
      cardId: c.id,
      lapses: c.lapses,
      preview: cardPreviewText(c.type, c.content),
    })),
    overconfidentCards: Number(overconfident?.n ?? 0),
  })

  // learning-path recommendations: unlocked, unmastered, most-downstream first
  const recommendations = recommendNextSkills(skillRows, edgeRows, masteryInputs)

  return Response.json({ skills: out, edges: edgeRows, radar, recommendations })
}
