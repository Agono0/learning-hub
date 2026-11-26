/**
 * Fields that are copied into a paid model prompt must be bounded per field, not only by the
 * body cap: ideas/brainwrite, curriculum (generate) and tutor/voice-session. The oversize cases
 * must fail validation (400 "Invalid request body" naming the field); the in-bound cases must
 * pass validation (they may still fail later because no AI provider is configured in the test).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-ai-bounds-')), 'a.db')

type Handler = { POST: (req: Request) => Promise<Response> }
let brainwrite: Handler
let curriculum: Handler
let voice: Handler

beforeAll(async () => {
  brainwrite = await import('../src/server/handlers/ideas/brainwrite/route')
  curriculum = await import('../src/server/handlers/curriculum/route')
  voice = await import('../src/server/handlers/tutor/voice-session/route')
})

async function post(h: Handler, body: unknown) {
  const res = await h.POST(
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  const json = (await res.json()) as { error?: string; detail?: { path: string }[] }
  return { status: res.status, json }
}

/** Failed validation on exactly this field path. */
function invalidAt(r: Awaited<ReturnType<typeof post>>, path: string) {
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('Invalid request body')
  expect(r.json.detail?.map((d) => d.path)).toContain(path)
}
const passesValidation = (r: Awaited<ReturnType<typeof post>>) =>
  expect(r.json.error).not.toBe('Invalid request body')

describe('ideas/brainwrite', () => {
  it('bounds topic, the number of ideas and each idea', async () => {
    invalidAt(await post(brainwrite, { topic: 't'.repeat(501) }), 'topic')
    invalidAt(await post(brainwrite, { topic: 't', userIdeas: Array(51).fill('i') }), 'userIdeas')
    invalidAt(await post(brainwrite, { topic: 't', userIdeas: ['i'.repeat(1001)] }), 'userIdeas.0')
    passesValidation(
      await post(brainwrite, {
        topic: 't'.repeat(500),
        userIdeas: Array(50).fill('i'.repeat(1000)),
      }),
    )
  })
})

describe('curriculum generate', () => {
  it('bounds topic and depth', async () => {
    invalidAt(await post(curriculum, { topic: 't'.repeat(501) }), 'topic')
    invalidAt(await post(curriculum, { topic: 't', depth: 'd'.repeat(101) }), 'depth')
    passesValidation(await post(curriculum, { topic: 't'.repeat(500), depth: 'd'.repeat(100) }))
  })
})

describe('tutor/voice-session', () => {
  it('bounds each history turn like it bounds the transcript', async () => {
    const turn = (n: number) => ({ role: 'user', text: 'x'.repeat(n) })
    invalidAt(
      await post(voice, { topic: 'Topic', userTranscript: 'hi', history: [turn(4001)] }),
      'history.0.text',
    )
    passesValidation(
      await post(voice, { topic: 'Topic', userTranscript: 'hi', history: [turn(4000)] }),
    )
  })
})
