/**
 * Integration smoke tests for the hardened API routes, driven against an
 * isolated temp SQLite DB (LEARNING_HUB_DB) — no dev data is touched.
 *
 * Covers the audit items end-to-end: zod body parsing (malformed JSON → 400),
 * the quests double-XP race (guarded UPDATE pays once), settings clamps,
 * streak dedupe via updateStreakInTx (habits/focus/streaks), the reading
 * highlights read-only GET + explicit seen POST, journal/ai insight upsert,
 * the curriculum/course + ai/generate cloze transaction sweeps, and tzOffset
 * day bucketing. Run from apps/web: `npx vitest run`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// find the workspace root the same way packages/db/src/paths.ts resolveDbPath does
function findRepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg) && readFileSync(pkg, 'utf8').includes('"workspaces"')) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('workspace root not found')
}

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-routes-smoke-')), 'smoke.db')

// The db package's ensureSchema() only patches an EXISTING schema (tables come
// from drizzle-kit push) — seed the temp DB with the real repo DDL first,
// the same trick packages/db/tests/review-service.test.ts uses via getRawDb().
const repoDbFile = join(findRepoRoot(), 'data', 'learning-hub.db')
{
  const source = new Database(repoDbFile, { readonly: true, fileMustExist: true })
  const ddl = source
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'",
    )
    .all() as { sql: string }[]
  source.close()
  const target = new Database(tempDbFile)
  target.pragma('journal_mode = WAL')
  for (const { sql } of ddl) target.exec(sql)
  target.close()
}

process.env.LEARNING_HUB_DB = tempDbFile

type Modules = Record<string, any>
const M: Modules = {}

function post(url: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// controllable fake AI client — null = not configured; provider mirrors user_settings.aiProvider
const fakeAI: { client: any; provider: string } = { client: null, provider: 'anthropic' }
vi.mock('@/lib/ai', () => {
  class AIUnavailableError extends Error {
    constructor() {
      super('AI is not configured — pick a provider and model in Settings.')
      this.name = 'AIUnavailableError'
    }
  }
  return {
    AIUnavailableError,
    getAISettingsFromDb: async () => ({ provider: fakeAI.provider, model: '' }),
    getActiveAIClientFromDb: async () => fakeAI.client,
    requireAI: async () => {
      if (!fakeAI.client) throw new AIUnavailableError()
      return fakeAI.client
    },
  }
})

beforeAll(async () => {
  M.db = await import('@learning-hub/db')
  M.core = await import('@learning-hub/core')
  M.quests = await import('../app/api/quests/route')
  M.settings = await import('../app/api/settings/route')
  M.habits = await import('../app/api/habits/route')
  M.checkin = await import('../app/api/habits/checkin/route')
  M.focus = await import('../app/api/focus/route')
  M.focusId = (await import('../app/api/focus/[id]/route')) as any
  M.streaks = await import('../app/api/streaks/route')
  M.highlights = await import('../app/api/reading/highlights/route')
  M.journalAi = await import('../app/api/journal/ai/route')
  M.curriculum = await import('../app/api/curriculum/route')
  M.aiGenerate = await import('../app/api/ai/generate/route')
  M.aiRubric = await import('../app/api/ai/rubric/route')
  M.transport = await import('../app/api/ai/transport/route')
  M.decks = await import('../app/api/decks/route')
})

describe('quests (items 1, 3, 11)', () => {
  it('GET ?tzOffset=300 buckets the quest day by the client tz', async () => {
    const res = await M.quests.GET(req('GET', '/api/quests?tzOffset=300'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { date: string }
    expect(body.date).toBe(M.core.dayKey(new Date(), 300))
  })

  it('POST with malformed JSON returns 400 (was an uncaught 500)', async () => {
    const bad = new Request('http://localhost/api/quests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{index: broken',
    })
    const res = await M.quests.POST(bad)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Request body must be valid JSON')
  })

  it('completing all quests pays XP exactly once — the second identical POST does not pay again', async () => {
    const date = M.core.dayKey(new Date(), 0)
    // read the stored items to know how many quests exist today
    const getRes = await M.quests.GET(req('GET', '/api/quests'))
    const { items } = (await getRes.json()) as { items: { done: boolean }[] }
    expect(items.length).toBeGreaterThan(0)

    // complete all but one
    for (let i = 0; i < items.length - 1; i++) {
      const res = await M.quests.POST(post('/api/quests', { index: i }))
      expect(res.status).toBe(200)
    }

    // final completion — pays the quest XP
    const first = await M.quests.POST(post('/api/quests', { index: items.length - 1 }))
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as { allDone: boolean; xpAwarded: number }
    expect(firstBody.allDone).toBe(true)
    expect(firstBody.xpAwarded).toBe(50) // XP_REWARDS.quest

    // duplicate POST (the race: both requests saw completed=0 before the fix)
    const second = await M.quests.POST(post('/api/quests', { index: items.length - 1 }))
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { xpAwarded: number }
    expect(secondBody.xpAwarded).toBe(0)

    // exactly one quest XP event for the day
    const events = M.db.db.select().from(M.db.xpEvents).all()
    const questXp = events.filter(
      (e: { source: string; meta: unknown }) =>
        e.source === 'quest' && (e.meta as { date: string }).date === date,
    )
    expect(questXp).toHaveLength(1)
  })

  it('POST with an out-of-range index returns 400', async () => {
    const res = await M.quests.POST(post('/api/quests', { index: 999 }))
    expect(res.status).toBe(400)
  })
})

describe('settings (item 2)', () => {
  it('rejects an unknown aiProvider and clamps desiredRetention into [0.5, 0.97]', async () => {
    const bad = await M.settings.PUT(req('PUT', '/api/settings', { aiProvider: 'skynet' }))
    expect(bad.status).toBe(400)

    const res = await M.settings.PUT(
      req('PUT', '/api/settings', {
        aiProvider: 'anthropic',
        desiredRetention: 0.99,
        sessionMinutes: 1000,
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      settings: { aiProvider: string; desiredRetention: number; sessionMinutes: number }
    }
    expect(body.settings.aiProvider).toBe('anthropic')
    expect(body.settings.desiredRetention).toBe(0.97)
    expect(body.settings.sessionMinutes).toBe(180)

    const low = await M.settings.PUT(req('PUT', '/api/settings', { desiredRetention: 0.2 }))
    const lowBody = (await low.json()) as { settings: { desiredRetention: number } }
    expect(lowBody.settings.desiredRetention).toBe(0.5)

    // non-finite retention is rejected outright
    const nan = await M.settings.PUT(req('PUT', '/api/settings', { desiredRetention: 'NaN!' }))
    expect(nan.status).toBe(400)
  })

  it('accepts custom-endpoint ahead of the later-stage client', async () => {
    const res = await M.settings.PUT(req('PUT', '/api/settings', { aiProvider: 'custom-endpoint' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings: { aiProvider: string } }
    expect(body.settings.aiProvider).toBe('custom-endpoint')
  })

  it('stores canonical aiHeaders for custom-endpoint, masks them in GET, rejects invalid JSON', async () => {
    const res = await M.settings.PUT(
      req('PUT', '/api/settings', {
        aiHeaders: '{"Authorization": "Bearer secret-123", "X-Tag": "t"}',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      settings: { aiHeaders: string | null; hasHeaders: boolean }
    }
    expect(body.settings.aiHeaders).toBe('••••') // masked — values never round-trip to the client
    expect(body.settings.hasHeaders).toBe(true)

    // empty string = keep (same rule as the API key)
    const keep = await M.settings.PUT(req('PUT', '/api/settings', { aiHeaders: '' }))
    const keepBody = (await keep.json()) as { settings: { hasHeaders: boolean } }
    expect(keepBody.settings.hasHeaders).toBe(true)

    // non-object or non-string values → 400 with the fix in the message
    const bad = await M.settings.PUT(req('PUT', '/api/settings', { aiHeaders: 'not json' }))
    expect(bad.status).toBe(400)
    const badBody = (await bad.json()) as { error: string }
    expect(badBody.error).toContain('JSON object')
    const badValue = await M.settings.PUT(req('PUT', '/api/settings', { aiHeaders: '{"A": 1}' }))
    expect(badValue.status).toBe(400)
  })

  it('persists theme (including system), onboardingCompleted, and sidebarCollapsedGroups', async () => {
    const res = await M.settings.PUT(
      req('PUT', '/api/settings', {
        theme: 'system',
        onboardingCompleted: true,
        sidebarCollapsedGroups: ['Explore', 'Discipline'],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      settings: {
        theme: string
        onboardingCompleted: boolean
        sidebarCollapsedGroups: string[]
        isEmptyWorkspace: boolean
      }
    }
    expect(body.settings.theme).toBe('system')
    expect(body.settings.onboardingCompleted).toBe(true)
    expect(body.settings.sidebarCollapsedGroups).toEqual(['Explore', 'Discipline'])
    expect(typeof body.settings.isEmptyWorkspace).toBe('boolean')
  })
})

describe('streak dedupe (item 10)', () => {
  it('habit checkin pays XP once per day and records streak activity via updateStreakInTx', async () => {
    const created = await M.habits.POST(
      post('/api/habits', {
        name: 'Read 20 pages',
        cue: 'after coffee',
        craving: 'calm',
        response: 'read',
        reward: 'tea',
      }),
    )
    expect(created.status).toBe(201)
    const { habit } = (await created.json()) as { habit: { id: number } }

    const first = await M.checkin.POST(post('/api/habits/checkin', { habitId: habit.id }))
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { alreadyDone: boolean; xpAwarded: number }
    expect(firstBody.alreadyDone).toBe(false)
    expect(firstBody.xpAwarded).toBe(M.core.XP_REWARDS.habit)

    const second = await M.checkin.POST(post('/api/habits/checkin', { habitId: habit.id }))
    const secondBody = (await second.json()) as { alreadyDone: boolean }
    expect(secondBody.alreadyDone).toBe(true)

    const streakRows = M.db.db.select().from(M.db.streaks).all()
    expect(streakRows).toHaveLength(1)
    expect(streakRows[0].current).toBe(1)
    expect(streakRows[0].lastActiveDate).toBe(M.core.dayKey(new Date(), 0))

    // unknown habit → 404
    const missing = await M.checkin.POST(post('/api/habits/checkin', { habitId: 424242 }))
    expect(missing.status).toBe(404)
  })

  it('focus completion pays XP + streak once; re-completing does not pay again', async () => {
    const started = await M.focus.POST(
      post('/api/focus', { plannedMinutes: 25, task: 'deep work' }),
    )
    expect(started.status).toBe(201)
    const { session } = (await started.json()) as { session: { id: number; completed: boolean } }
    expect(session.completed).toBe(false)

    const ended = await M.focusId.PATCH(
      req('PATCH', `/api/focus/${session.id}`, { completed: true, actualMinutes: 25.44, leaks: 2 }),
      {
        params: Promise.resolve({ id: String(session.id) }),
      },
    )
    expect(ended.status).toBe(200)
    const endBody = (await ended.json()) as {
      xpAwarded: number
      session: { actualMinutes: number; completed: boolean }
    }
    expect(endBody.xpAwarded).toBe(M.core.XP_REWARDS.focusSession)
    expect(endBody.session.completed).toBe(true)
    expect(endBody.session.actualMinutes).toBe(25.4)

    const again = await M.focusId.PATCH(
      req('PATCH', `/api/focus/${session.id}`, { completed: true }),
      {
        params: Promise.resolve({ id: String(session.id) }),
      },
    )
    const againBody = (await again.json()) as { xpAwarded: number }
    expect(againBody.xpAwarded).toBe(0)
  })

  it('POST /api/streaks records activity through the shared helper (idempotent per day)', async () => {
    const first = await M.streaks.POST()
    expect(first.status).toBe(200)
    const body = (await first.json()) as { ok: boolean; streak: { current: number } }
    expect(body.ok).toBe(true)
    expect(body.streak.current).toBe(1) // already counted today (habit check-in test above)

    const again = await M.streaks.POST()
    const againBody = (await again.json()) as { streak: { current: number } }
    expect(againBody.streak.current).toBe(1) // same day → no change
  })
})

describe('reading highlights (item 7)', () => {
  it('GET mode=resurface is read-only; POST { seenIds } is the explicit mutation', async () => {
    const [source] = M.db.db
      .insert(M.db.sources)
      .values({
        kind: 'paste',
        title: 'Deep Work',
        content: 'Focus is the new IQ. Deep work matters. ',
      })
      .returning()
      .all()
    const [h] = M.db.db
      .insert(M.db.highlights)
      .values({
        sourceId: source.id,
        text: 'Focus is the new IQ.',
        strength: 0.5,
        triaged: 0,
        lastReviewedAt: null,
      })
      .returning()
      .all()

    const res = await M.highlights.GET(
      new Request('http://localhost/api/reading/highlights?mode=resurface&limit=10'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { resurface: { id: number; sourceTitle: string | null }[] }
    expect(body.resurface.some((x) => x.id === h.id)).toBe(true)
    expect(body.resurface.find((x) => x.id === h.id)!.sourceTitle).toBe('Deep Work')

    // GET must NOT have nudged strength/lastReviewedAt
    const afterGet = M.db.db
      .select()
      .from(M.db.highlights)
      .all()
      .find((r: { id: number }) => r.id === h.id)
    expect(afterGet.strength).toBe(0.5)
    expect(afterGet.lastReviewedAt).toBeNull()

    // explicit seen → strength +0.05, lastReviewedAt set
    const seen = await M.highlights.POST(post('/api/reading/highlights', { seenIds: [h.id] }))
    expect(seen.status).toBe(200)
    const seenBody = (await seen.json()) as { ok: boolean; seen: number[] }
    expect(seenBody.seen).toEqual([h.id])
    const afterSeen = M.db.db
      .select()
      .from(M.db.highlights)
      .all()
      .find((r: { id: number }) => r.id === h.id)
    expect(afterSeen.strength).toBeCloseTo(0.55)
    expect(afterSeen.lastReviewedAt).not.toBeNull()
  })
})

describe('journal/ai (item 6)', () => {
  it('upserts the paid-for insight onto an unjournaled date', async () => {
    const today = M.core.dayKey(new Date(), 0)
    const tomorrow = M.core.dayKey(new Date(Date.now() + 86_400_000), 0)
    // need at least one entry in the trailing week
    M.db.db
      .insert(M.db.journalEntries)
      .values({ date: today, mood: 4, smallWins: 'shipped the test suite' })
      .run()

    fakeAI.client = {
      generateText: async () =>
        'You shipped a test suite — pattern: verification first. Tiny next action: write one more.',
    }
    const res = await M.journalAi.POST(post('/api/journal/ai', { date: tomorrow }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; insight: string }
    expect(body.ok).toBe(true)

    // the unjournaled date now HAS a row carrying the insight
    const entry = M.db.db
      .select()
      .from(M.db.journalEntries)
      .all()
      .find((e: { date: string }) => e.date === tomorrow)
    expect(entry).toBeDefined()
    expect(entry.aiInsight).toBe(body.insight)

    // a journaled date gets the insight on the existing row
    const res2 = await M.journalAi.POST(post('/api/journal/ai', { date: today }))
    const body2 = (await res2.json()) as { ok: boolean }
    expect(body2.ok).toBe(true)
    const row = M.db.db
      .select()
      .from(M.db.journalEntries)
      .all()
      .find((e: { date: string }) => e.date === today)
    expect(row.mood).toBe(4) // original fields intact
    expect(row.aiInsight).toBeTruthy()
  })

  it('provider none → manual reflection prompts stored as the insight (never dead-ends)', async () => {
    // Behavior intentionally changed by the no-AI-dependency requirement:
    // provider 'none' (the DEFAULT) must not dead-end the journal — it now
    // stores deterministic reflection prompts as the entry's insight.
    fakeAI.client = null
    fakeAI.provider = 'none'
    const today = M.core.dayKey(new Date(), 0)
    const res = await M.journalAi.POST(post('/api/journal/ai', { date: today }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; mode: string; insight: string }
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('manual')
    expect(body.insight).toContain('Reflection prompts')
    const row = M.db.db
      .select()
      .from(M.db.journalEntries)
      .all()
      .find((e: { date: string }) => e.date === today)
    expect(row.aiInsight).toBe(body.insight)
    fakeAI.provider = 'anthropic'
  })

  it('transport GET serves the envelope + manual mode; POST validates the pasted reply', async () => {
    fakeAI.provider = 'none' // transport works with no provider — that's the point
    // discovery (no feature) — provider status + feature list
    const disco = await M.transport.GET(req('GET', '/api/ai/transport'))
    const discoBody = (await disco.json()) as {
      provider: string
      configured: boolean
      features: { name: string }[]
    }
    expect(discoBody.provider).toBe('none')
    expect(discoBody.configured).toBe(false)
    expect(discoBody.features.map((f) => f.name)).toContain('cloze-generator')

    // envelope for a JSON feature, built from params
    const env = await M.transport.GET(
      req(
        'GET',
        '/api/ai/transport?feature=cloze-generator&text=Spaced%20repetition%20schedules%20reviews%20at%20expanding%20intervals.',
      ),
    )
    const envBody = (await env.json()) as {
      ok: boolean
      envelope: { v: number; feature: string; system: string; prompt: string; schema?: string }
      manual: { title: string } | null
    }
    expect(envBody.ok).toBe(true)
    expect(envBody.envelope.v).toBe(1)
    expect(envBody.envelope.feature).toBe('cloze-generator')
    expect(envBody.envelope.prompt).toContain('Spaced repetition')
    expect(envBody.envelope.schema).toContain('cards')
    expect(envBody.manual).not.toBeNull()

    // unknown feature → 400 with the valid list
    const bad = await M.transport.GET(req('GET', '/api/ai/transport?feature=nope'))
    expect(bad.status).toBe(400)

    // text feature reply comes back as text
    const text = await M.transport.POST(
      post('/api/ai/transport', {
        feature: 'tutor-grade',
        result: 'What do you notice about the pattern?',
      }),
    )
    const textBody = (await text.json()) as { ok: boolean; kind: string; result: string }
    expect(textBody.ok).toBe(true)
    expect(textBody.kind).toBe('text')
    expect(textBody.result).toContain('notice')

    // json feature: fenced reply validates; invalid reply → 400 descriptive
    const fenced =
      '```json\n{"cards":[{"text":"Spaced repetition schedules reviews at [expanding] intervals","answers":["expanding"]}]}\n```'
    const okJson = await M.transport.POST(
      post('/api/ai/transport', { feature: 'cloze-generator', result: fenced }),
    )
    const okBody = (await okJson.json()) as {
      ok: boolean
      kind: string
      data: { cards: unknown[] }
    }
    expect(okBody.ok).toBe(true)
    expect(okBody.data.cards).toHaveLength(1)

    const badJson = await M.transport.POST(
      post('/api/ai/transport', { feature: 'cloze-generator', result: 'not json at all' }),
    )
    expect(badJson.status).toBe(400)
    const badBody = (await badJson.json()) as { ok: boolean; error: string }
    expect(badBody.ok).toBe(false)
    expect(badBody.error).toContain('cloze-generator')
    fakeAI.provider = 'anthropic'
  })
})

describe('AI error sanitization + transaction sweeps (items 8, 9)', () => {
  it('curriculum POST without a provider → sanitized 400 needsSetup + manualHint, no raw leak', async () => {
    fakeAI.client = null
    const res = await M.curriculum.POST(post('/api/curriculum', { topic: 'Calculus' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; needsSetup: boolean; manualHint?: string }
    expect(body.needsSetup).toBe(true)
    expect(body.error).not.toMatch(/https?:\/\//)
    expect(body.manualHint).toContain('manual curriculum builder')
  })

  it('curriculum POST { manual } creates a course with zero AI involvement', async () => {
    fakeAI.client = null
    const res = await M.curriculum.POST(
      post('/api/curriculum', {
        manual: {
          title: 'Manual Course',
          description: 'built by hand',
          units: [
            {
              title: 'Unit 1',
              lessons: [
                { title: 'Lesson 1', objective: 'Define a learning card', bloomVerb: 'define' },
              ],
            },
          ],
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      mode: string
      unitIds: number[]
      lessonIds: number[]
    }
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('manual')
    expect(body.unitIds).toHaveLength(1)
    expect(body.lessonIds).toHaveLength(1)
  })

  it('curriculum POST persists a generated course atomically (track→course→units→lessons→skills)', async () => {
    fakeAI.client = {
      generateJSON: async () => ({
        title: 'Real Analysis Basics',
        description: 'Limits to continuity',
        emoji: '∑',
        units: [
          {
            title: 'Limits',
            lessons: [
              {
                title: 'Epsilon-delta',
                objective: 'Prove a limit from the definition',
                bloomVerb: 'prove',
              },
            ],
          },
        ],
        skills: [
          { name: 'limits', requires: [] },
          { name: 'continuity', requires: ['limits'] },
        ],
      }),
    }
    const res = await M.curriculum.POST(post('/api/curriculum', { topic: 'Real Analysis' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      trackId: number
      courseId: number
      unitIds: number[]
      lessonIds: number[]
      skillIds: number[]
      edgeCount: number
    }
    expect(body.ok).toBe(true)
    expect(body.unitIds).toHaveLength(1)
    expect(body.lessonIds).toHaveLength(1)
    expect(body.edgeCount).toBe(1)
    const tracks = M.db.db.select().from(M.db.tracks).all()
    expect(tracks.some((t: { title: string }) => t.title === 'Real Analysis Basics')).toBe(true)
  })

  it('ai/generate cloze inserts the card batch in one transaction; not-configured is sanitized', async () => {
    const [deck] = M.db.db.insert(M.db.decks).values({ name: 'Smoke Deck' }).returning().all()

    fakeAI.client = null
    const unconfigured = await M.aiGenerate.POST(
      post('/api/ai/generate', { kind: 'cloze', payload: { text: 'x', deckId: deck.id } }),
    )
    expect(unconfigured.status).toBe(400)
    const unBody = (await unconfigured.json()) as { error: string; needsSetup: boolean }
    expect(unBody.needsSetup).toBe(true)

    fakeAI.client = {
      generateJSON: async () => ({
        cards: [
          { text: 'The mitochondria is the [powerhouse] of the cell', answers: ['powerhouse'] },
          { text: 'DNA replication is [semiconservative]', answers: ['semiconservative'] },
        ],
      }),
    }
    const res = await M.aiGenerate.POST(
      post('/api/ai/generate', {
        kind: 'cloze',
        payload: { text: 'Biology notes', deckId: deck.id },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; cards: number[] }
    expect(body.cards).toHaveLength(2)
    const deckCards = M.db.db
      .select()
      .from(M.db.cards)
      .all()
      .filter((c: { deckId: number }) => c.deckId === deck.id)
    expect(deckCards).toHaveLength(2)
    expect(deckCards.every((c: { source: string }) => c.source === 'ai')).toBe(true)
  })

  it('ai/generate with malformed JSON → 400, not 500', async () => {
    const bad = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'nope{',
    })
    const res = await M.aiGenerate.POST(bad)
    expect(res.status).toBe(400)
  })
})

describe('decks (item 1)', () => {
  it('POST validates the name via zod; duplicate names 409', async () => {
    const res = await M.decks.POST(post('/api/decks', { name: 'Physics', emoji: '🧲' }))
    expect(res.status).toBe(201)
    const dup = await M.decks.POST(post('/api/decks', { name: 'Physics' }))
    expect(dup.status).toBe(409)
    const blank = await M.decks.POST(post('/api/decks', { name: '   ' }))
    expect(blank.status).toBe(400)
  })
})

describe('google provider & ai/rubric (milestone 5)', () => {
  it('settings PUT accepts google provider and gemini-2.5-flash model', async () => {
    const putRes = await M.settings.PUT(
      req('PUT', '/api/settings', {
        aiProvider: 'google',
        aiModel: 'gemini-2.5-flash',
      }),
    )
    expect(putRes.status).toBe(200)
    const getRes = await M.settings.GET()
    const body = (await getRes.json()) as {
      settings: { aiProvider: string; aiModel: string }
    }
    expect(body.settings.aiProvider).toBe('google')
    expect(body.settings.aiModel).toBe('gemini-2.5-flash')
  })

  it('POST /api/ai/rubric returns manualHint when unconfigured and structured rubric coaching when configured', async () => {
    const rubricPayload = {
      prompt: 'Explain why retrieval practice beats passive rereading.',
      rubric: [
        'Mentions active reconstruction from memory',
        'Notes calibration against illusions of competence',
      ],
      learnerAnswer: 'Recalling from memory strengthens retrieval cues and exposes gaps.',
    }

    fakeAI.client = null
    const unconfigured = await M.aiRubric.POST(post('/api/ai/rubric', rubricPayload))
    expect(unconfigured.status).toBe(400)
    const unBody = (await unconfigured.json()) as {
      ok: boolean
      needsSetup: boolean
      manualHint: string
    }
    expect(unBody.ok).toBe(false)
    expect(unBody.needsSetup).toBe(true)
    expect(unBody.manualHint).toContain('manual')

    fakeAI.client = {
      generateJSON: async () => ({
        criteriaMet: [true, true],
        score: 1,
        feedback: 'Both core mechanisms are clearly articulated.',
      }),
    }
    const configured = await M.aiRubric.POST(post('/api/ai/rubric', rubricPayload))
    expect(configured.status).toBe(200)
    const okBody = (await configured.json()) as {
      ok: boolean
      criteriaMet: boolean[]
      score: number
      feedback: string
    }
    expect(okBody.ok).toBe(true)
    expect(okBody.criteriaMet).toEqual([true, true])
    expect(okBody.score).toBe(1)
    expect(okBody.feedback).toContain('articulated')

    // Copy-envelope transport prompt + parse roundtrip for provider-less learners (Hard Rule #9)
    const promptRes = await M.transport.POST(
      post('/api/ai/transport', {
        feature: 'freetext-rubric',
        params: {
          question: rubricPayload.prompt,
          rubric: rubricPayload.rubric.join(' || '),
          answer: rubricPayload.learnerAnswer,
        },
      }),
    )
    expect(promptRes.status).toBe(200)
    const promptBody = (await promptRes.json()) as {
      ok: boolean
      envelope: { feature: string; prompt: string }
      manual: { feature: string } | null
    }
    expect(promptBody.ok).toBe(true)
    expect(promptBody.envelope.feature).toBe('freetext-rubric')
    expect(promptBody.envelope.prompt).toContain('retrieval practice')
    expect(promptBody.manual?.feature).toBe('freetext-rubric')

    const parseRes = await M.transport.POST(
      post('/api/ai/transport', {
        feature: 'freetext-rubric',
        result: JSON.stringify({
          criteriaMet: [true, false],
          score: 0.5,
          feedback: 'Good explanation of reconstruction; mention metacognitive calibration.',
        }),
      }),
    )
    expect(parseRes.status).toBe(200)
    const parseBody = (await parseRes.json()) as {
      ok: boolean
      data: { criteriaMet: boolean[]; score: number; feedback: string }
    }
    expect(parseBody.ok).toBe(true)
    expect(parseBody.data.criteriaMet).toEqual([true, false])
  })
})
