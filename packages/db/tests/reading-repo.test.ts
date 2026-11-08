import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cards,
  convertSq3rToCards,
  createHighlightCandidates,
  createSource,
  decks,
  deleteSource,
  getOrCreateSq3rSession,
  getSource,
  getSourceDetail,
  highlights,
  initDb,
  listHighlights,
  listSources,
  markHighlightsSeen,
  resurfaceHighlightsQuery,
  setDb,
  sources,
  sq3rSessions,
  triageHighlight,
  updateSource,
  upsertSq3rSession,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-reading-repo-'))
  testDb = await initDb({ path: join(tmp, 'reading.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(cards).run()
  testDb.delete(decks).run()
  testDb.delete(sq3rSessions).run()
  testDb.delete(highlights).run()
  testDb.delete(sources).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Reading repository (Batch B3)', () => {
  it('creates, lists, details, and updates reading sources with reading status transitions', () => {
    const s1 = createSource(
      {
        title: 'Deep Work Chapter 1',
        content: '# Deep Work\n\nDeep work is the ability to focus without distraction.',
        kind: 'markdown',
        priority: 75,
      },
      { db: testDb },
    )
    const s2 = createSource(
      {
        title: 'Make It Stick Chapter 2',
        content: 'Retrieval practice produces durable learning.',
        kind: 'paste',
        priority: 90,
      },
      { db: testDb },
    )

    const listed = listSources({ db: testDb })
    expect(listed).toHaveLength(2)
    expect(listed[0]!.id).toBe(s2.id) // priority 90 before 75
    expect(listed[1]!.id).toBe(s1.id)

    const detail = getSourceDetail(s1.id, { db: testDb })
    expect(detail).toBeDefined()
    expect(detail?.source.title).toBe('Deep Work Chapter 1')
    expect(detail?.fragment).toBeDefined()

    // Status transition: queued -> reading when position > 0
    expect(s1.status).toBe('queued')
    const updatedMid = updateSource(s1.id, { position: 40 }, { db: testDb })
    expect(updatedMid?.position).toBe(40)
    expect(updatedMid?.status).toBe('reading')
    expect(updatedMid?.lastReadAt).toBeDefined()

    // Status transition: reading -> done when position >= 100
    const updatedDone = updateSource(s1.id, { position: 100 }, { db: testDb })
    expect(updatedDone?.position).toBe(100)
    expect(updatedDone?.status).toBe('done')
  })

  it('cascades deletion across highlights and SQ3R sessions atomically', () => {
    const source = createSource(
      {
        title: 'Atomic Habits Summary',
        content: 'Habits are the compound interest of self-improvement.',
      },
      { db: testDb },
    )

    createHighlightCandidates(source.id, ['Habits compound over time.'], { db: testDb })
    getOrCreateSq3rSession(source.id, { db: testDb })

    expect(listHighlights({ sourceId: source.id, db: testDb })).toHaveLength(1)
    expect(getOrCreateSq3rSession(source.id, { db: testDb })).toBeDefined()

    const deleted = deleteSource(source.id, { db: testDb })
    expect(deleted).toBe(true)

    expect(getSource(source.id, { db: testDb })).toBeNull()
    expect(listHighlights({ sourceId: source.id, db: testDb })).toHaveLength(0)
    expect(getOrCreateSq3rSession(source.id, { db: testDb })).toBeNull()
  })

  it('supports highlight candidates, passive resurfacing, explicit seen promotion, and triage', () => {
    const source = createSource(
      {
        title: 'Cognitive Load Theory',
        content: 'Working memory has finite capacity for novel elements.',
      },
      { db: testDb },
    )

    const candidates = ['Working memory is limited.', 'Intrinsic load depends on schema.']
    const created = createHighlightCandidates(source.id, candidates, { db: testDb })
    expect(created).toHaveLength(2)

    // Passive resurface: does NOT mutate strength or lastReviewedAt
    const resurfaced = resurfaceHighlightsQuery({ limit: 5, db: testDb })
    expect(resurfaced.length).toBeGreaterThan(0)
    expect(resurfaced[0]!.sourceTitle).toBe('Cognitive Load Theory')

    const beforeMark = listHighlights({ sourceId: source.id, db: testDb })
    expect(beforeMark[0]!.lastReviewedAt).toBeNull()

    // Explicit seen promotion
    const seenIds = [created[0]!.id]
    const marked = markHighlightsSeen(seenIds, { db: testDb })
    expect(marked).toEqual(seenIds)

    const afterMark = listHighlights({ sourceId: source.id, db: testDb })
    const seenRow = afterMark.find((h) => h.id === created[0]!.id)
    expect(seenRow?.lastReviewedAt).toBeDefined()
    expect(seenRow?.strength).toBeGreaterThan(0.5)

    // Triage keep vs discard
    const kept = triageHighlight(created[0]!.id, 'keep', { db: testDb })
    expect(kept?.triaged).toBe(1)
    expect(kept?.strength).toBeGreaterThanOrEqual(0.7)

    const discarded = triageHighlight(created[1]!.id, 'discard', { db: testDb })
    expect(discarded?.triaged).toBe(2)
  })

  it('manages guided SQ3R sessions and converts Q&A to flashcards', () => {
    const source = createSource(
      {
        title: 'Spaced Retrieval Fundamentals',
        content:
          '# Introduction\n\nSpacing intervals improves long-term retention.\n\n## Testing Effect\n\nActive recall beats passive review.',
      },
      { db: testDb },
    )

    // Auto-generates survey headings from Markdown
    const session = getOrCreateSq3rSession(source.id, { db: testDb })
    expect(session).toBeDefined()
    expect(session?.surveyHeadings).toContain('Introduction')
    expect(session?.surveyHeadings).toContain('Testing Effect')

    // Upsert SQ3R questions and notes
    const updatedSession = upsertSq3rSession(
      source.id,
      {
        questions: [
          {
            id: 'q1',
            question: 'What is the testing effect?',
            answer: 'Active retrieval practice beats re-reading.',
          },
          {
            id: 'q2',
            question: 'What is spacing?',
            answer: 'Distributing study sessions over time.',
          },
        ],
        reciteNotes: 'Recited key findings aloud without looking.',
        completedSteps: ['survey', 'question', 'read', 'recite'],
      },
      { db: testDb },
    )

    expect(updatedSession?.questions).toHaveLength(2)
    expect(updatedSession?.completedSteps).toContain('recite')

    // Convert Q&A to cards
    const conversion = convertSq3rToCards({ sourceId: source.id }, { db: testDb })
    expect(conversion.success).toBe(true)
    if (!conversion.success) return

    expect(conversion.createdCards).toBe(2)
    expect(conversion.session.completedSteps).toContain('review')
    expect(conversion.session.questions[0]!.cardId).toBeDefined()
    expect(conversion.session.questions[1]!.cardId).toBeDefined()

    // Calling again is idempotent for already converted cards
    const secondConversion = convertSq3rToCards({ sourceId: source.id }, { db: testDb })
    expect(secondConversion.success).toBe(true)
    if (secondConversion.success) {
      expect(secondConversion.createdCards).toBe(0)
    }
  })

  it('handles SQ3R card conversion error cases gracefully', () => {
    const badSourceResult = convertSq3rToCards({ sourceId: 999999 }, { db: testDb })
    expect(badSourceResult.success).toBe(false)
    if (!badSourceResult.success) {
      expect(badSourceResult.error).toBe('source_not_found')
    }

    const source = createSource({ title: 'Empty', content: 'No session' }, { db: testDb })
    const badDeckResult = convertSq3rToCards(
      { sourceId: source.id, deckId: 888888 },
      { db: testDb },
    )
    expect(badDeckResult.success).toBe(false)
    if (!badDeckResult.success) {
      expect(badDeckResult.error).toBe('session_not_found')
    }
  })
})
