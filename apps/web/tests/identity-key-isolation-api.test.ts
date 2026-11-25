/**
 * The device private key must not leave the device through the backup download
 * or the public identity GET. Synthetic marker only; no real key is made or read.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-idkey-test-')), 'id.db')

const MARKER = 'SYNTHETIC-PRIV-MARKER-API'

type Modules = {
  backup: typeof import('../src/server/handlers/backup/route')
  identity: typeof import('../src/server/handlers/online/identity/route')
  db: typeof import('@learning-hub/db')
}
let M: Modules

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  M = {
    db,
    backup: await import('../src/server/handlers/backup/route'),
    identity: await import('../src/server/handlers/online/identity/route'),
  }
  db.getOnlineIdentity()
  db.updateOnlineIdentity({ mode: 'device_key', pubKey: 'PUB-API', privKey: MARKER })
})

describe('identity key isolation (API)', () => {
  it('GET /api/backup carries no private key and exports online_identity empty', async () => {
    const res = await M.backup.GET(new Request('http://localhost/api/backup'))
    const text = await res.text()
    expect(text).not.toContain(MARKER)
    const data = JSON.parse(text) as { tables: Record<string, unknown[]> }
    expect(data.tables.online_identity).toEqual([])
  })

  it('GET /api/online/identity returns the public key but never the private key', async () => {
    const res = await M.identity.GET(new Request('http://localhost/api/online/identity'))
    const text = await res.text()
    expect(text).not.toContain(MARKER)
    expect(text).not.toContain('privKey')
    expect(text).not.toContain('priv_key')
    expect(JSON.parse(text).identity.pubKey).toBe('PUB-API')
  })

  it('a legacy replace-restore does not overwrite the local key', async () => {
    const res = await M.backup.GET(new Request('http://localhost/api/backup'))
    const env = (await res.json()) as { tables: Record<string, unknown[]> }
    env.tables.online_identity = [
      {
        id: 1,
        mode: 'device_key',
        user_id: 'other',
        alias: 'o',
        pub_key: 'PUB-OTHER',
        priv_key: 'OTHER-MARKER',
        registered_at: null,
      },
    ]
    const post = await M.backup.POST(
      new Request('http://localhost/api/backup?mode=replace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(env),
      }),
    )
    expect(post.status).toBeLessThan(300)
    const local = M.db.getOnlineIdentity()
    expect(local.privKey).toBe(MARKER)
    expect(local.pubKey).toBe('PUB-API')
  })
})
