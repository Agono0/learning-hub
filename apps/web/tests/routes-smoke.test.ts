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
  M.focusMax = await import('../app/api/focus/max/route')
  M.focusMaxExit = await import('../app/api/focus/max/exit/route')
  M.focusAllowlists = await import('../app/api/focus/allowlists/route')
  M.focusBridge = await import('../app/api/focus/bridge/route')
  M.remindersPlan = await import('../app/api/reminders/plan/route')
  M.remindersLog = await import('../app/api/reminders/log/route')
  M.remindersClick = await import('../app/api/reminders/click/route')
  M.cardsOcclusion = await import('../app/api/cards/occlusion/route')
  M.mindmaps = await import('../app/api/mindmaps/route')
  M.mindmapsId = (await import('../app/api/mindmaps/[id]/route')) as any
  M.mindmapsIdCards = (await import('../app/api/mindmaps/[id]/cards/route')) as any
  M.reviewAttemptImage = await import('../app/api/review/attempt-image/route')
  M.cards = await import('../app/api/cards/route')
  M.boss = await import('../app/api/games/boss/route')
  M.shareExport = await import('../app/api/share/export/route')
  M.shareImport = await import('../app/api/share/import/route')
  M.leaderboard = await import('../app/api/social/leaderboard/route')
  M.onlineIdentity = await import('../app/api/online/identity/route')
  M.onlineRooms = await import('../app/api/online/rooms/route')
  M.onlineLibrary = await import('../app/api/online/library/route')
  M.onlineBuddies = await import('../app/api/online/buddies/route')
  M.audioDigest = await import('../app/api/audio/digest/route')
  M.audioGrade = await import('../app/api/audio/grade/route')
  M.audioSessions = await import('../app/api/audio/sessions/route')
  M.hudQuickReview = await import('../app/api/hud/quick-review/route')
  M.hudCapture = await import('../app/api/hud/capture/route')
  M.embeddingsSearch = await import('../app/api/embeddings/search/route')
  M.graphDeps = await import('../app/api/curriculum/graph/dependencies/route')
  M.graphRemedial = await import('../app/api/curriculum/graph/remedial/route')
  M.ankiConnect = await import('../app/api/anki/connect/route')
  M.socialGuilds = await import('../app/api/social/guilds/route')
  M.socialDuels = await import('../app/api/social/duels/route')
  M.socialSeasons = await import('../app/api/social/seasons/route')
  M.worldState = await import('../app/api/world/state/route')
  M.worldMarket = await import('../app/api/world/market/route')
  M.worldAvatar = await import('../app/api/world/avatar/route')
  M.worldPlots = await import('../app/api/world/plots/route')
  M.worldVerifyReview = await import('../app/api/world/verify/review/route')
  M.worldVerifyFocus = await import('../app/api/world/verify/focus/route')
  M.worldSettings = await import('../app/api/world/settings/route')
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

describe('max focus mode (milestone 6)', () => {
  it('enforces single-session lock, 60s cooldown exit gate, and allowlist presets', async () => {
    // 1. Check initial status
    const statusRes = await M.focusMax.GET()
    expect(statusRes.status).toBe(200)

    // 2. Start Max Focus
    const startRes = await M.focusMax.POST(
      post('/api/focus/max', {
        minutes: 25,
        task: 'Mastering FSRS',
        extraDomains: ['learninghub.local'],
      }),
    )
    expect(startRes.status).toBe(201)
    const startBody = (await startRes.json()) as {
      ok: boolean
      session: { id: number; mode: string }
      lock: { active: boolean; endsAt: string }
    }
    expect(startBody.ok).toBe(true)
    expect(startBody.session.mode).toBe('max')
    expect(startBody.lock.active).toBe(true)

    // 3. Second start conflicts (409)
    const secondStart = await M.focusMax.POST(post('/api/focus/max', { minutes: 15 }))
    expect(secondStart.status).toBe(409)

    // 4. Request early exit -> kicks off 60s cooldown
    const reqExit = await M.focusMaxExit.POST(post('/api/focus/max/exit', { action: 'request' }))
    expect(reqExit.status).toBe(200)
    const reqExitBody = (await reqExit.json()) as {
      ok: boolean
      lock: { exitState: string; cooldownRemainingSec: number }
    }
    expect(reqExitBody.lock.exitState).toBe('cooldown')
    expect(reqExitBody.lock.cooldownRemainingSec).toBeGreaterThan(0)

    // 5. Confirming early fails (400)
    const earlyConfirm = await M.focusMaxExit.POST(
      post('/api/focus/max/exit', {
        action: 'confirm',
        reflection: 'I was tempted by notifications on my phone.',
      }),
    )
    expect(earlyConfirm.status).toBe(400)

    // 6. Cancel early exit
    const cancelRes = await M.focusMaxExit.POST(post('/api/focus/max/exit', { action: 'cancel' }))
    expect(cancelRes.status).toBe(200)
    const cancelBody = (await cancelRes.json()) as { lock: { exitState: string } }
    expect(cancelBody.lock.exitState).toBe('locked')

    // 7. Allowlist presets & bridge heartbeat
    const allowlistsRes = await M.focusAllowlists.GET()
    expect(allowlistsRes.status).toBe(200)
    const allowBody = (await allowlistsRes.json()) as { ok: boolean; allowlists: any[] }
    expect(allowBody.ok).toBe(true)
    expect(allowBody.allowlists.length).toBeGreaterThanOrEqual(1)

    const bridgeRes = await M.focusBridge.GET()
    expect(bridgeRes.status).toBe(200)
    const bridgeBody = (await bridgeRes.json()) as { ok: boolean; pairingToken: string }
    expect(bridgeBody.ok).toBe(true)
    expect(bridgeBody.pairingToken).toBeTruthy()

    const hbRes = await M.focusBridge.POST(
      post('/api/focus/bridge', { action: 'heartbeat', extensionId: 'lh-ext-1' }),
    )
    expect(hbRes.status).toBe(200)
  })

  it('plans, logs, clicks, and configures calm reminders', async () => {
    // 1. Plan candidate reminders
    const planRes = await M.remindersPlan.GET()
    expect(planRes.status).toBe(200)
    const planBody = (await planRes.json()) as {
      ok: boolean
      settings: any
      facts: any
      candidates: any[]
    }
    expect(planBody.ok).toBe(true)
    expect(planBody.settings).toBeDefined()
    expect(planBody.settings.dailyCap).toBe(3)
    expect(Array.isArray(planBody.candidates)).toBe(true)

    // 2. Log a sent reminder
    const logRes = await M.remindersLog.POST(
      post('/api/reminders/log', {
        kind: 'daily_review',
        title: 'Spaced Repetition Due',
        body: 'You have 5 cards ready for review.',
        actionUrl: '/review',
      }),
    )
    expect(logRes.status).toBe(200)
    const logBody = (await logRes.json()) as { ok: boolean; logged: { id: number; kind: string } }
    expect(logBody.ok).toBe(true)
    expect(logBody.logged.id).toBeGreaterThan(0)
    expect(logBody.logged.kind).toBe('daily_review')

    // 3. List recent reminder logs
    const listRes = await M.remindersLog.GET(req('GET', '/api/reminders/log?limit=10'))
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as { ok: boolean; logs: any[] }
    expect(listBody.ok).toBe(true)
    expect(listBody.logs.some((l) => l.id === logBody.logged.id)).toBe(true)

    // 4. Click a reminder
    const clickRes = await M.remindersClick.POST(
      post('/api/reminders/click', {
        reminderLogId: logBody.logged.id,
        kind: 'daily_review',
        actionUrl: '/review',
      }),
    )
    expect(clickRes.status).toBe(200)
    const clickBody = (await clickRes.json()) as { ok: boolean; clicked: { id: number } }
    expect(clickBody.ok).toBe(true)
    expect(clickBody.clicked.id).toBeGreaterThan(0)

    // 5. Update reminder settings via PUT /api/settings
    const setRes = await M.settings.PUT(
      req('PUT', '/api/settings', {
        remindersEnabled: true,
        remindersQuietStart: '23:00',
        remindersQuietEnd: '07:00',
        remindersDailyCap: 5,
        remindersKinds: ['daily_review', 'streak_saver'],
      }),
    )
    expect(setRes.status).toBe(200)
    const setBody = (await setRes.json()) as { ok: boolean; settings: any }
    expect(setBody.ok).toBe(true)
    expect(setBody.settings.remindersQuietStart).toBe('23:00')
    expect(setBody.settings.remindersDailyCap).toBe(5)
  })

  it('handles visual learning: batch occlusion, mindmaps, and sketch attempts', async () => {
    // 1. Create a test deck
    const deckRes = await M.decks.POST(post('/api/decks', { name: 'Visual Anatomy Deck' }))
    expect([200, 201]).toContain(deckRes.status)
    const deckBody = (await deckRes.json()) as { ok: boolean; deck: { id: number } }
    const deckId = deckBody.deck.id

    // 2. Batch create occlusion cards
    const occRes = await M.cardsOcclusion.POST(
      post('/api/cards/occlusion', {
        deckId,
        imageId: 1,
        mode: 'hide-all-guess-one',
        rects: [
          { id: 'r1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'Hippocampus' },
          { id: 'r2', x: 0.4, y: 0.4, w: 0.2, h: 0.2, label: 'Amygdala', shape: 'ellipse' },
        ],
      }),
    )
    expect(occRes.status).toBe(200)
    const occBody = (await occRes.json()) as { ok: boolean; count: number; cards: any[] }
    expect(occBody.ok).toBe(true)
    expect(occBody.count).toBe(2)
    const cardId = occBody.cards[0]!.id

    // 3. Create a mindmap
    const mmRes = await M.mindmaps.POST(
      post('/api/mindmaps', {
        title: 'Cognitive Biases',
        nodesJson: JSON.stringify([
          { id: 'root', text: 'Cognitive Biases', x: 500, y: 400, parentId: null },
          {
            id: 'n1',
            text: 'Anchoring: Over-relying on first info',
            x: 650,
            y: 400,
            parentId: 'root',
          },
          {
            id: 'n2',
            text: 'Confirmation: Seeking affirming evidence',
            x: 350,
            y: 400,
            parentId: 'root',
          },
        ]),
      }),
    )
    expect(mmRes.status).toBe(200)
    const mmBody = (await mmRes.json()) as { ok: boolean; mindmap: { id: number } }
    expect(mmBody.ok).toBe(true)
    const mmId = mmBody.mindmap.id

    // 4. List mindmaps and get single
    const listRes = await M.mindmaps.GET()
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as { ok: boolean; mindmaps: any[] }
    expect(listBody.mindmaps.some((m) => m.id === mmId)).toBe(true)

    const getRes = await M.mindmapsId.GET(req('GET', `/api/mindmaps/${mmId}`), {
      params: { id: String(mmId) },
    })
    expect(getRes.status).toBe(200)

    // 5. Generate flashcards from mindmap
    const genRes = await M.mindmapsIdCards.POST(post(`/api/mindmaps/${mmId}/cards`, { deckId }), {
      params: { id: String(mmId) },
    })
    expect(genRes.status).toBe(200)
    const genBody = (await genRes.json()) as { ok: boolean; importedCount: number }
    expect(genBody.ok).toBe(true)
    expect(genBody.importedCount).toBeGreaterThan(0)

    // 6. Record and retrieve sketch attempt image
    const attemptRes = await M.reviewAttemptImage.POST(
      post('/api/review/attempt-image', {
        cardId,
        imageData:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      }),
    )
    expect(attemptRes.status).toBe(200)
    const attemptBody = (await attemptRes.json()) as { ok: boolean; logged: { id: number } }
    expect(attemptBody.logged.id).toBeGreaterThan(0)

    const getAttemptRes = await M.reviewAttemptImage.GET(
      req('GET', `/api/review/attempt-image?cardId=${cardId}`),
    )
    expect(getAttemptRes.status).toBe(200)
    const getAttemptBody = (await getAttemptRes.json()) as { ok: boolean; attempt: any }
    expect(getAttemptBody.attempt).toBeDefined()
    expect(getAttemptBody.attempt.cardId).toBe(cardId)
  })

  it('handles Milestone 9: boss battles, deck sharing envelopes and decentralized friend leaderboard', async () => {
    // 1. Boss battles
    const bossGetRes = await M.boss.GET()
    expect(bossGetRes.status).toBe(200)
    const bossGetBody = (await bossGetRes.json()) as { ok: boolean; roster: any[] }
    expect(bossGetBody.ok).toBe(true)
    expect(bossGetBody.roster.length).toBeGreaterThanOrEqual(3)

    const bossStartRes = await M.boss.POST(
      post('/api/games/boss', { action: 'start', bossKey: 'chronos' }),
    )
    expect(bossStartRes.status).toBe(200)
    const bossStartBody = (await bossStartRes.json()) as { ok: boolean; battle: any }
    expect(bossStartBody.ok).toBe(true)
    expect(bossStartBody.battle.bossKey).toBe('chronos')
    expect(bossStartBody.battle.currentHp).toBe(200)

    const bossSyncRes = await M.boss.POST(post('/api/games/boss', { action: 'sync' }))
    expect(bossSyncRes.status).toBe(200)

    // 2. Share envelope export & import
    const deckRes = await M.decks.POST(post('/api/decks', { name: 'Social Share Deck' }))
    expect([200, 201]).toContain(deckRes.status)
    const deckBody = (await deckRes.json()) as { deck: { id: number } }
    const shareDeckId = deckBody.deck.id

    const cardRes = await M.cards.POST(
      post('/api/cards', {
        deckId: shareDeckId,
        type: 'basic',
        content: {
          front: 'Capital of France?',
          back: 'Paris',
        },
      }),
    )
    expect([200, 201]).toContain(cardRes.status)

    const exportRes = await M.shareExport.POST(
      post('/api/share/export', { type: 'deck', id: shareDeckId }),
    )
    expect(exportRes.status).toBe(200)
    const exportBody = (await exportRes.json()) as {
      ok: boolean
      shareString: string
      envelope: any
    }
    expect(exportBody.ok).toBe(true)
    expect(exportBody.shareString.startsWith('LH1_')).toBe(true)

    const importRes = await M.shareImport.POST(
      post('/api/share/import', { payload: exportBody.shareString }),
    )
    expect(importRes.status).toBe(200)
    const importBody = (await importRes.json()) as {
      ok: boolean
      deckId: number
      importedCount: number
    }
    expect(importBody.ok).toBe(true)
    expect(importBody.deckId).toBeGreaterThan(0)
    expect(importBody.importedCount).toBe(1)

    // 3. Decentralized Gist Friends Leaderboard
    const lbGetRes = await M.leaderboard.GET()
    expect(lbGetRes.status).toBe(200)
    const lbGetBody = (await lbGetRes.json()) as { ok: boolean; user: any; friends: any[] }
    expect(lbGetBody.ok).toBe(true)
    expect(lbGetBody.user.schema).toBe('lh-stats/v1')

    const addFriendRes = await M.leaderboard.POST(
      post('/api/social/leaderboard', {
        alias: 'LearnerBob',
        gistUrl: 'https://gist.githubusercontent.com/bob/12345/raw/stats.json',
      }),
    )
    expect(addFriendRes.status).toBe(200)
    const addFriendBody = (await addFriendRes.json()) as { ok: boolean; friend: { id: number } }
    expect(addFriendBody.ok).toBe(true)
    const friendId = addFriendBody.friend.id

    const deleteFriendRes = await M.leaderboard.DELETE(
      req('DELETE', `/api/social/leaderboard?id=${friendId}`),
    )
    expect(deleteFriendRes.status).toBe(200)
    const deleteFriendBody = (await deleteFriendRes.json()) as { ok: boolean }
    expect(deleteFriendBody.ok).toBe(true)
  })

  it('handles Milestone 10: online engagement, identity, study rooms, library, and buddies', async () => {
    // 1. Online Identity & Settings
    const identGetRes = await M.onlineIdentity.GET()
    expect(identGetRes.status).toBe(200)
    const identGetBody = (await identGetRes.json()) as {
      ok: boolean
      identity: any
      server: string
    }
    expect(identGetBody.ok).toBe(true)
    expect(identGetBody.identity.mode).toBe('offline')

    const identPostRes = await M.onlineIdentity.POST(
      post('/api/online/identity', {
        mode: 'device_key',
        alias: 'AdaExplorer',
        showOnLeaderboard: true,
      }),
    )
    expect(identPostRes.status).toBe(200)
    const identPostBody = (await identPostRes.json()) as { ok: boolean; identity: any }
    expect(identPostBody.ok).toBe(true)
    expect(identPostBody.identity.mode).toBe('device_key')
    expect(identPostBody.identity.alias).toBe('AdaExplorer')
    // M18: real ECDSA P-256 SPKI public key (base64), not a pk_ placeholder.
    expect((identPostBody.identity.pubKey ?? '').length).toBeGreaterThan(60)

    // 2. Study Rooms
    const roomPostRes = await M.onlineRooms.POST(
      post('/api/online/rooms', {
        title: 'Algorithms Sprint',
        pomodoroWorkMinutes: 25,
      }),
    )
    expect(roomPostRes.status).toBe(200)
    const roomPostBody = (await roomPostRes.json()) as { ok: boolean; code: string; room: any }
    expect(roomPostBody.ok).toBe(true)
    expect(roomPostBody.code).toHaveLength(6)

    const roomGetRes = await M.onlineRooms.GET(
      req('GET', `/api/online/rooms?code=${roomPostBody.code}`),
    )
    expect(roomGetRes.status).toBe(200)
    const roomGetBody = (await roomGetRes.json()) as { ok: boolean; room: any }
    expect(roomGetBody.ok).toBe(true)
    expect(roomGetBody.room.code).toBe(roomPostBody.code)

    // 3. Community Library
    const libGetRes = await M.onlineLibrary.GET(req('GET', '/api/online/library'))
    expect(libGetRes.status).toBe(200)
    const libGetBody = (await libGetRes.json()) as { ok: boolean; items: any[] }
    expect(libGetBody.ok).toBe(true)
    expect(libGetBody.items.length).toBeGreaterThan(0)

    const libPostRes = await M.onlineLibrary.POST(
      post('/api/online/library', {
        type: 'deck',
        title: 'Community Machine Learning',
        description: 'Core linear algebra & gradient descent flashcards',
        tags: ['ml', 'math'],
        shareString: 'LH1_simulated_share_string',
      }),
    )
    expect(libPostRes.status).toBe(200)
    const libPostBody = (await libPostRes.json()) as { ok: boolean; item: any }
    expect(libPostBody.ok).toBe(true)
    expect(libPostBody.item.title).toBe('Community Machine Learning')

    // 4. Accountability Buddies & Inbox
    const buddyPostRes = await M.onlineBuddies.POST(
      post('/api/online/buddies', {
        action: 'nudge',
        targetAlias: 'LearnerBob',
        message: 'Great streak! Let us review today.',
      }),
    )
    expect(buddyPostRes.status).toBe(200)
    const buddyPostBody = (await buddyPostRes.json()) as { ok: boolean; message: { id: number } }
    expect(buddyPostBody.ok).toBe(true)
    const messageId = buddyPostBody.message.id

    const buddyGetRes = await M.onlineBuddies.GET()
    expect(buddyGetRes.status).toBe(200)
    const buddyGetBody = (await buddyGetRes.json()) as { ok: boolean; messages: any[] }
    expect(buddyGetBody.ok).toBe(true)
    expect(buddyGetBody.messages.some((m) => m.id === messageId)).toBe(true)

    const markReadRes = await M.onlineBuddies.POST(
      post('/api/online/buddies', { action: 'mark_read', id: messageId }),
    )
    expect(markReadRes.status).toBe(200)
  })

  it('audio routes: commute digest, spoken answer evaluation & voice session records', async () => {
    // 1. Audio digest generation
    const digestRes = await M.audioDigest.GET(req('GET', '/api/audio/digest?limit=10&minutes=5'))
    expect(digestRes.status).toBe(200)
    const digestBody = (await digestRes.json()) as { ok: boolean; script: { cues: any[] } }
    expect(digestBody.ok).toBe(true)
    expect(Array.isArray(digestBody.script.cues)).toBe(true)

    // 2. Audio evaluation (exact / phonetic match)
    const gradeResExact = await M.audioGrade.POST(
      post('/api/audio/grade', {
        expected: 'Photosynthesis',
        spoken: 'Photosynthesis',
      }),
    )
    expect(gradeResExact.status).toBe(200)
    const gradeExactBody = (await gradeResExact.json()) as {
      ok: boolean
      grade: number
      pass: boolean
    }
    expect(gradeExactBody.ok).toBe(true)
    expect(gradeExactBody.pass).toBe(true)
    expect(gradeExactBody.grade).toBe(4)

    const gradeResFuzzy = await M.audioGrade.POST(
      post('/api/audio/grade', {
        expected: 'Mitochondria is the powerhouse of the cell',
        spoken: 'mitochondria is powerhouse of the cell',
      }),
    )
    expect(gradeResFuzzy.status).toBe(200)
    const gradeFuzzyBody = (await gradeResFuzzy.json()) as {
      ok: boolean
      grade: number
      pass: boolean
    }
    expect(gradeFuzzyBody.ok).toBe(true)
    expect(gradeFuzzyBody.pass).toBe(true)

    // 3. Audio sessions record & list
    const sessionPostRes = await M.audioSessions.POST(
      post('/api/audio/sessions', {
        durationSeconds: 320,
        cardCount: 8,
        mode: 'handsfree_review',
        speechEngine: 'web-speech',
      }),
    )
    expect(sessionPostRes.status).toBe(200)
    const sessionPostBody = (await sessionPostRes.json()) as {
      ok: boolean
      session: { id: number }
    }
    expect(sessionPostBody.ok).toBe(true)

    const sessionGetRes = await M.audioSessions.GET()
    expect(sessionGetRes.status).toBe(200)
    const sessionGetBody = (await sessionGetRes.json()) as { ok: boolean; sessions: any[] }
    expect(sessionGetBody.ok).toBe(true)
    expect(sessionGetBody.sessions.some((s) => s.id === sessionPostBody.session.id)).toBe(true)
  })

  it('power tools routes: quick-review due cards, quick-capture thoughts & vector embedding search', async () => {
    // 1. HUD quick-review cards
    const hudRes = await M.hudQuickReview.GET(req('GET', '/api/hud/quick-review?limit=3'))
    expect(hudRes.status).toBe(200)
    const hudBody = (await hudRes.json()) as { ok: boolean; cards: any[] }
    expect(hudBody.ok).toBe(true)
    expect(Array.isArray(hudBody.cards)).toBe(true)

    // 2. HUD quick-capture POST, GET, PATCH, DELETE
    const capturePost = await M.hudCapture.POST(
      post('/api/hud/capture', {
        text: 'Important research finding on neuroplasticity and spaced retrieval',
        sourceUrl: 'https://example.com/neuroplasticity',
        tags: ['neuro', 'memory'],
      }),
    )
    expect(capturePost.status).toBe(200)
    const capturePostBody = (await capturePost.json()) as {
      ok: boolean
      capture: { id: number; text: string }
    }
    expect(capturePostBody.ok).toBe(true)
    expect(capturePostBody.capture.id).toBeGreaterThan(0)
    const captureId = capturePostBody.capture.id

    const captureGet = await M.hudCapture.GET(req('GET', '/api/hud/capture'))
    expect(captureGet.status).toBe(200)
    const captureGetBody = (await captureGet.json()) as { ok: boolean; captures: any[] }
    expect(captureGetBody.ok).toBe(true)
    expect(captureGetBody.captures.some((c) => c.id === captureId)).toBe(true)

    const capturePatch = await M.hudCapture.PATCH(
      post('/api/hud/capture', { id: captureId, processed: true }),
    )
    expect(capturePatch.status).toBe(200)

    const captureDelete = await M.hudCapture.DELETE(
      req('DELETE', `/api/hud/capture?id=${captureId}`),
    )
    expect(captureDelete.status).toBe(200)

    // 3. Vector embedding search
    const searchRes = await M.embeddingsSearch.POST(
      post('/api/embeddings/search', {
        queryVector: [0.1, 0.5, 0.8, -0.2],
        topK: 5,
        minScore: -1,
      }),
    )
    expect(searchRes.status).toBe(200)
    const searchBody = (await searchRes.json()) as { ok: boolean; matches: any[] }
    expect(searchBody.ok).toBe(true)
    expect(Array.isArray(searchBody.matches)).toBe(true)
  })

  it('knowledge graph & anki routes: prerequisite edges, cycle rejection, remedial pause & anki sync', async () => {
    // 1. Add valid prerequisite edge
    const addEdgeRes = await M.graphDeps.POST(
      post('/api/curriculum/graph/dependencies', {
        sourceConcept: 'Probability',
        targetConcept: 'Bayesian Inference',
        strength: 0.95,
      }),
    )
    expect(addEdgeRes.status).toBe(200)
    const addEdgeBody = (await addEdgeRes.json()) as { ok: boolean; dependency: { id: number } }
    expect(addEdgeBody.ok).toBe(true)
    const edgeId = addEdgeBody.dependency.id

    // 2. Reject circular dependency
    const cycleRes = await M.graphDeps.POST(
      post('/api/curriculum/graph/dependencies', {
        sourceConcept: 'Bayesian Inference',
        targetConcept: 'Probability',
        strength: 1.0,
      }),
    )
    expect(cycleRes.status).toBe(400)
    const cycleBody = (await cycleRes.json()) as { ok: boolean; error: string }
    expect(cycleBody.ok).toBe(false)
    expect(cycleBody.error).toContain('circular dependency')

    // 3. List dependencies
    const listRes = await M.graphDeps.GET(req('GET', '/api/curriculum/graph/dependencies'))
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as { ok: boolean; dependencies: any[] }
    expect(listBody.ok).toBe(true)
    expect(listBody.dependencies.some((d) => d.id === edgeId)).toBe(true)

    // 4. Remedial pause check
    const remedialRes = await M.graphRemedial.POST(
      post('/api/curriculum/graph/remedial', {
        conceptId: 'Bayesian Inference',
        nodes: [
          { id: 'Probability', title: 'Probability', mastery: 0.4, lapses: 2 },
          { id: 'Bayesian Inference', title: 'Bayesian Inference', mastery: 0.1, lapses: 0 },
        ],
        threshold: 0.7,
      }),
    )
    expect(remedialRes.status).toBe(200)
    const remedialBody = (await remedialRes.json()) as {
      ok: boolean
      result: { blocked: boolean; remedialConceptId?: string }
    }
    expect(remedialBody.ok).toBe(true)
    expect(remedialBody.result.blocked).toBe(true)
    expect(remedialBody.result.remedialConceptId).toBe('Probability')

    // 5. AnkiConnect test connection & card sync
    const ankiTestRes = await M.ankiConnect.POST(
      post('/api/anki/connect', { action: 'test_connection' }),
    )
    expect(ankiTestRes.status).toBe(200)
    const ankiTestBody = (await ankiTestRes.json()) as { ok: boolean; loopbackUrl: string }
    expect(ankiTestBody.ok).toBe(true)
    expect(ankiTestBody.loopbackUrl).toContain('8765')

    const ankiSyncRes = await M.ankiConnect.POST(
      post('/api/anki/connect', {
        action: 'sync_card',
        cardId: 1,
        ankiNoteId: 101234,
        syncMode: 'live_loopback',
      }),
    )
    expect(ankiSyncRes.status).toBe(200)

    const ankiGetRes = await M.ankiConnect.GET()
    expect(ankiGetRes.status).toBe(200)
    const ankiGetBody = (await ankiGetRes.json()) as { ok: boolean; count: number }
    expect(ankiGetBody.ok).toBe(true)
    expect(ankiGetBody.count).toBeGreaterThan(0)
  })

  it('multiplayer guilds, 1v1 duels & seasonal study pass routes', async () => {
    // 1. Guilds: create clan, list clans, contribute pooled XP
    const createGuildRes = await M.socialGuilds.POST(
      post('/api/social/guilds', {
        action: 'create',
        name: 'Curie Laboratory',
        tag: 'CURIE',
        description: 'Deliberate chemistry & radiation physics recall',
        leaderAlias: 'Marie',
      }),
    )
    expect(createGuildRes.status).toBe(200)
    const createGuildBody = (await createGuildRes.json()) as {
      ok: boolean
      guild: { id: number; name: string }
    }
    expect(createGuildBody.ok).toBe(true)
    const guildId = createGuildBody.guild.id

    const listGuildsRes = await M.socialGuilds.GET(req('GET', '/api/social/guilds'))
    expect(listGuildsRes.status).toBe(200)
    const listGuildsBody = (await listGuildsRes.json()) as { ok: boolean; guilds: any[] }
    expect(listGuildsBody.ok).toBe(true)
    expect(listGuildsBody.guilds.some((g) => g.id === guildId)).toBe(true)

    const contributeRes = await M.socialGuilds.POST(
      post('/api/social/guilds', {
        action: 'contribute',
        guildId,
        alias: 'Marie',
        xp: 1500,
      }),
    )
    expect(contributeRes.status).toBe(200)
    const contributeBody = (await contributeRes.json()) as {
      ok: boolean
      guild: { level: number; totalXp: number }
    }
    expect(contributeBody.ok).toBe(true)
    expect(contributeBody.guild.totalXp).toBeGreaterThanOrEqual(1500)
    expect(contributeBody.guild.level).toBeGreaterThanOrEqual(2)

    // 2. 1v1 Duels: record duel outcome & recalculate Elo
    const duelPostRes = await M.socialDuels.POST(
      post('/api/social/duels', {
        player1Alias: 'LearnerAlice',
        player2Alias: 'Ada Lovelace (Bot)',
        winnerAlias: 'LearnerAlice',
        player1Score: 650,
        player2Score: 500,
        player1CurrentElo: 1200,
        player2CurrentElo: 1200,
      }),
    )
    expect(duelPostRes.status).toBe(200)
    const duelPostBody = (await duelPostRes.json()) as {
      ok: boolean
      duel: { id: number }
      eloUpdates: { player1: { next: number }; player2: { next: number } }
    }
    expect(duelPostBody.ok).toBe(true)
    expect(duelPostBody.eloUpdates.player1.next).toBe(1216)
    expect(duelPostBody.eloUpdates.player2.next).toBe(1184)

    const duelsGetRes = await M.socialDuels.GET(req('GET', '/api/social/duels'))
    expect(duelsGetRes.status).toBe(200)
    const duelsGetBody = (await duelsGetRes.json()) as { ok: boolean; duels: any[] }
    expect(duelsGetBody.ok).toBe(true)
    expect(duelsGetBody.duels.some((d) => d.id === duelPostBody.duel.id)).toBe(true)

    // 3. Seasonal Study Pass: status, progress, reward claim
    const seasonsGetRes = await M.socialSeasons.GET(req('GET', '/api/social/seasons'))
    expect(seasonsGetRes.status).toBe(200)
    const seasonsGetBody = (await seasonsGetRes.json()) as {
      ok: boolean
      tiers: any[]
      progress: any
    }
    expect(seasonsGetBody.ok).toBe(true)
    expect(seasonsGetBody.tiers.length).toBe(30)

    const addXpRes = await M.socialSeasons.POST(
      post('/api/social/seasons', { action: 'add_xp', xp: 550 }),
    )
    expect(addXpRes.status).toBe(200)
    const addXpBody = (await addXpRes.json()) as { ok: boolean; progress: { currentTier: number } }
    expect(addXpBody.ok).toBe(true)
    expect(addXpBody.progress.currentTier).toBeGreaterThanOrEqual(5)

    const claimRes = await M.socialSeasons.POST(
      post('/api/social/seasons', { action: 'claim_reward', tier: 5 }),
    )
    expect(claimRes.status).toBe(200)
    const claimBody = (await claimRes.json()) as {
      ok: boolean
      progress: { claimedRewards: number[] }
    }
    expect(claimBody.ok).toBe(true)
    expect(claimBody.progress.claimedRewards).toContain(5)
  })

  it('3D Low-Poly World, Verified Study Coins & Timers (M16)', async () => {
    // 1. World State
    const stateRes = await M.worldState.GET(req('GET', '/api/world/state'))
    expect(stateRes.status).toBe(200)
    const stateBody = (await stateRes.json()) as {
      ok: boolean
      avatar: { characterId: string }
      balance: number
      plots: any[]
      settings: { viewMode: string }
    }
    expect(stateBody.ok).toBe(true)
    expect(stateBody.avatar.characterId).toBeDefined()

    // 2. Verified Review study coin minting
    const reviewRes = await M.worldVerifyReview.POST(
      post('/api/world/verify/review', {
        cardId: 101,
        elapsedMs: 2500,
        rating: 3,
      }),
    )
    expect(reviewRes.status).toBe(200)
    const reviewBody = (await reviewRes.json()) as {
      ok: boolean
      valid: boolean
      coinsAwarded: number
      balance: number
    }
    expect(reviewBody.ok).toBe(true)
    expect(reviewBody.valid).toBe(true)
    expect(reviewBody.coinsAwarded).toBe(2)

    // 3. Verified Focus Block study coin minting
    const focusRes = await M.worldVerifyFocus.POST(
      post('/api/world/verify/focus', {
        plannedMinutes: 25,
        actualSeconds: 1500,
        heartbeatsCount: 20,
        completedWithoutExit: true,
      }),
    )
    expect(focusRes.status).toBe(200)
    const focusBody = (await focusRes.json()) as {
      ok: boolean
      valid: boolean
      coinsAwarded: number
      balance: number
    }
    expect(focusBody.ok).toBe(true)
    expect(focusBody.valid).toBe(true)
    expect(focusBody.coinsAwarded).toBe(30)

    // 4. Plant a tree plot
    const plotRes = await M.worldPlots.POST(
      post('/api/world/plots', {
        treeType: 'tree_oak',
        durationMinutes: 25,
      }),
    )
    expect(plotRes.status).toBe(200)
    const plotBody = (await plotRes.json()) as { ok: boolean; plot: { treeType: string } }
    expect(plotBody.ok).toBe(true)
    expect(plotBody.plot.treeType).toBe('tree_oak')

    // 5. Market catalog and purchase
    const marketRes = await M.worldMarket.GET(req('GET', '/api/world/market'))
    expect(marketRes.status).toBe(200)
    const marketBody = (await marketRes.json()) as { ok: boolean; catalog: any[] }
    expect(marketBody.ok).toBe(true)
    expect(marketBody.catalog.length).toBeGreaterThan(5)

    // Purchase quill (80 coins)
    const buyRes = await M.worldMarket.POST(post('/api/world/market', { itemId: 'hand_quill' }))
    expect(buyRes.status).toBe(200)
    const buyBody = (await buyRes.json()) as { ok: boolean; avatar: { unlockedItems: string[] } }
    expect(buyBody.ok).toBe(true)
    expect(buyBody.avatar.unlockedItems).toContain('hand_quill')

    // 6. Equip item on avatar
    const equipRes = await M.worldAvatar.POST(
      post('/api/world/avatar', { equippedHand: 'hand_quill' }),
    )
    expect(equipRes.status).toBe(200)
    const equipBody = (await equipRes.json()) as { ok: boolean; avatar: { equippedHand: string } }
    expect(equipBody.ok).toBe(true)
    expect(equipBody.avatar.equippedHand).toBe('hand_quill')

    // 7. Update world settings
    const settingsRes = await M.worldSettings.POST(
      post('/api/world/settings', { timerTheme: 'hourglass', viewMode: 'diorama' }),
    )
    expect(settingsRes.status).toBe(200)
    const settingsBody = (await settingsRes.json()) as {
      ok: boolean
      settings: { timerTheme: string; viewMode: string }
    }
    expect(settingsBody.ok).toBe(true)
    expect(settingsBody.settings.timerTheme).toBe('hourglass')
    expect(settingsBody.settings.viewMode).toBe('diorama')
  })
})
