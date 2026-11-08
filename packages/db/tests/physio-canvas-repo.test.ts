import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  canvases,
  chatSessions,
  createCanvas,
  createChatSession,
  deleteCanvas,
  deleteChatSession,
  getCanvas,
  getChatSession,
  getPhysioInsights,
  getPhysioLog,
  gradeChatSession,
  initDb,
  listCanvases,
  listChatSessions,
  listPhysioLogs,
  physioLog,
  setDb,
  updateCanvas,
  updateChatSessionMessages,
  updateChatSessionTitle,
  upsertPhysioLog,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-physio-canvas-'))
  testDb = await initDb({ path: join(tmp, 'physio-canvas.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(physioLog).run()
  testDb.delete(canvases).run()
  testDb.delete(chatSessions).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Physiology repository (Batch B6)', () => {
  it('upserts, clamps metrics, lists history, and computes insights', () => {
    // 1. Initial creation
    const { log: l1, created: c1 } = upsertPhysioLog(
      {
        date: '2026-11-08',
        sleepHours: 7.5,
        sleepQuality: 4,
        exerciseMinutes: 45,
        exerciseHoursAfterLearning: 4.0,
        caffeineCutoffHour: 14,
        arousal: 6,
        notes: 'Good focus day',
      },
      { db: testDb },
    )

    expect(c1).toBe(true)
    expect(l1.sleepHours).toBe(7.5)
    expect(l1.arousal).toBe(6)

    // 2. Updating same date updates values idempotently
    const { log: l1Updated, created: c2 } = upsertPhysioLog(
      {
        date: '2026-11-08',
        sleepHours: 8.0,
        notes: 'Updated: great focus day',
      },
      { db: testDb },
    )

    expect(c2).toBe(false)
    expect(l1Updated.sleepHours).toBe(8.0)
    expect(l1Updated.sleepQuality).toBe(4) // preserved
    expect(l1Updated.notes).toBe('Updated: great focus day')

    // 3. Clamping boundary checks
    const { log: clamped } = upsertPhysioLog(
      {
        date: '2026-11-09',
        sleepHours: 99, // clamped to 24
        sleepQuality: 10, // clamped to 5
        exerciseMinutes: 1000, // clamped to 600
        arousal: 20, // clamped to 10
      },
      { db: testDb },
    )

    expect(clamped.sleepHours).toBe(24)
    expect(clamped.sleepQuality).toBe(5)
    expect(clamped.exerciseMinutes).toBe(600)
    expect(clamped.arousal).toBe(10)
    expect(getPhysioLog('2026-11-09', { db: testDb })?.sleepHours).toBe(24)

    // 4. History and insights
    const history = listPhysioLogs({ db: testDb })
    expect(history).toHaveLength(2)

    const insightsResult = getPhysioInsights({ bedtimeHour: 22, db: testDb })
    expect(insightsResult.history).toHaveLength(2)
    expect(insightsResult.insights.caffeine).toBeDefined()
    expect(insightsResult.insights.arousal.value).toBe(10)
    expect(insightsResult.bedtimeHour).toBe(22)
  })
})

describe('Canvas repository (Batch B6)', () => {
  it('creates, lists, updates items and edges, and deletes canvas boards', () => {
    const board = createCanvas(
      {
        title: 'Cognitive Architecture Diagram',
        scope: 'idea',
        items: [
          { id: 'i1', kind: 'note', text: 'Working Memory', x: 100, y: 100, w: 200 },
          { id: 'i2', kind: 'card', text: 'Long-term Consolidation', x: 400, y: 100, w: 200 },
        ],
        edges: [{ id: 'e1', from: 'i1', to: 'i2', label: 'transfers to' }],
      },
      { db: testDb },
    )

    expect(board.id).toBeDefined()
    expect(board.title).toBe('Cognitive Architecture Diagram')

    const listed = listCanvases({ db: testDb })
    expect(listed).toHaveLength(1)

    const fetched = getCanvas(board.id, { db: testDb })
    expect(fetched?.items).toHaveLength(2)
    expect(fetched?.edges).toHaveLength(1)

    // Update items
    const updated = updateCanvas(
      board.id,
      {
        title: 'Updated Cognitive Architecture',
        edges: [],
      },
      { db: testDb },
    )

    expect(updated?.title).toBe('Updated Cognitive Architecture')
    expect(updated?.edges).toHaveLength(0)

    // Delete canvas
    const deleted = deleteCanvas(board.id, { db: testDb })
    expect(deleted).toBe(true)
    expect(getCanvas(board.id, { db: testDb })).toBeNull()
  })
})

describe('Chat Sessions repository (Batch B6)', () => {
  it('creates, lists summaries, appends messages, grades, and deletes chat sessions', () => {
    const session = createChatSession(
      {
        kind: 'tutor',
        contextType: 'lesson',
        contextId: 10,
        title: 'Socratic Tutor: Synaptic Plasticity',
        messages: [{ role: 'user', content: 'What is LTP?' }],
      },
      { db: testDb },
    )

    expect(session.id).toBeDefined()
    expect(session.hintsUsed).toBe(0)

    // List summaries (omits messages array for efficient list rendering)
    const summaries = listChatSessions({ kind: 'tutor', db: testDb })
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.id).toBe(session.id)
    expect(summaries[0]!.title).toBe('Socratic Tutor: Synaptic Plasticity')
    expect((summaries[0] as unknown as { messages?: unknown[] }).messages).toBeUndefined()

    // Append messages & increment hints
    const updated = updateChatSessionMessages(
      session.id,
      {
        messages: [
          { role: 'user', content: 'What is LTP?' },
          { role: 'assistant', content: 'Long-Term Potentiation is persistent strengthening…' },
        ],
        hintsUsed: 1,
      },
      { db: testDb },
    )

    expect(updated?.messages).toHaveLength(2)
    expect(updated?.hintsUsed).toBe(1)

    // Rename session
    const renamed = updateChatSessionTitle(session.id, 'Renamed Socratic Tutor', { db: testDb })
    expect(renamed).toBe(true)
    expect(getChatSession(session.id, { db: testDb })?.title).toBe('Renamed Socratic Tutor')

    // Grade session
    const graded = gradeChatSession(
      session.id,
      { score: 92, feedback: 'Clear, concise explanation' },
      { db: testDb },
    )
    expect(graded).toBe(true)
    expect(getChatSession(session.id, { db: testDb })?.score).toEqual({
      score: 92,
      feedback: 'Clear, concise explanation',
    })

    // Delete session
    const deleted = deleteChatSession(session.id, { db: testDb })
    expect(deleted).toBe(true)
    expect(getChatSession(session.id, { db: testDb })).toBeNull()
  })
})
