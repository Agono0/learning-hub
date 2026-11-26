/**
 * Page-to-API contract for /api/ai/transport, the endpoint the TransportPanel calls on mount.
 * Real handlers against a temp SQLite file seeded with synthetic data only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-page-api-')), 'contract.db')

type Modules = {
  transport: typeof import('../src/server/handlers/ai/transport/route')
  db: typeof import('@learning-hub/db')
}
let M: Modules
let sessionId: number

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  const transport = await import('../src/server/handlers/ai/transport/route')
  M = { db, transport }
  sessionId = db.createChatSession({
    kind: 'feynman',
    title: 'Synthetic concept: tides',
    messages: [
      { role: 'user', content: 'Synthetic learner line one.' },
      { role: 'assistant', content: 'Synthetic questioner line two?' },
    ],
  }).id
})

const get = (qs: string): Promise<Response> =>
  Promise.resolve(M.transport.GET(new Request(`http://localhost/api/ai/transport${qs}`)))
const post = (body: unknown): Promise<Response> =>
  Promise.resolve(
    M.transport.POST(
      new Request('http://localhost/api/ai/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ),
  )

type Info = {
  ok: boolean
  feature: string
  envelope: { v: number; feature: string; system: string; prompt: string }
  manual: { feature: string; rubric?: { key: string; label: string }[]; steps: string[] }
}

describe('GET /api/ai/transport?feature=feynman-grader', () => {
  it('without sessionId answers 200 with the manual rubric and a paste placeholder, no invented transcript', async () => {
    const res = await get('?feature=feynman-grader')
    expect(res.status).toBe(200)
    const data = (await res.json()) as Info
    expect(data.ok).toBe(true)
    expect(data.manual.rubric?.length).toBeGreaterThan(0)
    expect(data.manual.rubric?.map((r) => r.key)).toContain('coverage')
    expect(data.envelope.prompt).toContain('PASTE YOUR TEACH-BACK EXPLANATION HERE')
    expect(data.envelope.prompt).not.toMatch(/Learner:|Student-questioner:/)
  })

  it('POST with params but no sessionId (the large-payload panel path) behaves the same', async () => {
    const res = await post({ feature: 'feynman-grader', params: { concept: 'Synthetic tides' } })
    expect(res.status).toBe(200)
    const data = (await res.json()) as Info
    expect(data.manual.rubric?.length).toBeGreaterThan(0)
    expect(data.envelope.prompt).toContain('Synthetic tides')
    expect(data.envelope.prompt).toContain('PASTE YOUR TEACH-BACK EXPLANATION HERE')
  })

  it('keeps the real transcript for an existing session', async () => {
    const res = await get(`?feature=feynman-grader&sessionId=${sessionId}`)
    expect(res.status).toBe(200)
    const { envelope } = (await res.json()) as Info
    expect(envelope.prompt).toContain('Synthetic concept: tides')
    expect(envelope.prompt).toContain('Learner: Synthetic learner line one.')
    expect(envelope.prompt).toContain('Student-questioner: Synthetic questioner line two?')
    expect(envelope.prompt).not.toContain('PASTE YOUR TEACH-BACK')
  })

  it('refuses an unknown sessionId with 400 and does not fall back to the placeholder', async () => {
    for (const via of ['get', 'post'] as const) {
      const res =
        via === 'get'
          ? await get(`?feature=feynman-grader&sessionId=${sessionId + 1000}`)
          : await post({
              feature: 'feynman-grader',
              params: { sessionId: String(sessionId + 1000) },
            })
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain(
        `chat session ${sessionId + 1000} not found`,
      )
    }
  })

  it('refuses a malformed sessionId with 400 instead of treating it as absent', async () => {
    for (const bad of [
      'abc',
      '0',
      '-1',
      '1.5',
      '1e3',
      '',
      '%20',
      '12abc',
      '99999999999999999999',
    ]) {
      const res = await get(`?feature=feynman-grader&sessionId=${bad}`)
      expect(res.status, `sessionId=${JSON.stringify(bad)}`).toBe(400)
      expect(JSON.stringify(await res.json())).toContain('sessionId must be a positive integer')
    }
  })
})

describe('other literal GETs the pages issue stay unchanged', () => {
  it('discovery lists the features and provider status', async () => {
    const res = await get('')
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      provider: string
      configured: boolean
      features: { name: string; title: string; kind: string }[]
    }
    expect(data.ok).toBe(true)
    expect(typeof data.provider).toBe('string')
    expect(typeof data.configured).toBe('boolean')
    expect(data.features.map((f) => f.name)).toContain('feynman-grader')
  })

  it.each([
    'feynman-student',
    'tutor-grade',
    'coach',
    'brainwrite',
    'freetext-rubric',
    'course-generator',
  ])('feature=%s answers 200 with an envelope and a manual mode', async (feature) => {
    const res = await get(`?feature=${feature}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as Info
    expect(data.feature).toBe(feature)
    expect(data.envelope.v).toBe(1)
    expect(data.envelope.system.length).toBeGreaterThan(0)
    expect(data.envelope.prompt.length).toBeGreaterThan(0)
    expect(data.manual.feature).toBe(feature)
    expect(data.manual.steps.length).toBeGreaterThan(0)
  })

  it('features that need an id still refuse without one', async () => {
    expect((await get('?feature=council-skeptic')).status).toBe(400)
    expect((await get('?feature=cloze-generator')).status).toBe(400)
    expect((await get('?feature=nope')).status).toBe(400)
  })
})
