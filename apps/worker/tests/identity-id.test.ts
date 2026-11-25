import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'
import { deriveUserId } from '../src/identity-id'

interface Bound {
  sql: string
  values: D1Value[]
}

function fakeDb(existing: { id: string } | null) {
  const log: Bound[] = []
  const db = {
    prepare(sql: string): D1PreparedStatement {
      const stmt: D1PreparedStatement = {
        bind(...values: D1Value[]) {
          log.push({ sql, values })
          return stmt
        },
        run: async () => ({ success: true }),
        all: async <T>() => ({ results: [] as T[] }),
        first: async <T>() => (existing as T | null) ?? null,
      }
      return stmt
    },
  } as D1Database
  return { db, log }
}

async function register(db: D1Database) {
  const {
    generateIdentityKeyPair,
    identityChallenge,
    identitySigningPayload,
    signIdentityPayload,
  } = await import('@learning-hub/core')
  const pair = await generateIdentityKeyPair()
  const challenge = identityChallenge('usr_local', 1730000000000)
  const signature = await signIdentityPayload(
    pair.privateKey,
    identitySigningPayload(challenge, 'Ada'),
  )
  const res = await worker.fetch(
    new Request('http://w.local/api/v1/auth/register-key', {
      method: 'POST',
      body: JSON.stringify({ pubkey: pair.publicKey, alias: 'Ada', challenge, signature }),
    }),
    { DB: db } as unknown as Env,
  )
  return { res, pubkey: pair.publicKey }
}

describe('register-key user id', () => {
  it('derives different ids for different keys (the old 16-char prefix was constant)', async () => {
    const { generateIdentityKeyPair } = await import('@learning-hub/core')
    const a = await generateIdentityKeyPair()
    const b = await generateIdentityKeyPair()
    expect(a.publicKey.slice(0, 16)).toBe(b.publicKey.slice(0, 16))
    const [ia, ib] = [await deriveUserId(a.publicKey), await deriveUserId(b.publicKey)]
    expect(ia).not.toBe(ib)
    expect(ia).toMatch(/^usr_[0-9a-f]{32}$/)
    expect(await deriveUserId(a.publicKey)).toBe(ia)
  })

  it('assigns the derived id to a new key', async () => {
    const { db, log } = fakeDb(null)
    const { res, pubkey } = await register(db)
    const data = (await res.json()) as { userId: string }
    expect(data.userId).toBe(await deriveUserId(pubkey))
    const insert = log.find((l) => l.sql.includes('INSERT INTO users'))
    expect(insert?.values[0]).toBe(data.userId)
  })

  it('keeps the stored id of an already registered key (no silent rebinding)', async () => {
    const { db, log } = fakeDb({ id: 'usr_MFkwEwYHKoZIzj0C' })
    const { res } = await register(db)
    const data = (await res.json()) as { userId: string }
    expect(data.userId).toBe('usr_MFkwEwYHKoZIzj0C')
    expect(log.find((l) => l.sql.includes('INSERT INTO users'))?.values[0]).toBe(
      'usr_MFkwEwYHKoZIzj0C',
    )
  })
})
