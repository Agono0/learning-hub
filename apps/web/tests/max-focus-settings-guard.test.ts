/**
 * M2-21 — settings are locked while a Max Focus session runs: the settings
 * PUT refuses writes (423), GET stays readable, standard focus sessions do
 * NOT lock settings, and the guard lifts when the session ends (any unlock
 * reason — battery here, via the M2-03 repo setter).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-max-focus-guard-')), 'guard.db')
process.env.LEARNING_HUB_DB = tempDbFile

const json = (body: unknown) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const postJson = (body: unknown) => ({ ...json(body), method: 'POST' })
const url = (p: string) => `http://localhost${p}`

type Handlers = {
  settings: typeof import('@/server/handlers/settings/route')
  max: typeof import('@/server/handlers/focus/max/route')
  focus: typeof import('@/server/handlers/focus/route')
  db: typeof import('@learning-hub/db')
}

let H: Handlers

beforeAll(async () => {
  H = {
    settings: await import('@/server/handlers/settings/route'),
    max: await import('@/server/handlers/focus/max/route'),
    focus: await import('@/server/handlers/focus/route'),
    db: await import('@learning-hub/db'),
  }
})

describe('M2-21 settings lock guard', () => {
  it('PUT works when no Max Focus session is running', async () => {
    const res = await H.settings.PUT(new Request(url('/api/settings'), json({ theme: 'light' })))
    expect(res.status).toBe(200)
  })

  it('a STANDARD focus session does not lock settings', async () => {
    const start = await H.focus.POST(
      new Request(url('/api/focus'), postJson({ plannedMinutes: 25 })),
    )
    expect(start.status).toBe(201)
    const res = await H.settings.PUT(new Request(url('/api/settings'), json({ theme: 'dark' })))
    expect(res.status).toBe(200)
    const open = H.db.getOpenFocusSession()
    if (open) H.db.abandonFocusSession(open.id)
  })

  it('PUT refuses writes while a Max Focus session is active (423) — GET stays readable', async () => {
    const start = await H.max.POST(new Request(url('/api/focus/max'), postJson({ minutes: 45 })))
    expect(start.status).toBe(201)

    const put = await H.settings.PUT(
      new Request(url('/api/settings'), json({ hapticsEnabled: false })),
    )
    expect(put.status).toBe(423)
    const body = (await put.json()) as { error: string }
    expect(body.error).toMatch(/Max Focus session is running/)

    const get = await H.settings.GET()
    expect(get.status).toBe(200)
    const { settings } = (await get.json()) as { settings: { hapticsEnabled?: boolean } }
    expect(settings.hapticsEnabled).toBe(true) // the write did not land
  })

  it('the guard lifts once the session ends (system unlock via the M2-03 setter)', async () => {
    const open = H.db.getOpenFocusSession()
    expect(open).toBeDefined()
    H.db.endMaxFocusSessionByReason(open!.id, { reason: 'battery' })

    const res = await H.settings.PUT(new Request(url('/api/settings'), json({ theme: 'e-ink' })))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings: { theme: string } }
    expect(body.settings.theme).toBe('e-ink')
  })
})
