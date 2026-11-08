import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import type { IdeaRow, NoteRow } from '../helpers/rows'
import * as notesRoute from '../../../apps/web/app/api/notes/route'
import * as noteIdRoute from '../../../apps/web/app/api/notes/[id]/route'
import * as ideasRoute from '../../../apps/web/app/api/ideas/route'
import * as evolveRoute from '../../../apps/web/app/api/ideas/evolve/route'
import * as graphRoute from '../../../apps/web/app/api/graph/route'

describe('Tier 1: Notes, Ideas & Knowledge Graph API', () => {
  let note1Id: number
  let note2Id: number
  let idea1Id: number
  let idea2Id: number

  it('creates notes and parses wikilinks into note_links', async () => {
    // Create target note first
    const note1Res = await callRoute<{ note: NoteRow }>(notesRoute.POST, {
      method: 'POST',
      body: {
        title: 'Cognitive Load Theory',
        content:
          'Sweller formulated Cognitive Load Theory distinguishing intrinsic, extraneous, and germane load.',
        supertag: 'DEFINITION',
      },
    })
    expect(note1Res.status).toBe(200)
    expect(note1Res.data.note.id).toBeDefined()
    note1Id = note1Res.data.note.id

    // Create second note referencing the first via [[Cognitive Load Theory]]
    const note2Res = await callRoute<{ note: NoteRow; links: Array<{ target: string }> }>(
      notesRoute.POST,
      {
        method: 'POST',
        body: {
          title: 'Instructional Design Principles',
          content: 'Effective design minimizes extraneous load per [[Cognitive Load Theory]].',
        },
      },
    )
    expect(note2Res.status).toBe(200)
    note2Id = note2Res.data.note.id
    expect(Array.isArray(note2Res.data.links)).toBe(true)
    expect(note2Res.data.links.some((l) => l.target === 'Cognitive Load Theory')).toBe(true)

    // Verify GET /api/notes?q=Instructional
    const searchRes = await callRoute<{ notes: NoteRow[] }>(notesRoute.GET, {
      query: { q: 'Instructional' },
    })
    expect(searchRes.status).toBe(200)
    expect(searchRes.data.notes.length).toBeGreaterThanOrEqual(1)

    // Verify GET /api/notes/[id]
    const singleNoteRes = await callRoute<{
      note: NoteRow
      backlinks: Array<{ fromNoteId: number }>
    }>(noteIdRoute.GET, {
      params: { id: String(note1Id) },
    })
    expect(singleNoteRes.status).toBe(200)
    expect(singleNoteRes.data.note.id).toBe(note1Id)
    // note 2 links to note 1 by title → it shows up as a backlink
    expect(singleNoteRes.data.backlinks.map((b) => b.fromNoteId)).toContain(note2Id)
  })

  it('captures ideas into inbox and evolves them into a hybrid offspring', async () => {
    // Idea A
    const idea1Res = await callRoute<{ ok: boolean; idea: IdeaRow }>(ideasRoute.POST, {
      method: 'POST',
      body: {
        title: 'Spaced Retrieval via LLM Dialogues',
        content:
          'Using conversational agents to prompt active recall questions during natural chat.',
        stage: 'seed',
      },
    })
    expect(idea1Res.status).toBe(200)
    expect(idea1Res.data.ok).toBe(true)
    idea1Id = idea1Res.data.idea.id

    // Idea B
    const idea2Res = await callRoute<{ ok: boolean; idea: IdeaRow }>(ideasRoute.POST, {
      method: 'POST',
      body: {
        title: 'Voice-First Ambient Flashcards',
        content: 'Smart speakers whispering single-concept cloze prompts during morning routines.',
        stage: 'seed',
      },
    })
    expect(idea2Res.status).toBe(200)
    idea2Id = idea2Res.data.idea.id

    // Evolve A + B
    const evolveRes = await callRoute<{ ok: boolean; offspring: unknown; parents: number[] }>(
      evolveRoute.POST,
      {
        method: 'POST',
        body: {
          aId: idea1Id,
          bId: idea2Id,
        },
      },
    )
    expect(evolveRes.status).toBe(200)
    expect(evolveRes.data.ok).toBe(true)
    expect(evolveRes.data.offspring).toBeDefined()
    expect(evolveRes.data.parents).toEqual([idea1Id, idea2Id])

    // List ideas
    const listRes = await callRoute<{ ideas: IdeaRow[] }>(ideasRoute.GET)
    expect(listRes.status).toBe(200)
    expect(Array.isArray(listRes.data.ideas)).toBe(true)
  })

  it('renders interconnected knowledge graph via GET /api/graph', async () => {
    const res = await callRoute<{ nodes: Array<{ kind: string }>; edges: unknown[] }>(
      graphRoute.GET,
    )

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.nodes)).toBe(true)
    expect(Array.isArray(res.data.edges)).toBe(true)

    // Verify note node and idea nodes are in graph
    const noteNodes = res.data.nodes.filter((n) => n.kind === 'note')
    const ideaNodes = res.data.nodes.filter((n) => n.kind === 'idea')
    expect(noteNodes.length).toBeGreaterThanOrEqual(2)
    expect(ideaNodes.length).toBeGreaterThanOrEqual(3) // Idea1, Idea2, Hybrid offspring
  })
})
