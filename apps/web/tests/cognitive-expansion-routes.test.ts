/**
 * Cognitive-expansion API routes end-to-end against an isolated temp SQLite DB
 * (LEARNING_HUB_DB; an empty file is enough — ensureSchema() creates every table
 * and runs migrations on first open). Covers the commute, TMR, GKT, cognitive
 * load, dialectic, ingest and 3D-palace handlers: zod query/body validation,
 * 404/409 paths, the single grading path, and the answer-key/XP rules.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-cog-routes-')), 'cog.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = Record<string, any>
const M: Modules = {}

const BASE = 'http://localhost'
const get = (path: string) => new Request(`${BASE}${path}`)
const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

let deckId: number
let cardId: number

beforeAll(async () => {
  M.commute = await import('../app/api/audio/circadian/commute/route')
  M.tmr = await import('../app/api/audio/tmr/cues/route')
  M.gkt = await import('../app/api/cognitive/gkt/route')
  M.load = await import('../app/api/cognitive/load/route')
  M.arena = await import('../app/api/dialectic/arena/route')
  M.ingest = await import('../app/api/ingest/multimodal/route')
  M.palace3d = await import('../app/api/spatial/palace-3d/route')
  M.api = await import('../src/lib/api')
  M.db = await import('@learning-hub/db')

  const { db, decks, cards } = M.db
  deckId = db.insert(decks).values({ name: 'Commute Deck' }).returning().all()[0].id
  cardId = db
    .insert(cards)
    .values({
      deckId,
      type: 'basic',
      due: '2020-01-01T00:00:00.000Z',
      // a valid mature FSRS review-state card (S = 40 d needs a real difficulty)
      stability: 40,
      difficulty: 5,
      state: 2,
      reps: 4,
      lastReview: '2019-11-20T00:00:00.000Z',
      content: { basic: { front: 'What is FSRS?', back: 'A spaced repetition scheduler' } },
    })
    .returning()
    .all()[0].id
})

describe('readQuery', () => {
  it('coerces, defaults, drops empty values and 400s on bad input', async () => {
    const { z } = await import('zod')
    const schema = z.object({ n: z.coerce.number().int().default(5) })
    expect(M.api.readQuery(get('/x?n='), schema)).toEqual({ n: 5 })
    expect(M.api.readQuery(get('/x?n=7'), schema)).toEqual({ n: 7 })
    expect(() => M.api.readQuery(get('/x?n=abc'), schema)).toThrow(M.api.ApiError)
  })
})

describe('/api/audio/circadian/commute', () => {
  it('GET speaks real card text with a stability-paced pause', async () => {
    const res = await M.commute.GET(get(`/api/audio/circadian/commute?deckId=${deckId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    const cue = body.cues.find((c: any) => c.cardId === cardId)
    expect(cue.promptText).toBe('What is FSRS?')
    expect(cue.answerText).toBe('A spaced repetition scheduler')
    // S = 40 days → a longer (deliberate) pause than a brand-new card's 2.5 s floor
    expect(cue.pauseMs).toBeGreaterThan(2500)
    expect(body.binauralPreset.beatDelta).toBe(40)
  })

  it('GET rejects invalid query params with 400 (not NaN limits)', async () => {
    expect((await M.commute.GET(get('/api/audio/circadian/commute?limit=abc'))).status).toBe(400)
    expect((await M.commute.GET(get('/api/audio/circadian/commute?binaural=loud'))).status).toBe(
      400,
    )
  })

  it('POST grades through executeReview, reports failures and mints TMR cues', async () => {
    const before = M.db.db
      .select()
      .from(M.db.revlog)
      .all()
      .filter((r: any) => r.cardId === cardId).length
    const res = await M.commute.POST(
      post('/api/audio/circadian/commute', {
        sessionMode: 'commute',
        cardsReviewed: 2,
        durationSeconds: 60,
        binauralMode: 'none',
        handsFreeInputs: [
          { cardId, inputType: 'manual_tap', grade: 3, latencyMs: 2100, timestamp: 'now' },
          { cardId: 999999, inputType: 'manual_tap', grade: 3, latencyMs: 2100, timestamp: 'now' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([expect.objectContaining({ cardId: 999999 })])
    expect(body.gradedCount).toBe(1)
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0].cardId).toBe(999999)
    expect(body.tmrCuesMinted).toBe(1)
    const after = M.db.db
      .select()
      .from(M.db.revlog)
      .all()
      .filter((r: any) => r.cardId === cardId).length
    expect(after).toBe(before + 1) // the single grading path wrote the revlog row
  })
})

describe('/api/audio/tmr/cues', () => {
  it('lists the cue minted by the commute session', async () => {
    const body = await (await M.tmr.GET(get('/api/audio/tmr/cues'))).json()
    expect(body.cues.some((c: any) => c.cardId === cardId)).toBe(true)
  })

  it('mint_cue 404s for an unknown card and mints for a real one', async () => {
    expect(
      (await M.tmr.POST(post('/api/audio/tmr/cues', { action: 'mint_cue', cardId: 424242 })))
        .status,
    ).toBe(404)
    const ok = await M.tmr.POST(post('/api/audio/tmr/cues', { action: 'mint_cue', cardId }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).cue.cardId).toBe(cardId)
  })

  it('mint_recent mints from the last day of reviews', async () => {
    const body = await (
      await M.tmr.POST(post('/api/audio/tmr/cues', { action: 'mint_recent' }))
    ).json()
    expect(body.minted).toBeGreaterThanOrEqual(1)
  })

  it('record_sleep_playback counts sleep cues; unknown actions are 400', async () => {
    const res = await M.tmr.POST(
      post('/api/audio/tmr/cues', { action: 'record_sleep_playback', playedCardIds: [cardId] }),
    )
    expect((await res.json()).playedCount).toBe(1)
    const cue = (await (await M.tmr.GET(get('/api/audio/tmr/cues'))).json()).cues.find(
      (c: any) => c.cardId === cardId,
    )
    expect(cue.timesCuedSleep).toBe(1)
    expect((await M.tmr.POST(post('/api/audio/tmr/cues', { action: 'dance' }))).status).toBe(400)
  })
})

describe('/api/cognitive/gkt', () => {
  const upsert = (id: string, title: string, masteryProb?: number) =>
    M.gkt.POST(
      post('/api/cognitive/gkt', { action: 'upsert_node', nodeData: { id, title, masteryProb } }),
    )
  const link = (prerequisiteId: string, dependentId: string) =>
    M.gkt.POST(
      post('/api/cognitive/gkt', { action: 'add_edge', edgeData: { prerequisiteId, dependentId } }),
    )

  it('builds a DAG and refuses a cycle with 409', async () => {
    expect((await upsert('algebra', 'Algebra', 0.3)).status).toBe(200)
    expect((await upsert('calculus', 'Calculus', 0.5)).status).toBe(200)
    expect((await link('algebra', 'calculus')).status).toBe(200)
    expect((await link('calculus', 'algebra')).status).toBe(409)
    expect((await link('algebra', 'ghost')).status).toBe(404)
  })

  it('evaluate_review propagates blame and diagnoses the weak prerequisite', async () => {
    const res = await M.gkt.POST(
      post('/api/cognitive/gkt', { action: 'evaluate_review', nodeId: 'calculus', passed: false }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rootCauseAlert.culpritPrerequisiteId).toBe('algebra')
    const dag = await (await M.gkt.GET(get('/api/cognitive/gkt'))).json()
    expect(dag.nodes.map((n: any) => n.id).indexOf('algebra')).toBeLessThan(
      dag.nodes.map((n: any) => n.id).indexOf('calculus'),
    )
    const algebra = dag.nodes.find((n: any) => n.id === 'algebra')
    expect(algebra.masteryProb).toBeLessThan(0.3)
  })

  it('404s an unknown concept and 400s out-of-range probabilities', async () => {
    expect(
      (
        await M.gkt.POST(
          post('/api/cognitive/gkt', { action: 'evaluate_review', nodeId: 'nope', passed: true }),
        )
      ).status,
    ).toBe(404)
    expect((await upsert('bad', 'Bad', 3)).status).toBe(400)
    expect((await M.gkt.GET(get('/api/cognitive/gkt?courseId=x'))).status).toBe(400)
  })
})

describe('/api/cognitive/load', () => {
  it('stores the real keystroke jitter and the evaluation', async () => {
    const res = await M.load.POST(
      post('/api/cognitive/load', {
        cardId,
        responseLatencyMs: 9000,
        keystrokeTimestamps: [300, 0, 100, 200], // out of order on purpose
        backspaceCount: 0,
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.evaluation.flowZone).toBeDefined()
    const events = (await (await M.load.GET(get(`/api/cognitive/load?cardId=${cardId}`))).json())
      .events
    const ev = events.find((e: any) => e.id === body.eventId)
    expect(ev.hesitationVariance).toBe(0) // sorted → even 100 ms gaps → zero jitter
  })

  it('404s an unknown card and 400s a negative latency', async () => {
    expect(
      (await M.load.POST(post('/api/cognitive/load', { cardId: 777777, responseLatencyMs: 10 })))
        .status,
    ).toBe(404)
    expect((await M.load.POST(post('/api/cognitive/load', { responseLatencyMs: -1 }))).status).toBe(
      400,
    )
  })
})

describe('/api/dialectic/arena', () => {
  let debateId: number

  it('lists the case library and starts a case without leaking the answer key', async () => {
    const list = await (await M.arena.GET(get('/api/dialectic/arena'))).json()
    expect(list.cases.length).toBeGreaterThan(0)
    const res = await M.arena.POST(
      post('/api/dialectic/arena', { action: 'start_case', slug: 'monolith-vs-microservices' }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    debateId = body.debate.id
    expect(body.debate.transcript).toHaveLength(2)
    expect(body.debate.transcript[0].fallaciesFlagged).toBeUndefined()
    expect(body.case.protegeQuestion).toContain('distributed transactions')
    const one = await (await M.arena.GET(get(`/api/dialectic/arena?id=${debateId}`))).json()
    expect(one.debate.transcript[1].fallaciesFlagged).toBeUndefined()
  })

  it('grades a flag against the chosen turn only', async () => {
    const flag = async (turnId: string, fallacy: string) =>
      (
        await M.arena.POST(
          post('/api/dialectic/arena', {
            action: 'evaluate_fallacy',
            id: debateId,
            turnId,
            fallacy,
          }),
        )
      ).json()
    expect((await flag('turn-2', 'false_dichotomy')).correct).toBe(true)
    // ad hominem is in turn 1, not turn 2
    expect((await flag('turn-2', 'ad_hominem')).correct).toBe(false)
    expect((await flag('turn-1', 'ad_hominem')).correct).toBe(true)
  })

  it('stores the verdict and awards XP once', async () => {
    const verdict =
      'A monolith wins when one small team owns the product and latency and consistency matter, because a single deploy is simpler; split services along domain boundaries only once several teams must deploy and scale independently.'
    const first = await (
      await M.arena.POST(
        post('/api/dialectic/arena', { action: 'submit_verdict', id: debateId, verdict }),
      )
    ).json()
    expect(first.assessment.score).toBeGreaterThanOrEqual(40)
    expect(first.xpAwarded).toBeGreaterThan(0)
    expect(first.debate.learnerVerdict).toBe(verdict)
    const again = await (
      await M.arena.POST(
        post('/api/dialectic/arena', { action: 'submit_verdict', id: debateId, verdict }),
      )
    ).json()
    expect(again.xpAwarded).toBe(0)
  })

  it('protégé reacts honestly; bad ids/slugs are 404, short verdicts 400', async () => {
    const reply = await (
      await M.arena.POST(
        post('/api/dialectic/arena', {
          action: 'protege_explain',
          slug: 'monolith-vs-microservices',
          explanation: 'You just use a queue.',
        }),
      )
    ).json()
    expect(reply.understood).toBe(false)
    expect(
      (await M.arena.POST(post('/api/dialectic/arena', { action: 'start_case', slug: 'nope' })))
        .status,
    ).toBe(404)
    expect(
      (
        await M.arena.POST(
          post('/api/dialectic/arena', {
            action: 'evaluate_fallacy',
            id: 99999,
            turnId: 'turn-1',
            fallacy: 'straw_man',
          }),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await M.arena.POST(
          post('/api/dialectic/arena', { action: 'submit_verdict', id: debateId, verdict: 'ok' }),
        )
      ).status,
    ).toBe(400)
    expect((await M.arena.GET(get('/api/dialectic/arena?id=99999'))).status).toBe(404)
  })
})

describe('/api/ingest/multimodal', () => {
  it('returns preview cards plus save items that pass card validation', async () => {
    const { validateCardContent } = await import('@learning-hub/core')
    const res = await M.ingest.POST(
      post('/api/ingest/multimodal', {
        kind: 'code_files',
        rawContent: 'export const c = 1\nexport function velocity() {}',
        filename: 'phys.ts',
      }),
    )
    const body = await res.json()
    expect(body.cardCount).toBe(2)
    expect(body.cards[0].front).toContain('const {{c1::c}} = 1')
    for (const item of body.items) {
      expect(validateCardContent(item.type, item.content).ok).toBe(true)
    }
  })

  it('transcripts without a URL get no deep link; non-http URLs are 400', async () => {
    const body = await (
      await M.ingest.POST(
        post('/api/ingest/multimodal', {
          kind: 'youtube_transcript',
          rawContent: '00:00:05.000\nGradient descent follows the negative gradient downhill.',
        }),
      )
    ).json()
    expect(body.segmentCount).toBe(1)
    expect(body.cards[0].sourceReference).toBeUndefined()
    const bad = await M.ingest.POST(
      post('/api/ingest/multimodal', {
        kind: 'youtube_transcript',
        rawContent: 'hello world',
        sourceUrl: 'javascript:alert(1)',
      }),
    )
    expect(bad.status).toBe(400)
  })
})

describe('/api/spatial/palace-3d', () => {
  let palaceId: number

  beforeAll(() => {
    const { db, palaces, palaceItems } = M.db
    palaceId = db.insert(palaces).values({ name: 'Test Villa' }).returning().all()[0].id
    db.insert(palaceItems)
      .values([
        { palaceId, lociIndex: 0, name: 'Door' },
        { palaceId, lociIndex: 1, name: 'Fountain', cardId },
      ])
      .run()
  })

  it('404s an unknown palace and 400s a missing palaceId', async () => {
    expect((await M.palace3d.GET(get('/api/spatial/palace-3d?palaceId=999'))).status).toBe(404)
    expect((await M.palace3d.GET(get('/api/spatial/palace-3d'))).status).toBe(400)
  })

  it("lays out the palace's own items without inventing card links, and GET never writes", async () => {
    const body = await (
      await M.palace3d.GET(get(`/api/spatial/palace-3d?palaceId=${palaceId}`))
    ).json()
    expect(body.persisted).toBe(false)
    expect(body.scene.spatialLoci.map((l: any) => l.title)).toEqual(['Door', 'Fountain'])
    expect(body.scene.spatialLoci[0].cardId).toBeUndefined()
    expect(body.scene.spatialLoci[1].cardId).toBe(cardId)
    expect(M.db.getPalace3dScene(palaceId)).toBeUndefined()
  })

  it('saves a scene, then serves it; archetype previews re-layout without saving', async () => {
    const preview = await (
      await M.palace3d.GET(
        get(`/api/spatial/palace-3d?palaceId=${palaceId}&archetype=modern_gallery`),
      )
    ).json()
    expect(preview.scene.spatialLoci[0].assetType).toBe('wall_canvas')
    const save = await M.palace3d.POST(
      post('/api/spatial/palace-3d', {
        palaceId,
        title: 'Test Villa',
        environmentArchetype: 'modern_gallery',
        cameraStartPos: { x: 0, y: 1.6, z: 5, pitch: 0, yaw: 0 },
        loci: preview.scene.spatialLoci,
      }),
    )
    expect(save.status).toBe(200)
    const saved = await (
      await M.palace3d.GET(get(`/api/spatial/palace-3d?palaceId=${palaceId}`))
    ).json()
    expect(saved.persisted).toBe(true)
    expect(saved.scene.environmentArchetype).toBe('modern_gallery')
    expect(
      (
        await M.palace3d.POST(
          post('/api/spatial/palace-3d', {
            palaceId: 4040,
            title: 'x',
            cameraStartPos: {},
            loci: [],
          }),
        )
      ).status,
    ).toBe(404)
  })
})
