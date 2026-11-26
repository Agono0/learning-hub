/**
 * GET /api/focus/max signed proof for the extension's web fallback. Isolated temp database,
 * synthetic nonces only; the bridge token is whatever the temp database generates and is
 * never printed or asserted as a literal.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyLockProof } from '@learning-hub/core/focus-lock'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-focus-proof-')), 'p.db')

type Max = typeof import('@/server/handlers/focus/max/route')
type Db = typeof import('@learning-hub/db')
let max: Max
let db: Db
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA'
const get = (qs = '') => max.GET(new Request(`http://localhost/api/focus/max${qs}`))
const post = (body: unknown) =>
  max.POST(
    new Request('http://localhost/api/focus/max', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  max = await import('@/server/handlers/focus/max/route')
  db = await import('@learning-hub/db')
})

const bridgeRows = () => db.getDb().select().from(db.focusBridge).all().length

describe('GET /api/focus/max is read-only', () => {
  it('a valid-nonce GET on an empty database creates no bridge row and returns no proof', async () => {
    expect(db.getFocusBridgeToken()).toBeNull()
    expect(bridgeRows()).toBe(0)
    const res = await get(`?nonce=${NONCE}`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.proof).toBeUndefined()
    expect(body.lock.lastHeartbeatAt).toBeNull()
    expect(bridgeRows()).toBe(0)
    expect(db.getActiveFocusLock().active).toBe(false)
    expect(bridgeRows()).toBe(0)
  })
})

describe('/api/focus/max proof', () => {
  it('omits the proof without a nonce or with an invalid nonce, and never leaks the token', async () => {
    const token = db.getOrCreateFocusBridge().pairingToken
    for (const qs of [
      '',
      '?nonce=',
      '?nonce=short',
      '?nonce=has%20space%20%20%20%20%20%20%20%20%20',
    ]) {
      const res = await get(qs)
      const text = await res.text()
      expect(res.status).toBe(200)
      expect(JSON.parse(text).proof).toBeUndefined()
      expect(text).not.toContain(token)
    }
  })

  it('returns a verifiable inactive proof when no lock is running', async () => {
    const token = db.getFocusBridgeToken()!
    const body = await (await get(`?nonce=${NONCE}`)).json()
    const r = await verifyLockProof(token, NONCE, body.proof, Date.now())
    expect(r.ok).toBe(true)
    expect(r.ok && r.lock.active).toBe(false)
    expect(JSON.stringify(body)).not.toContain(token)
  })

  it('signs an active lock; the proof verifies only for its own nonce and token', async () => {
    expect((await post({ minutes: 45, task: 'Thesis sprint', tier: 'owner' })).status).toBe(201)
    const token = db.getFocusBridgeToken()!
    const body = await (await get(`?nonce=${NONCE}`)).json()
    const ok = await verifyLockProof(token, NONCE, body.proof, Date.now())
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.lock.active).toBe(true)
    expect(body.lock.active).toBe(true)
    expect(
      (await verifyLockProof(token, 'BBBBBBBBBBBBBBBBBBBBBB', body.proof, Date.now())).ok,
    ).toBe(false)
    expect((await verifyLockProof('some-other-token', NONCE, body.proof, Date.now())).ok).toBe(
      false,
    )
  })

  it('GET with a nonce does not rotate or change the pairing token or add rows', async () => {
    const before = db.getFocusBridgeToken()
    await get(`?nonce=${NONCE}`)
    expect(db.getFocusBridgeToken()).toBe(before)
    expect(bridgeRows()).toBe(1)
  })
})
