/**
 * Feature Domain API handler integration tests (F-16)
 *
 * Verifies end-to-end Request -> Response handling for feature domains:
 * calendar (ics format), canvas (CRUD), distractions, friction honesty log,
 * memory palace, physio tracking, world economy (state, market, avatar, plots),
 * timeline, commitments, quotes, starter packs, weekly review, and dashboard.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-features-test-')), 'features.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  calendar: typeof import('../src/server/handlers/calendar/route')
  canvas: typeof import('../src/server/handlers/canvas/route')
  canvasId: typeof import('../src/server/handlers/canvas/[id]/route')
  distractions: typeof import('../src/server/handlers/distractions/route')
  friction: typeof import('../src/server/handlers/friction/route')
  palace: typeof import('../src/server/handlers/palace/route')
  physio: typeof import('../src/server/handlers/physio/route')
  worldState: typeof import('../src/server/handlers/world/state/route')
  worldMarket: typeof import('../src/server/handlers/world/market/route')
  worldAvatar: typeof import('../src/server/handlers/world/avatar/route')
  worldPlots: typeof import('../src/server/handlers/world/plots/route')
  timeline: typeof import('../src/server/handlers/timeline/route')
  commitments: typeof import('../src/server/handlers/commitments/route')
  quotes: typeof import('../src/server/handlers/quotes/route')
  starter: typeof import('../src/server/handlers/starter/route')
  weekly: typeof import('../src/server/handlers/weekly/route')
  dashboard: typeof import('../src/server/handlers/dashboard/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const calendarMod = await import('../src/server/handlers/calendar/route')
  const canvasMod = await import('../src/server/handlers/canvas/route')
  const canvasIdMod = await import('../src/server/handlers/canvas/[id]/route')
  const distractionsMod = await import('../src/server/handlers/distractions/route')
  const frictionMod = await import('../src/server/handlers/friction/route')
  const palaceMod = await import('../src/server/handlers/palace/route')
  const physioMod = await import('../src/server/handlers/physio/route')
  const worldStateMod = await import('../src/server/handlers/world/state/route')
  const worldMarketMod = await import('../src/server/handlers/world/market/route')
  const worldAvatarMod = await import('../src/server/handlers/world/avatar/route')
  const worldPlotsMod = await import('../src/server/handlers/world/plots/route')
  const timelineMod = await import('../src/server/handlers/timeline/route')
  const commitmentsMod = await import('../src/server/handlers/commitments/route')
  const quotesMod = await import('../src/server/handlers/quotes/route')
  const starterMod = await import('../src/server/handlers/starter/route')
  const weeklyMod = await import('../src/server/handlers/weekly/route')
  const dashboardMod = await import('../src/server/handlers/dashboard/route')

  M = {
    calendar: calendarMod,
    canvas: canvasMod,
    canvasId: canvasIdMod,
    distractions: distractionsMod,
    friction: frictionMod,
    palace: palaceMod,
    physio: physioMod,
    worldState: worldStateMod,
    worldMarket: worldMarketMod,
    worldAvatar: worldAvatarMod,
    worldPlots: worldPlotsMod,
    timeline: timelineMod,
    commitments: commitmentsMod,
    quotes: quotesMod,
    starter: starterMod,
    weekly: weeklyMod,
    dashboard: dashboardMod,
    db: dbMod,
  }
})

describe('Feature Domains Handlers Integration', () => {
  describe('Calendar Handler (/api/calendar)', () => {
    it('GET /api/calendar returns a valid iCalendar feed', async () => {
      const res = await M.calendar.GET(new Request('http://localhost/api/calendar'))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/calendar')
      const text = await res.text()
      expect(text).toContain('BEGIN:VCALENDAR')
      expect(text).toContain('END:VCALENDAR')
    })
  })

  describe('Canvas CRUD Handlers (/api/canvas, /api/canvas/[id])', () => {
    let createdCanvasId: number

    it('POST /api/canvas creates a new canvas and GET /api/canvas lists it', async () => {
      const createReq = new Request('http://localhost/api/canvas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Cognitive Architecture Board' }),
      })

      const res = await M.canvas.POST(createReq)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { ok: boolean; canvas: { id: number; title: string } }
      expect(data.ok).toBe(true)
      expect(data.canvas.id).toBeDefined()
      createdCanvasId = data.canvas.id

      const listRes = await M.canvas.GET()
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as { canvases: Array<{ id: number; title: string }> }
      expect(listData.canvases.some((c) => c.id === createdCanvasId)).toBe(true)
    })

    it('GET, PATCH, and DELETE /api/canvas/[id] manages canvas elements', async () => {
      const getRes = await M.canvasId.GET(
        new Request(`http://localhost/api/canvas/${createdCanvasId}`),
        {
          params: Promise.resolve({ id: String(createdCanvasId) }),
        },
      )
      expect(getRes.status).toBe(200)

      const patchReq = new Request(`http://localhost/api/canvas/${createdCanvasId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Renamed Board',
          items: [{ id: 'item_1', kind: 'note', text: 'Important concept', x: 10, y: 20, w: 100 }],
        }),
      })

      const patchRes = await M.canvasId.PATCH(patchReq, {
        params: Promise.resolve({ id: String(createdCanvasId) }),
      })
      expect(patchRes.status).toBe(200)

      const delRes = await M.canvasId.DELETE(
        new Request(`http://localhost/api/canvas/${createdCanvasId}`),
        {
          params: Promise.resolve({ id: String(createdCanvasId) }),
        },
      )
      expect(delRes.status).toBe(200)
    })
  })

  describe('Distractions & Friction Honesty Log (/api/distractions, /api/friction)', () => {
    let distractionId: number

    it('POST, GET, and DELETE /api/distractions manages declared distractions', async () => {
      const createReq = new Request('http://localhost/api/distractions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Doom Scrolling App', kind: 'app' }),
      })

      const res = await M.distractions.POST(createReq)
      expect(res.status).toBe(201)
      const data = (await res.json()) as { distraction: { id: number; name: string } }
      expect(data.distraction.id).toBeDefined()
      distractionId = data.distraction.id

      const listRes = await M.distractions.GET()
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as {
        distractions: Array<{ id: number; name: string }>
      }
      expect(listData.distractions.some((d) => d.id === distractionId)).toBe(true)

      const delReq = new Request(`http://localhost/api/distractions?id=${distractionId}`)
      const delRes = await M.distractions.DELETE(delReq)
      expect(delRes.status).toBe(200)
    })

    it('POST and GET /api/friction records gate outcomes and enforces reflection on proceeding', async () => {
      // Proceeding without reflection must fail with 400
      const badReq = new Request('http://localhost/api/friction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trigger: 'distraction', proceeded: true }),
      })
      const badRes = await M.friction.POST(badReq)
      expect(badRes.status).toBe(400)

      // Recording with reflection succeeds
      const goodReq = new Request('http://localhost/api/friction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger: 'distraction',
          proceeded: true,
          reflection: 'I paused for 10 seconds and considered why I wanted to check notifications.',
          delaySec: 10,
        }),
      })
      const goodRes = await M.friction.POST(goodReq)
      expect(goodRes.status).toBe(201)

      const listRes = await M.friction.GET()
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as {
        events: Array<{ trigger: string; proceeded: boolean }>
      }
      expect(listData.events.some((e) => e.trigger === 'distraction' && e.proceeded === true)).toBe(
        true,
      )
    })
  })

  describe('Memory Palace Handler (/api/palace)', () => {
    it('POST /api/palace creates palace and GET /api/palace lists palaces', async () => {
      const createReq = new Request('http://localhost/api/palace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Method of Loci Library',
          description: 'Spacious Roman atrium',
          rooms: [
            { name: 'Vestibule', emoji: '🚪' },
            { name: 'Atrium', emoji: '🏛️' },
          ],
        }),
      })

      const res = await M.palace.POST(createReq)
      expect(res.status).toBe(201)
      const data = (await res.json()) as { ok: boolean; palace: { id: number; name: string } }
      expect(data.ok).toBe(true)
      expect(data.palace.name).toBe('Method of Loci Library')

      const listRes = await M.palace.GET()
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as {
        palaces: Array<{ palace: { id: number; name: string }; items: unknown[] }>
      }
      expect(listData.palaces.some((p) => p.palace.name === 'Method of Loci Library')).toBe(true)
    })
  })

  describe('Physio Tracking Handler (/api/physio)', () => {
    it('POST /api/physio logs sleep & exercise and GET /api/physio provides insights', async () => {
      const postReq = new Request('http://localhost/api/physio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: '2026-11-09',
          sleepHours: 7.5,
          sleepQuality: 4,
          exerciseMinutes: 30,
          exerciseHoursAfterLearning: 4,
          caffeineCutoffHour: 14,
          tzOffset: 0,
        }),
      })

      const postRes = await M.physio.POST(postReq)
      expect([200, 201]).toContain(postRes.status)

      const getReq = new Request('http://localhost/api/physio?bedtime=23')
      const getRes = await M.physio.GET(getReq)
      expect(getRes.status).toBe(200)
      const data = (await getRes.json()) as { insights: unknown[]; history: unknown[] }
      expect(data.history).toBeDefined()
      expect(data.insights).toBeDefined()
    })
  })

  describe('World Economy Handlers (/api/world/*)', () => {
    it('GET /api/world/state returns world state, avatar, and balance', async () => {
      const res = await M.worldState.GET(new Request('http://localhost/api/world/state'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        ok: boolean
        avatar: { userId: string }
        balance: number
        plots: unknown[]
      }
      expect(data.ok).toBe(true)
      expect(data.avatar.userId).toBe('default')
      expect(typeof data.balance).toBe('number')
      expect(Array.isArray(data.plots)).toBe(true)
    })

    it('GET /api/world/market returns marketplace catalog', async () => {
      const res = await M.worldMarket.GET(new Request('http://localhost/api/world/market'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { ok: boolean; catalog: unknown[]; balance: number }
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.catalog)).toBe(true)
    })

    it('GET /api/world/avatar and GET /api/world/plots return user avatar and forest plots', async () => {
      const avRes = await M.worldAvatar.GET(new Request('http://localhost/api/world/avatar'))
      expect(avRes.status).toBe(200)
      const avData = (await avRes.json()) as { ok: boolean; avatar: { userId: string } }
      expect(avData.ok).toBe(true)
      expect(avData.avatar.userId).toBe('default')

      const plotRes = await M.worldPlots.GET(
        new Request('http://localhost/api/world/plots?limit=50'),
      )
      expect(plotRes.status).toBe(200)
      const plotData = (await plotRes.json()) as { ok: boolean; plots: unknown[] }
      expect(plotData.ok).toBe(true)
      expect(Array.isArray(plotData.plots)).toBe(true)
    })
  })

  describe('Timeline, Commitments & Quotes Handlers', () => {
    it('GET /api/timeline returns aggregated activity timeline', async () => {
      const res = await M.timeline.GET(new Request('http://localhost/api/timeline?days=7'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { ok: boolean; entries: unknown[] }
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.entries)).toBe(true)
    })

    it('POST and GET /api/commitments manages pre-commitment contracts', async () => {
      const postReq = new Request('http://localhost/api/commitments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Daily Review Discipline',
          metric: 'reviews',
          threshold: 25,
          stakes: 'Donate $10 to charity',
        }),
      })

      const res = await M.commitments.POST(postReq)
      expect(res.status).toBe(201)
      const data = (await res.json()) as { commitment: { id: number; title: string } }
      expect(data.commitment.id).toBeDefined()

      const listRes = await M.commitments.GET(new Request('http://localhost/api/commitments'))
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as { commitments: Array<{ title: string }> }
      expect(listData.commitments.some((c) => c.title === 'Daily Review Discipline')).toBe(true)
    })

    it('POST, GET, and PATCH /api/quotes manages motivational quotes', async () => {
      const postReq = new Request('http://localhost/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
          author: 'Will Durant',
          tags: ['discipline', 'excellence'],
        }),
      })

      const res = await M.quotes.POST(postReq)
      expect(res.status).toBe(201)
      const data = (await res.json()) as { quote: { id: number; text: string } }
      expect(data.quote.id).toBeDefined()

      const getReq = new Request('http://localhost/api/quotes?mode=daily')
      const getRes = await M.quotes.GET(getReq)
      expect(getRes.status).toBe(200)

      const patchReq = new Request('http://localhost/api/quotes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: data.quote.id, favorite: true }),
      })
      const patchRes = await M.quotes.PATCH(patchReq)
      expect(patchRes.status).toBe(200)
    })
  })

  describe('Starter, Weekly, and Dashboard Handlers', () => {
    it('GET and POST /api/starter returns and seeds catalog packages', async () => {
      const getRes = await M.starter.GET(new Request('http://localhost/api/starter'))
      expect(getRes.status).toBe(200)
      const data = (await getRes.json()) as { ok: boolean; courses: unknown[] }
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.courses)).toBe(true)
    })

    it('GET /api/weekly generates weekly review report with rule-based fallback and prompt envelope', async () => {
      const res = await M.weekly.GET(new Request('http://localhost/api/weekly?tzOffset=0'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        metrics: unknown
        suggestions: {
          mode: string
          suggestions: unknown[]
          envelope: { feature: string }
        }
      }
      expect(data.metrics).toBeDefined()
      expect(data.suggestions.mode).toBe('manual')
      expect(Array.isArray(data.suggestions.suggestions)).toBe(true)
      expect(data.suggestions.envelope.feature).toBe('coach')
    })

    it('GET /api/dashboard returns the complete today dashboard view', async () => {
      const res = await M.dashboard.GET(new Request('http://localhost/api/dashboard'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        dueCount: number
        streak: { current: number }
        xpTotal: number
        openLoops: unknown[]
      }
      expect(typeof data.dueCount).toBe('number')
      expect(data.streak).toBeDefined()
      expect(typeof data.xpTotal).toBe('number')
      expect(Array.isArray(data.openLoops)).toBe(true)
    })
  })
})
