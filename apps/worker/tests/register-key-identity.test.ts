import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'

/** Stateful D1 stand-in for the users table: PK id, UNIQUE pubkey. */
function usersD1(): { db: D1Database; users: Map<string, { id: string; alias: string }> } {
  const byPubkey = new Map<string, { id: string; alias: string }>()
  const db = {
    prepare(sql: string): D1PreparedStatement {
      let bound: D1Value[] = []
      const stmt: D1PreparedStatement = {
        bind(...values: D1Value[]) {
          bound = values
          return stmt
        },
        run: async () => {
          if (sql.includes('INSERT INTO users')) {
            const [id, pubkey, alias] = bound as [string, string, string]
            const existing = byPubkey.get(pubkey)
            if (existing) existing.alias = alias
            else {
              for (const u of byPubkey.values()) {
                if (u.id === id) throw new Error('UNIQUE constraint failed: users.id')
              }
              byPubkey.set(pubkey, { id, alias })
            }
          }
          return { success: true }
        },
        all: async <T>() => ({ results: [] as T[] }),
        first: async <T>() => {
          if (sql.includes('SELECT id FROM users')) {
            const row = byPubkey.get(bound[0] as string)
            return (row ? { id: row.id } : null) as T | null
          }
          return null
        },
      }
      return stmt
    },
  } as unknown as D1Database
  return { db, users: byPubkey }
}

function envWith(db: D1Database): Env {
  return { DB: db } as unknown as Env
}

async function register(env: Env, alias: string, pair: { publicKey: string; privateKey: string }) {
  const { identityChallenge, identitySigningPayload, signIdentityPayload } = await import(
    '@learning-hub/core'
  )
  const challenge = identityChallenge('usr_test', 1730000000000)
  const signature = await signIdentityPayload(
    pair.privateKey,
    identitySigningPayload(challenge, alias),
  )
  const res = await worker.fetch(
    new Request('http://worker.local/api/v1/auth/register-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey: pair.publicKey, alias, challenge, signature }),
    }),
    env,
  )
  return { status: res.status, body: (await res.json()) as { userId: string } }
}

describe('register-key identity ids', () => {
  it('gives distinct keys distinct ids and the same key a stable id', async () => {
    const { generateIdentityKeyPair } = await import('@learning-hub/core')
    const { db } = usersD1()
    const env = envWith(db)
    const a = await generateIdentityKeyPair()
    const b = await generateIdentityKeyPair()
    const ra = await register(env, 'Ada', a)
    const rb = await register(env, 'Bo', b)
    expect(ra.status).toBe(200)
    expect(rb.status).toBe(200)
    expect(ra.body.userId).not.toBe(rb.body.userId)
    const again = await register(env, 'Ada', a)
    expect(again.body.userId).toBe(ra.body.userId)
  })

  it('never reassigns an account that was registered under a legacy id', async () => {
    const { generateIdentityKeyPair } = await import('@learning-hub/core')
    const { db, users } = usersD1()
    const env = envWith(db)
    const a = await generateIdentityKeyPair()
    // Row written by the old code: id = usr_ + first 16 chars of the key text.
    users.set(a.publicKey, { id: `usr_${a.publicKey.slice(0, 16)}`, alias: 'Old' })
    const r = await register(env, 'Renamed', a)
    expect(r.status).toBe(200)
    expect(r.body.userId).toBe(`usr_${a.publicKey.slice(0, 16)}`)
    expect(users.get(a.publicKey)?.id).toBe(`usr_${a.publicKey.slice(0, 16)}`)
    expect(users.get(a.publicKey)?.alias).toBe('Renamed')
  })

  it('a second key no longer collides with a legacy-id account', async () => {
    const { generateIdentityKeyPair } = await import('@learning-hub/core')
    const { db, users } = usersD1()
    const env = envWith(db)
    const a = await generateIdentityKeyPair()
    const b = await generateIdentityKeyPair()
    users.set(a.publicKey, { id: `usr_${a.publicKey.slice(0, 16)}`, alias: 'Old' })
    // Old code made every key share this prefix, so this insert would have failed.
    expect(b.publicKey.slice(0, 16)).toBe(a.publicKey.slice(0, 16))
    const r = await register(env, 'Newcomer', b)
    expect(r.status).toBe(200)
    expect(r.body.userId).not.toBe(`usr_${a.publicKey.slice(0, 16)}`)
  })
})
