/**
 * Settings round-trip for the haptics opt-out (F-06): PUT persists
 * `hapticsEnabled` through zod, GET reflects it back. Isolated temp database
 * (the curriculum-api.test.ts pattern — handlers driven with real Requests).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(
  mkdtempSync(join(tmpdir(), 'lh-settings-haptics-')),
  'settings.db',
)

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const url = (p: string) => `http://localhost${p}`

type Handlers = {
  settings: typeof import('@/server/handlers/settings/route')
}
let H: Handlers

beforeAll(async () => {
  H = { settings: await import('@/server/handlers/settings/route') }
})

describe('settings: haptics opt-out (F-06)', () => {
  it('defaults to enabled (shipped behavior) until the user opts out', async () => {
    const res = await H.settings.GET()
    const { settings } = (await res.json()) as { settings: { hapticsEnabled?: boolean } }
    expect(settings.hapticsEnabled).toBe(true)
  })

  it('PUT persists hapticsEnabled: false; GET round-trips it', async () => {
    const put = await H.settings.PUT(
      new Request(url('/api/settings'), json({ hapticsEnabled: false })),
    )
    expect(put.status).toBe(200)
    const putBody = (await put.json()) as { settings: { hapticsEnabled?: boolean } }
    expect(putBody.settings.hapticsEnabled).toBe(false)

    const get = await H.settings.GET()
    const { settings } = (await get.json()) as { settings: { hapticsEnabled?: boolean } }
    expect(settings.hapticsEnabled).toBe(false)
  })

  it('PUT persists hapticsEnabled: true again (the toggle round-trips both ways)', async () => {
    const put = await H.settings.PUT(
      new Request(url('/api/settings'), json({ hapticsEnabled: true })),
    )
    const putBody = (await put.json()) as { settings: { hapticsEnabled?: boolean } }
    expect(putBody.settings.hapticsEnabled).toBe(true)
  })

  it('zod rejects non-boolean values at the boundary (rule 5)', async () => {
    const res = await H.settings.PUT(
      new Request(url('/api/settings'), json({ hapticsEnabled: 'yes' })),
    )
    expect(res.status).toBe(400)
  })
})
