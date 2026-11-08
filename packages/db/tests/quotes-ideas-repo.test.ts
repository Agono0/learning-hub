import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createHybridIdea,
  createIdea,
  createIdeaLink,
  createQuote,
  deleteIdea,
  deleteIdeaLink,
  deleteQuote,
  getDailyQuote,
  getIdea,
  getIdeaDetail,
  getQuote,
  getRandomQuote,
  ideaLinks,
  ideas,
  initDb,
  listIdeaLinks,
  listIdeas,
  listQuotes,
  projects,
  quotes,
  setDb,
  updateIdea,
  updateQuote,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-quotes-ideas-'))
  testDb = await initDb({ path: join(tmp, 'quotes-ideas.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(ideaLinks).run()
  testDb.delete(ideas).run()
  testDb.delete(projects).run()
  testDb.delete(quotes).run()
  testDb.delete(xpEvents).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Quotes repository (Batch B5)', () => {
  it('creates, lists, searches, toggles favorites, and fetches daily/random quotes', () => {
    const q1 = createQuote(
      {
        text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.',
        author: 'Mahatma Gandhi',
        tags: ['learning', 'wisdom'],
      },
      { db: testDb },
    )
    const q2 = createQuote(
      {
        text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
        author: 'Will Durant',
        tags: ['habits'],
      },
      { db: testDb },
    )

    const all = listQuotes({ db: testDb })
    expect(all.total).toBe(2)
    expect(all.quotes).toHaveLength(2)

    // Tag filter
    const habitQuotes = listQuotes({ tag: 'habits', db: testDb })
    expect(habitQuotes.quotes).toHaveLength(1)
    expect(habitQuotes.quotes[0]!.author).toBe('Will Durant')

    // Substring search
    const searchRes = listQuotes({ search: 'tomorrow', db: testDb })
    expect(searchRes.quotes).toHaveLength(1)
    expect(searchRes.quotes[0]!.author).toBe('Mahatma Gandhi')

    // Deterministic daily quote
    const daily1 = getDailyQuote({ date: '2026-11-09', db: testDb })
    const daily2 = getDailyQuote({ date: '2026-11-09', db: testDb })
    expect(daily1.quote).toBeDefined()
    expect(daily1.quote?.id).toBe(daily2.quote?.id)

    // Random quote
    const random = getRandomQuote({ db: testDb })
    expect(random).toBeDefined()

    // Favorite toggle
    expect(q1.favorite).toBe(false)
    const updated = updateQuote(q1.id, { favorite: true }, { db: testDb })
    expect(updated?.favorite).toBe(true)

    // Delete quote
    deleteQuote(q2.id, { db: testDb })
    expect(getQuote(q2.id, { db: testDb })).toBeNull()
  })
})

describe('Ideas repository (Batch B5)', () => {
  it('creates, lists, links, details, and deletes ideas with cascade', () => {
    const parentA = createIdea(
      {
        title: 'Spaced Repetition in VR',
        content: 'Immersion memory palaces using WebXR',
        tags: ['vr', 'memory'],
      },
      { db: testDb },
    )

    const parentB = createIdea(
      {
        title: 'FSRS-6 Scheduling Engine',
        content: 'Free Spaced Repetition Scheduler algorithm',
        tags: ['fsrs', 'algorithm'],
        linkedTo: {
          ideaId: parentA.id,
          type: 'related',
          context: 'Both optimize memory consolidation',
        },
      },
      { db: testDb },
    )

    const listed = listIdeas({ db: testDb })
    expect(listed.ideas).toHaveLength(2)
    expect(listed.links).toHaveLength(1)

    // Verify detail with incoming and outgoing links
    const detailA = getIdeaDetail(parentA.id, { db: testDb })
    expect(detailA).toBeDefined()
    expect(detailA?.links).toHaveLength(1)
    expect(detailA?.links[0]!.toIdeaId).toBe(parentB.id)
    expect(detailA?.incoming).toHaveLength(0)

    const detailB = getIdeaDetail(parentB.id, { db: testDb })
    expect(detailB?.links).toHaveLength(0)
    expect(detailB?.incoming).toHaveLength(1)
    expect(detailB?.incoming[0]!.fromIdeaId).toBe(parentA.id)

    // Manual link creation
    const manualLink = createIdeaLink(
      { fromIdeaId: parentA.id, toIdeaId: parentB.id, type: 'supports' },
      { db: testDb },
    )
    expect(manualLink.id).toBeDefined()
    expect(listIdeaLinks({ db: testDb })).toHaveLength(2)

    deleteIdeaLink(manualLink.id, { db: testDb })
    expect(listIdeaLinks({ db: testDb })).toHaveLength(1)

    // Delete parent with cascade
    deleteIdea(parentA.id, { db: testDb })
    expect(getIdea(parentA.id, { db: testDb })).toBeNull()
    expect(listIdeaLinks({ db: testDb })).toHaveLength(0) // cascaded link deletion
  })

  it('updates ideas with resurfacing and promotes to projects', () => {
    const idea = createIdea({ title: 'Build a distributed raft cluster' }, { db: testDb })

    const updated = updateIdea(
      idea.id,
      {
        stage: 'growing',
        resurface: true,
      },
      { db: testDb },
    )

    expect(updated.idea?.stage).toBe('growing')
    expect(updated.idea?.lastResurfacedAt).toBeDefined()
    expect(updated.idea?.decayScore).toBe(1.0)

    // Promote to project
    const promoted = updateIdea(
      idea.id,
      {
        promote: true,
      },
      { db: testDb },
    )

    expect(promoted.idea?.stage).toBe('project')
    expect(promoted.idea?.projectId).toBeDefined()
    expect(promoted.project?.title).toBe('Build a distributed raft cluster')
  })

  it('evolves two parent ideas into a hybrid offspring with parent-of links and XP', () => {
    const a = createIdea({ title: 'Knowledge Graph Visualization' }, { db: testDb })
    const b = createIdea({ title: 'Adaptive Audio Ambience' }, { db: testDb })

    const hybrid = createHybridIdea(
      {
        aId: a.id,
        bId: b.id,
        title: 'Sonified Knowledge Graph',
        content: 'Explore concept relationships through 3D spatialized audio harmonics.',
        mode: 'manual',
      },
      { db: testDb },
    )

    expect(hybrid.offspring.id).toBeDefined()
    expect(hybrid.offspring.tags).toContain('hybrid')
    expect(hybrid.mode).toBe('manual')

    const links = listIdeaLinks({ ideaId: hybrid.offspring.id, db: testDb })
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.type === 'parent-of')).toBe(true)

    // Verify XP event was created
    const xpRows = testDb.select().from(xpEvents).all()
    expect(xpRows).toHaveLength(1)
    expect(xpRows[0]!.source).toBe('idea')
  })
})
