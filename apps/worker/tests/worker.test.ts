import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'

/** One statement the fake D1 saw: SQL text plus the values bound to it. */
interface Executed {
  sql: string
  values: D1Value[]
}

/** In-memory D1 stand-in: records statements and serves canned rows. */
function fakeD1(rows: Record<string, unknown>[] = []): D1Database & { executed: Executed[] } {
  const executed: Executed[] = []
  return {
    executed,
    prepare(sql: string): D1PreparedStatement {
      const stmt: D1PreparedStatement = {
        bind(...values: D1Value[]) {
          executed.push({ sql, values })
          return stmt
        },
        run: async () => ({ success: true }),
        all: async <T>() => ({ results: rows as T[] }),
        first: async <T>() => (rows[0] as T | undefined) ?? null,
      }
      return stmt
    },
  }
}

/** Durable Object namespace that echoes the posted body back under `key`. */
function echoNamespace(key: 'room' | 'raid'): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => `${key}_${name}` }),
    get: () => ({
      fetch: async (_req: Request | string, init?: RequestInit) =>
        Response.json(
          typeof init?.body === 'string' ? { [key]: JSON.parse(init.body) } : { ok: true },
        ),
    }),
  }
}

function makeEnv(rows: Record<string, unknown>[] = []): Env & { DB: ReturnType<typeof fakeD1> } {
  return { DB: fakeD1(rows), STUDY_ROOM: echoNamespace('room'), BOSS_RAID: echoNamespace('raid') }
}

/** Typed JSON body of a worker response. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

describe('Cloudflare Worker endpoints', () => {
  const fakeEnv = makeEnv()

  it('serves health endpoint', async () => {
    const res = await worker.fetch(new Request('http://worker.local/health'), fakeEnv)
    expect(res.status).toBe(200)
    const data = await json<{ ok: boolean; worker: string }>(res)
    expect(data.ok).toBe(true)
    expect(data.worker).toBe('learning-hub-engagement')
  })

  it('registers device key (signed challenge required)', async () => {
    // M18: the worker verifies an ECDSA P-256 signature over the challenge.
    const {
      generateIdentityKeyPair,
      identityChallenge,
      identitySigningPayload,
      signIdentityPayload,
    } = await import('@learning-hub/core')
    const pair = await generateIdentityKeyPair()
    const challenge = identityChallenge('usr_curie', 1730000000000)
    const signature = await signIdentityPayload(
      pair.privateKey,
      identitySigningPayload(challenge, 'Curie'),
    )

    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/auth/register-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pair.publicKey,
          alias: 'Curie',
          challenge,
          signature,
        }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = await json<{ ok: boolean; alias: string; userId: string }>(res)
    expect(data.ok).toBe(true)
    expect(data.alias).toBe('Curie')

    // A tampered signature must be rejected with 401.
    const bad = await worker.fetch(
      new Request('http://worker.local/api/v1/auth/register-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pair.publicKey,
          alias: 'Impostor',
          challenge,
          signature,
        }),
      }),
      fakeEnv,
    )
    expect(bad.status).toBe(401)
    expect(data.userId.startsWith('usr_')).toBe(true)
  })

  it('creates study rooms and returns room code', async () => {
    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Morning Flow',
          pomodoroWorkMinutes: 25,
        }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = await json<{ ok: boolean; code: string }>(res)
    expect(data.ok).toBe(true)
    expect(data.code).toHaveLength(6)
  })

  it('creates party raids', async () => {
    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/raids/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bossKey: 'hydra' }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = await json<{ ok: boolean; raidId: string }>(res)
    expect(data.ok).toBe(true)
    expect(data.raidId.startsWith('raid_')).toBe(true)
  })

  it('library search treats % and _ literally and survives corrupt tags', async () => {
    const env = makeEnv([
      { id: 'a', type: 'deck', title: 'T', tags: '{not json', share_string: 's' },
      { id: 'b', type: 'deck', title: 'U', tags: '["x", 3]', share_string: 's' },
    ])
    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/library/search?q=100%25_off'),
      env,
    )
    expect(res.status).toBe(200)
    const data = await json<{ items: Array<{ tags: string[] }> }>(res)
    expect(data.items.map((i) => i.tags)).toEqual([[], ['x']])
    const stmt = env.DB.executed[0]!
    expect(stmt.sql).toContain("ESCAPE '\\'")
    expect(stmt.values).toEqual(['%100\\%\\_off%', '%100\\%\\_off%'])
  })

  it('library download rejects a missing or non-string id', async () => {
    for (const body of [{}, { id: 5 }, { id: '' }, 'nope']) {
      const res = await worker.fetch(
        new Request('http://worker.local/api/v1/library/download', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        makeEnv(),
      )
      expect(res.status).toBe(400)
    }
  })
})
