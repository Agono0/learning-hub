/**
 * /api/graph — knowledge graph: notes, ideas, skills, sampled cards as nodes;
 * typed edges from note_links, idea_links, skill_edges, note→card.
 */
import { db, cards, ideaLinks, ideas, noteLinks, notes, skillEdges, skills } from '@learning-hub/db'

export async function GET() {
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
  const ideaLinkRows = await db.select().from(ideaLinks).limit(400)
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
