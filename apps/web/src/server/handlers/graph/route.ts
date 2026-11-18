/**
 * /api/graph — knowledge graph: notes, ideas, skills, sampled cards as nodes;
 * typed edges from note_links, idea_links, skill_edges, note→card.
 *
 * `?courseId=N` scopes the graph to one course instead: course → units →
 * lessons → the course's skills, with prereq edges between those skills —
 * the course mind map (M5).
 */
import { eq } from 'drizzle-orm'
import {
  db,
  cards,
  courses,
  ideas,
  lessonProgress,
  lessons,
  listIdeaLinks,
  noteLinks,
  notes,
  skillEdges,
  skills,
  units,
} from '@learning-hub/db'
import { withRoute } from '@/lib/api'

type GraphNodeKind = 'course' | 'unit' | 'lesson' | 'skill' | 'note' | 'idea' | 'card'

interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  refId: number
  stage?: string
  /** lessons: completed or not (mind map coloring) */
  completed?: boolean
}

export const GET = withRoute(async (req: Request) => {
  const courseId = Number(new URL(req.url).searchParams.get('courseId'))
  if (Number.isInteger(courseId) && courseId > 0) {
    return courseMindMap(courseId)
  }
  return knowledgeGraph()
})

/** Course mind map: units → lessons → skills with prereq edges. */
async function courseMindMap(courseId: number) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1)
  if (!course)
    return Response.json({ nodes: [], edges: [], error: 'course not found' }, { status: 404 })

  const rows = await db
    .select({
      unitId: units.id,
      unitTitle: units.title,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      skillId: lessons.skillId,
      completed: lessonProgress.status,
    })
    .from(units)
    .innerJoin(lessons, eq(lessons.unitId, units.id))
    .leftJoin(lessonProgress, eq(lessonProgress.lessonId, lessons.id))
    .where(eq(units.courseId, courseId))

  const nodes: GraphNode[] = [
    { id: `course:${course.id}`, kind: 'course', label: course.title, refId: course.id },
  ]
  const unitIds = new Set<number>()
  const skillIds = new Set<number>()
  for (const r of rows) {
    if (!unitIds.has(r.unitId)) {
      unitIds.add(r.unitId)
      nodes.push({ id: `unit:${r.unitId}`, kind: 'unit', label: r.unitTitle, refId: r.unitId })
    }
    nodes.push({
      id: `lesson:${r.lessonId}`,
      kind: 'lesson',
      label: r.lessonTitle,
      refId: r.lessonId,
      completed: r.completed === 'completed',
    })
    if (r.skillId != null) skillIds.add(r.skillId)
  }
  // the skills those lessons teach (course-scoped subgraph)
  if (skillIds.size > 0) {
    const skillRows = await db.select().from(skills)
    for (const s of skillRows) {
      if (skillIds.has(s.id)) {
        nodes.push({ id: `skill:${s.id}`, kind: 'skill', label: s.name, refId: s.id })
      }
    }
  }
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = [
    ...[...unitIds].map((u) => ({
      source: `course:${course.id}`,
      target: `unit:${u}`,
      type: 'module',
    })),
    ...rows.map((r) => ({
      source: `unit:${r.unitId}`,
      target: `lesson:${r.lessonId}`,
      type: 'has-lesson',
    })),
    ...rows
      .filter((r) => r.skillId != null)
      .map((r) => ({
        source: `lesson:${r.lessonId}`,
        target: `skill:${r.skillId}`,
        type: 'teaches',
      })),
  ].filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  // prereq edges BETWEEN the course's own skills
  if (skillIds.size > 1) {
    const skillEdgeRows = await db.select().from(skillEdges).limit(500)
    for (const e of skillEdgeRows) {
      if (skillIds.has(e.fromSkillId) && skillIds.has(e.toSkillId)) {
        edges.push({
          source: `skill:${e.fromSkillId}`,
          target: `skill:${e.toSkillId}`,
          type: 'prereq',
        })
      }
    }
  }

  return Response.json({ nodes, edges })
}

/** Whole-library knowledge graph (the default, pre-M5 behavior). */
async function knowledgeGraph() {
  const noteRows = await db.select({ id: notes.id, title: notes.title }).from(notes).limit(300)
  const ideaRows = await db
    .select({ id: ideas.id, title: ideas.title, stage: ideas.stage })
    .from(ideas)
    .limit(200)
  const skillRows = await db.select({ id: skills.id, name: skills.name }).from(skills).limit(100)
  const cardRows = await db
    .select({ id: cards.id, type: cards.type, deckId: cards.deckId, noteId: cards.noteId })
    .from(cards)
    .limit(150) // sampled — full card graph is too dense to render

  const noteLinkRows = await db.select().from(noteLinks).limit(600)
  const ideaLinkRows = listIdeaLinks({ limit: 400 })
  const skillEdgeRows = await db.select().from(skillEdges).limit(200)

  const nodes = [
    ...noteRows.map((n) => ({
      id: `note:${n.id}`,
      kind: 'note' as const,
      label: n.title,
      refId: n.id,
    })),
    ...ideaRows.map((i) => ({
      id: `idea:${i.id}`,
      kind: 'idea' as const,
      label: i.title,
      refId: i.id,
      stage: i.stage,
    })),
    ...skillRows.map((s) => ({
      id: `skill:${s.id}`,
      kind: 'skill' as const,
      label: s.name,
      refId: s.id,
    })),
    ...cardRows
      .filter((c) => c.noteId)
      .map((c) => ({
        id: `card:${c.id}`,
        kind: 'card' as const,
        label: `${c.type} card`,
        refId: c.id,
      })),
  ]
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = [
    ...noteLinkRows
      .map((l) => ({
        source: `note:${l.fromNoteId}`,
        target: `note:${l.toNoteId}`,
        type: l.type ?? 'related',
      }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
    ...ideaLinkRows
      .map((l) => ({
        source: `idea:${l.fromIdeaId}`,
        target: `idea:${l.toIdeaId}`,
        type: l.type ?? 'related',
      }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
    ...skillEdgeRows
      .map((l) => ({
        source: `skill:${l.fromSkillId}`,
        target: `skill:${l.toSkillId}`,
        type: 'prereq',
      }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
    ...cardRows
      .filter((c) => c.noteId && nodeIds.has(`card:${c.id}`))
      .map((c) => ({ source: `note:${c.noteId}`, target: `card:${c.id}`, type: 'has-card' })),
  ]
  return Response.json({ nodes, edges })
}
