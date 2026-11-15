/**
 * Cognitive-expansion API routes end-to-end against an isolated temp SQLite DB
 * (LEARNING_HUB_DB; an empty file is enough — ensureSchema() creates every table
 * and runs migrations on first open). Covers the commute, TMR, GKT, cognitive
 * load, dialectic, ingest and 3D-palace handlers: zod query/body validation,
 * 404/409 paths, the single grading path, and the answer-key/XP rules.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-cog-routes-')), 'cog.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  commute: typeof import('../app/api/audio/circadian/commute/route')
  tmr: typeof import('../app/api/audio/tmr/cues/route')
  gkt: typeof import('../app/api/cognitive/gkt/route')
  load: typeof import('../app/api/cognitive/load/route')
  arena: typeof import('../app/api/dialectic/arena/route')
  ingest: typeof import('../app/api/ingest/multimodal/route')
  palace3d: typeof import('../app/api/spatial/palace-3d/route')
  weaknessV2: typeof import('../app/api/curriculum/skills/weakness-v2/route')
  voiceSession: typeof import('../app/api/tutor/voice-session/route')
  examSim: typeof import('../app/api/curriculum/exam/simulator/route')
  workload: typeof import('../app/api/workload/route')
  exposure: typeof import('../app/api/reading/exposure/route')
  review: typeof import('../src/server/handlers/review/route')
  api: typeof import('../src/lib/api')
  db: typeof import('@learning-hub/db')
}
// Assigned in beforeAll, after LEARNING_HUB_DB points at the temp database.
let M: Modules

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
  M = {
    commute: await import('../app/api/audio/circadian/commute/route'),
    tmr: await import('../app/api/audio/tmr/cues/route'),
    gkt: await import('../app/api/cognitive/gkt/route'),
    load: await import('../app/api/cognitive/load/route'),
    arena: await import('../app/api/dialectic/arena/route'),
    ingest: await import('../app/api/ingest/multimodal/route'),
    palace3d: await import('../app/api/spatial/palace-3d/route'),
    weaknessV2: await import('../app/api/curriculum/skills/weakness-v2/route'),
    voiceSession: await import('../app/api/tutor/voice-session/route'),
    examSim: await import('../app/api/curriculum/exam/simulator/route'),
    workload: await import('../app/api/workload/route'),
    exposure: await import('../app/api/reading/exposure/route'),
    review: await import('../src/server/handlers/review/route'),
    api: await import('../src/lib/api'),
    db: await import('@learning-hub/db'),
  }

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
    const cue = body.cues.find((c: { cardId: number }) => c.cardId === cardId)
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
      .filter((r: { cardId: number }) => r.cardId === cardId).length
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
      .filter((r: { cardId: number }) => r.cardId === cardId).length
    expect(after).toBe(before + 1) // the single grading path wrote the revlog row
  })
})

describe('/api/audio/tmr/cues', () => {
  it('lists the cue minted by the commute session', async () => {
    const body = await (await M.tmr.GET(get('/api/audio/tmr/cues'))).json()
    expect(body.cues.some((c: { cardId: number }) => c.cardId === cardId)).toBe(true)
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
      (c: { cardId: number }) => c.cardId === cardId,
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
    expect(dag.nodes.map((n: { id: string }) => n.id).indexOf('algebra')).toBeLessThan(
      dag.nodes.map((n: { id: string }) => n.id).indexOf('calculus'),
    )
    const algebra = dag.nodes.find((n: { id: string; masteryProb: number }) => n.id === 'algebra')
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
    const ev = events.find((e: { id: number; hesitationVariance: number }) => e.id === body.eventId)
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
    expect(body.scene.spatialLoci.map((l: { title: string }) => l.title)).toEqual([
      'Door',
      'Fountain',
    ])
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

describe('/api/curriculum/skills/weakness-v2', () => {
  it('GET returns confusion pairs, topic forecasts, and leech decompositions', async () => {
    const res = await M.weaknessV2.GET(get('/api/curriculum/skills/weakness-v2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.confusionPairs)).toBe(true)
    expect(Array.isArray(body.topicForecasts)).toBe(true)
    expect(Array.isArray(body.leechDecompositions)).toBe(true)
    expect(body.totalCards).toBeGreaterThanOrEqual(1)
  })

  it('POST applies decomposition in transaction and suspends the original leech card', async () => {
    const { db, cards } = M.db
    const [leech] = db
      .insert(cards)
      .values({
        deckId,
        type: 'basic',
        due: new Date().toISOString(),
        lapses: 8,
        content: { basic: { front: 'Overloaded front', back: 'Fact 1. Fact 2.' } },
      })
      .returning()
      .all()

    const res = await M.weaknessV2.POST(
      post('/api/curriculum/skills/weakness-v2', {
        action: 'apply_decomposition',
        originalCardId: leech.id,
        candidates: [
          { front: 'Overloaded front (Part 1/2)', back: 'Fact 1', format: 'basic' },
          { front: 'Overloaded front (Part 2/2)', back: 'Fact 2', format: 'basic' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.createdCount).toBe(2)
    expect(body.originalSuspended).toBe(true)

    // Verify original card was suspended
    const [refetched] = db.select().from(cards).where(eq(cards.id, leech.id)).all()
    expect(refetched.suspended).toBe(true)
  })
})

describe('/api/tutor/voice-session', () => {
  it('GET returns supported Socratic ladder rungs', async () => {
    const res = await M.voiceSession.GET(get('/api/tutor/voice-session'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.supportedRungs).toHaveLength(4)
    expect(body.mode).toBe('conversational_socratic')
  })

  it('POST handles starting a session and escalating rungs on hint requests', async () => {
    // Start session
    const startRes = await M.voiceSession.POST(
      post('/api/tutor/voice-session', {
        action: 'start',
        topic: 'Central Limit Theorem',
        userTranscript: '',
        currentRung: 1,
      }),
    )
    expect(startRes.status).toBe(200)
    const startBody = await startRes.json()
    expect(startBody.ok).toBe(true)
    expect(startBody.spokenReply.length).toBeGreaterThan(10)
    expect(startBody.nextRung).toBe(1)

    // Turn with hint request
    const hintRes = await M.voiceSession.POST(
      post('/api/tutor/voice-session', {
        action: 'turn',
        topic: 'Central Limit Theorem',
        userTranscript: "I'm stuck and need a hint please",
        currentRung: 1,
      }),
    )
    expect(hintRes.status).toBe(200)
    const hintBody = await hintRes.json()
    expect(hintBody.ok).toBe(true)
    expect(hintBody.isHintRequest).toBe(true)
    expect(hintBody.nextRung).toBe(2) // Escalated from 1 to 2

    // Card-grounded turn with Generation Guard test
    const cardTurnRes = await M.voiceSession.POST(
      post('/api/tutor/voice-session', {
        action: 'turn',
        topic: 'Spaced Repetition',
        cardId,
        userTranscript: 'just tell me the answer',
        currentRung: 3,
        attemptCount: 0, // no active attempts yet
      }),
    )
    expect(cardTurnRes.status).toBe(200)
    const cardTurnBody = await cardTurnRes.json()
    expect(cardTurnBody.ok).toBe(true)
    expect(cardTurnBody.groundedCardId).toBe(cardId)
    expect(cardTurnBody.revealedAnswer).toBe(false) // Generation guard withheld answer!
    expect(cardTurnBody.spokenReply).toContain('active prediction')
  })
})

describe('/api/curriculum/exam/simulator', () => {
  it('GET returns timed mock exam assembly with Bloom taxonomy classification', async () => {
    const res = await M.examSim.GET(
      get('/api/curriculum/exam/simulator?count=5&durationMinutes=10'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.durationMinutes).toBe(10)
    expect(Array.isArray(body.questions)).toBe(true)
    expect(body.questions.length).toBeGreaterThanOrEqual(1)
    expect(['remember', 'understand', 'apply']).toContain(body.questions[0].bloomLevel)
  })

  it('POST grades accurately with no false positives on MCQ shared tokens and supports typein', async () => {
    const { db, cards } = M.db
    const [mcqCard] = db
      .insert(cards)
      .values({
        deckId,
        type: 'mcq',
        due: new Date().toISOString(),
        content: {
          mcq: {
            question: 'Which process yields gametes?',
            options: ['Option A: Mitosis', 'Option B: Meiosis', 'Option C: Binary Fission'],
            correctIndex: 1, // 'Option B: Meiosis'
          },
        },
      })
      .returning()
      .all()

    const [typeinCard] = db
      .insert(cards)
      .values({
        deckId,
        type: 'typein',
        due: new Date().toISOString(),
        content: {
          typein: {
            question: 'What is the main photosynthetic pigment?',
            acceptedAnswers: ['Chlorophyll', 'Chlorophyll a'],
          },
        },
      })
      .returning()
      .all()

    // Test MCQ wrong option that shares the word "Option"
    const wrongMcqGradeRes = await M.examSim.POST(
      post('/api/curriculum/exam/simulator', {
        action: 'grade',
        submissions: [
          { cardId: mcqCard.id, answer: 'Option A: Mitosis' }, // wrong, but contains "Option"
        ],
      }),
    )
    const wrongMcqBody = await wrongMcqGradeRes.json()
    expect(wrongMcqBody.score).toBe(0)
    expect(wrongMcqBody.results[0].correct).toBe(false) // Verified: NO false positive!
    expect(wrongMcqBody.missedCards).toHaveLength(1)

    // Test correct MCQ option
    const rightMcqGradeRes = await M.examSim.POST(
      post('/api/curriculum/exam/simulator', {
        action: 'grade',
        submissions: [{ cardId: mcqCard.id, answer: 'Option B: Meiosis' }],
      }),
    )
    const rightMcqBody = await rightMcqGradeRes.json()
    expect(rightMcqBody.score).toBe(100)
    expect(rightMcqBody.results[0].correct).toBe(true)

    // Test typein card with accepted answer
    const typeinGradeRes = await M.examSim.POST(
      post('/api/curriculum/exam/simulator', {
        action: 'grade',
        submissions: [{ cardId: typeinCard.id, answer: 'chlorophyll' }],
      }),
    )
    const typeinBody = await typeinGradeRes.json()
    expect(typeinBody.score).toBe(100)
    expect(typeinBody.results[0].correct).toBe(true)
  })

  it('POST creates cards from misses within transaction', async () => {
    const res = await M.examSim.POST(
      post('/api/curriculum/exam/simulator', {
        action: 'create_cards_from_misses',
        deckId,
        misses: [
          { front: '[Exam Miss] What is entropy?', back: 'Measure of disorder in a system' },
          { front: '[Exam Miss] What is enthalpy?', back: 'Total heat content of a system' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.createdCount).toBe(2)
  })

  it('triggers hypercorrection when confidence=1 and grade=1 on /api/review', async () => {
    const { db, cards } = M.db
    const c = db
      .insert(cards)
      .values({
        deckId,
        content: { basic: { front: 'Capital of Australia?', back: 'Canberra' } },
        type: 'basic',
        due: new Date().toISOString(),
      })
      .returning()
      .all()[0]

    // High confidence mistake: confidence=1, grade=1
    const res = await M.review.POST(
      post('/api/review', {
        cardId: c.id,
        grade: 1,
        confidence: 1,
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.hypercorrection).toBeDefined()
    expect(body.hypercorrection.isEligible).toBe(true)
    expect(body.hypercorrection.prompt).toContain('Canberra')

    // Low confidence mistake: confidence=0, grade=1 -> isEligible: false
    const res2 = await M.review.POST(
      post('/api/review', {
        cardId: c.id,
        grade: 1,
        confidence: 0,
      }),
    )
    const body2 = await res2.json()
    expect(body2.hypercorrection.isEligible).toBe(false)
  })

  describe('/api/workload balancer', () => {
    it('returns forecast for cards', async () => {
      const res = await M.workload.GET(get('/api/workload?days=14'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.forecast)).toBe(true)
      expect(data.forecast.length).toBe(14)
      expect(typeof data.totalCards).toBe('number')
      expect(typeof data.overdueCount).toBe('number')
    })

    it('balances workload with easy days or caps and modifies card due dates', async () => {
      const { db, cards } = M.db
      // Insert a card with 30-day interval
      const now = new Date()
      const d = db
        .insert(cards)
        .values({
          deckId,
          content: { basic: { front: 'Workload Q', back: 'Workload A' } },
          type: 'basic',
          due: now.toISOString(),
          state: 2,
          stability: 30,
          scheduledDays: 30,
        })
        .returning()
        .all()[0]

      const dayOfWeek = now.getDay()
      const res = await M.workload.POST(
        post('/api/workload', {
          action: 'balance',
          days: 14,
          easyDays: [dayOfWeek], // make today an easy day
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.action).toBe('balance')
      expect(Array.isArray(body.shifts)).toBe(true)
      expect(Array.isArray(body.forecast)).toBe(true)

      // today is an easy day, so the mature card due today is moved off it —
      // and the move is persisted to its due date, nothing else.
      const shift = body.shifts.find((s: { cardId: number }) => s.cardId === d.id)
      expect(shift).toBeDefined()
      expect(shift.shiftDays).not.toBe(0)
      const after = db.select().from(cards).where(eq(cards.id, d.id)).all()[0]
      expect(after.due).toBe(shift.newDue)
      expect(after.stability).toBe(30)
      expect(after.scheduledDays).toBe(30)
      expect(after.state).toBe(2)
    })

    it('catches up overdue backlog without mutating FSRS memory state', async () => {
      const { db, cards } = M.db
      const oldDue = new Date(Date.now() - 5 * 86_400_000).toISOString()
      const c = db
        .insert(cards)
        .values({
          deckId,
          content: { basic: { front: 'Overdue Q', back: 'Overdue A' } },
          type: 'basic',
          due: oldDue,
          state: 2,
          stability: 15,
          scheduledDays: 15,
        })
        .returning()
        .all()[0]

      const res = await M.workload.POST(
        post('/api/workload', {
          action: 'catch_up',
          dailyCap: 10,
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.action).toBe('catch_up')

      // Verify the card's FSRS memory fields were NOT mutated (Rule 7)
      const updated = db.select().from(cards).where(eq(cards.id, c.id)).all()[0]
      expect(updated.stability).toBe(15)
      expect(updated.scheduledDays).toBe(15)
      expect(updated.state).toBe(2)
    })
  })

  describe('/api/reading/exposure (Ambient Exposure Ledger & Coverage)', () => {
    it('records batch exposures and computes lexical coverage analysis', async () => {
      // Record batch exposures
      const res = await M.exposure.POST(
        post('/api/reading/exposure', {
          action: 'record_batch',
          tokens: ['neuroplasticity', 'synaptic', 'dendrite', 'axon'],
          sourceType: 'reading',
          contextSnippet: 'Synaptic connections strengthen through LTP.',
        }),
      )
      expect(res.status).toBe(200)
      const postBody = await res.json()
      expect(postBody.ok).toBe(true)
      expect(postBody.insertedCount).toBe(4)

      // Query summaries and coverage analysis
      const getRes = await M.exposure.GET(
        get('/api/reading/exposure?limit=10&analyzeText=The+brain+exhibits+synaptic+plasticity'),
      )
      expect(getRes.status).toBe(200)
      const data = await getRes.json()
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.words)).toBe(true)
      expect(data.words.some((w: { normalized: string }) => w.normalized === 'synaptic')).toBe(true)
      expect(data.coverageAnalysis).toBeDefined()
      expect(typeof data.coverageAnalysis.coveragePercent).toBe('number')
      expect(['optimal', 'frustration', 'effortless']).toContain(data.coverageAnalysis.zone)
    })

    it('promotes an encountered ambient word into an active flashcard', async () => {
      const res = await M.exposure.POST(
        post('/api/reading/exposure', {
          action: 'promote',
          token: 'serendipity',
          back: 'An unexpected, fortunate discovery.',
          deckId,
        }),
      )
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.card.type).toBe('basic')
      expect(body.card.content.basic.front).toBe('serendipity')
      expect(body.card.tags).toContain('ambient-promoted')
    })

    it('refuses to promote a word that is already a card (409)', async () => {
      const res = await M.exposure.POST(
        post('/api/reading/exposure', { action: 'promote', token: 'Serendipity', deckId }),
      )
      expect(res.status).toBe(409)
    })

    it('404s promotion into a missing deck', async () => {
      const res = await M.exposure.POST(
        post('/api/reading/exposure', { action: 'promote', token: 'quixotic', deckId: 999_999 }),
      )
      expect(res.status).toBe(404)
    })

    it('marks promoted words as already-a-card in the ledger', async () => {
      await M.exposure.POST(
        post('/api/reading/exposure', { action: 'record', token: 'Serendipity' }),
      )
      const data = await (await M.exposure.GET(get('/api/reading/exposure?limit=200'))).json()
      const word = data.words.find(
        (w: { normalized: string; isAlreadyCard: boolean }) => w.normalized === 'serendipity',
      )
      expect(word.isAlreadyCard).toBe(true)
      expect(data.coverageAnalysis).toBeNull()
    })

    it('analyzes long texts via POST', async () => {
      const text = 'Neurons fire. '.repeat(1_000)
      const res = await M.exposure.POST(post('/api/reading/exposure', { action: 'analyze', text }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.coverageAnalysis.totalTokens).toBe(2_000)
    })

    it('validates bodies per action (400)', async () => {
      const bad = [
        { action: 'record' },
        { action: 'record', token: '!!!' },
        { action: 'record_batch', tokens: [] },
        { action: 'record_batch', tokens: Array(501).fill('word') },
        { action: 'promote' },
        { action: 'analyze', text: '' },
        { action: 'nope' },
      ]
      for (const b of bad) {
        const res = await M.exposure.POST(post('/api/reading/exposure', b))
        expect(res.status, JSON.stringify(b).slice(0, 60)).toBe(400)
      }
      expect((await M.exposure.GET(get('/api/reading/exposure?limit=0'))).status).toBe(400)
    })
  })
})
