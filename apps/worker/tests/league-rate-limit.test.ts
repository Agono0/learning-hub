import { describe, expect, it } from 'vitest'
import {
  RATE_LIMIT,
  RATE_WINDOW_MS,
  createLeague,
  generateLeagueSigner,
  signLeagueMutation,
  signerIdFromPubKey,
  type LeagueMutation,
  type LeagueSigner,
} from '@learning-hub/core/leagues'
import { LeagueRoom } from '../src/index'

const LEAGUE_ID = 'lg-rate'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

function fakeState() {
  const store = new Map<string, unknown>()
  let writes = 0
  const state = {
    id: { toString: () => 'do_rate' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        writes++
        store.set(key, structuredClone(value))
      },
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as unknown as DurableObjectState
  return { state, writes: () => writes }
}

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}
const actor = async (): Promise<Actor> => {
  const signer = await generateLeagueSigner()
  return { signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 }
}

let n = 0
async function send(room: LeagueRoom, who: Actor, mutation: LeagueMutation, now: { t: number }) {
  const envelope = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq: ++who.seq,
    mutation,
    timestamp: now.t,
    nonce: `rate-nonce-${String(++n).padStart(9, '0')}`,
  })
  const res = await room.fetch(
    new Request('http://do/mutate', { method: 'POST', body: JSON.stringify({ envelope }) }),
  )
  return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string } }
}

const bigPrompts = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  question: `q${i}`,
  answers: ['a'],
}))

async function setup() {
  const clock = { t: T0 }
  const fs = fakeState()
  const room = new LeagueRoom(fs.state, { now: () => clock.t })
  const league = createLeague({ id: LEAGUE_ID, title: 'Rate', seasonStart: '2026-03-02' })
  await room.fetch(
    new Request('http://do/init', { method: 'POST', body: JSON.stringify({ league }) }),
  )
  const a = await actor()
  const b = await actor()
  await send(room, a, { type: 'join', alias: 'Ann' }, clock)
  await send(room, b, { type: 'join', alias: 'Bo' }, clock)
  // Five duels with 20 prompts each give one member plenty of accepted answers.
  for (let i = 0; i < 5; i++) {
    clock.t += 1
    const r = await send(
      room,
      a,
      { type: 'duel-open', duelId: `d${i}`, opponent: b.handle, prompts: bigPrompts },
      clock,
    )
    expect(r.body.ok).toBe(true)
    clock.t += 1
    expect((await send(room, a, { type: 'duel-start', duelId: `d${i}` }, clock)).body.ok).toBe(true)
  }
  return { room, clock, a, b, fs }
}

async function answerUntilLimited(room: LeagueRoom, a: Actor, clock: { t: number }) {
  let accepted = 0
  for (let i = 0; i < 5; i++) {
    for (let p = 0; p < 20; p++) {
      clock.t += 1
      const r = await send(
        room,
        a,
        { type: 'duel-answer', duelId: `d${i}`, promptId: `p${p}`, answer: 'a' },
        clock,
      )
      if (r.body.ok) {
        accepted++
        continue
      }
      return { accepted, first: r }
    }
  }
  return { accepted, first: null }
}

describe('LeagueRoom rate limit', () => {
  it('stops one signer at the limit inside the window with a 409 rate_limited', async () => {
    const { room, clock, a } = await setup()
    const { accepted, first } = await answerUntilLimited(room, a, clock)
    expect(first).not.toBeNull()
    expect(first!.status).toBe(409)
    expect(first!.body.code).toBe('rate_limited')
    // Joins and opens already used part of the budget.
    expect(accepted).toBeLessThan(RATE_LIMIT)
    expect(accepted).toBeGreaterThan(30)
  }, 120_000)

  it('does not persist anything for a rate-limited request', async () => {
    const { room, clock, a, fs } = await setup()
    await answerUntilLimited(room, a, clock)
    const before = fs.writes()
    clock.t += 1
    const r = await send(
      room,
      a,
      { type: 'duel-answer', duelId: 'd4', promptId: 'p19', answer: 'a' },
      clock,
    )
    expect(r.body.code).toBe('rate_limited')
    expect(fs.writes()).toBe(before)
  }, 120_000)

  it('does not limit a different member while the first is limited', async () => {
    const { room, clock, a, b } = await setup()
    await answerUntilLimited(room, a, clock)
    clock.t += 1
    const r = await send(room, b, { type: 'duel-start', duelId: 'd0' }, clock)
    expect(r.body.ok).toBe(true)
  }, 120_000)

  it('lets the limited member act again once the window has passed', async () => {
    const { room, clock, a } = await setup()
    await answerUntilLimited(room, a, clock)
    clock.t += RATE_WINDOW_MS + 1_000
    const r = await send(
      room,
      a,
      { type: 'duel-answer', duelId: 'd4', promptId: 'p19', answer: 'a' },
      clock,
    )
    expect(r.body.code).not.toBe('rate_limited')
  }, 120_000)
})
