/**
 * Max Focus handler integration tests (M2-04 / M2-29) — the settings-haptics
 * pattern: isolated temp database via LEARNING_HUB_DB, handlers driven with
 * real Requests. Covers start/status/extend/exit/history, the M2-03 lock
 * columns surfacing in the responses, the PIN gate (wrong PIN, missing PIN,
 * rate limit) and the reflection-gate conflict mapping.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { createPinVault, type PinVault } from '@learning-hub/core'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-max-focus-')), 'max-focus.db')
process.env.LEARNING_HUB_DB = tempDbFile

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const url = (p: string) => `http://localhost${p}`

type Handlers = {
  max: typeof import('@/server/handlers/focus/max/route')
  exit: typeof import('@/server/handlers/focus/max/exit/route')
  extend: typeof import('@/server/handlers/focus/max/extend/route')
  history: typeof import('@/server/handlers/focus/max/history/route')
  db: typeof import('@learning-hub/db')
}

let H: Handlers
let vault: PinVault

beforeAll(async () => {
  vault = await createPinVault({ pin: '135790' }, { iterations: 1000 })
  H = {
    max: await import('@/server/handlers/focus/max/route'),
    exit: await import('@/server/handlers/focus/max/exit/route'),
    extend: await import('@/server/handlers/focus/max/extend/route'),
    history: await import('@/server/handlers/focus/max/history/route'),
    db: await import('@learning-hub/db'),
  }
})

/** Backdate the pending exit request so the reflection cooldown has elapsed. */
function backdateExitRequest(minutes: number): void {
  const db = H.db.getDb()
  db.update(H.db.focusSessions)
    .set({ exitRequestedAt: new Date(Date.now() - minutes * 60_000).toISOString() })
    .run()
}

describe('/api/focus/max — start & status', () => {
  it('reports an inactive lock with the M2-03 columns null before any session', async () => {
    const res = await H.max.GET(new Request(url('/api/focus/max')))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      lock: { active: boolean; state: string | null }
    }
    expect(body.ok).toBe(true)
    expect(body.lock.active).toBe(false)
    expect(body.lock.state).toBeNull()
  })

  it('POST starts a locked session stamped with the 4h hard cap and the tier', async () => {
    const res = await H.max.POST(
      new Request(
        url('/api/focus/max'),
        json({ minutes: 45, task: 'Thesis sprint', tier: 'owner' }),
      ),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      session: {
        state: string | null
        tier: string | null
        hardCapAt: string | null
        startedAt: string
      }
      lock: { state: string | null; tier: string | null; hardCapAt: string | null }
    }
    expect(body.ok).toBe(true)
    expect(body.session.state).toBe('locked')
    expect(body.session.tier).toBe('owner')
    const started = new Date(body.session.startedAt).getTime()
    expect(new Date(body.session.hardCapAt!).getTime()).toBe(started + 240 * 60_000)
    expect(body.lock.state).toBe('locked')
    expect(body.lock.tier).toBe('owner')
  })

  it('POST refuses a second concurrent session with 409', async () => {
    const res = await H.max.POST(new Request(url('/api/focus/max'), json({ minutes: 20 })))
    expect(res.status).toBe(409)
  })

  it('zod rejects out-of-band minutes at the boundary (rule 5)', async () => {
    const res = await H.max.POST(new Request(url('/api/focus/max'), json({ minutes: 5 })))
    expect(res.status).toBe(400)
  })

  it('GET status reflects the live lock with state/tier/hardCapAt', async () => {
    const res = await H.max.GET(new Request(url('/api/focus/max')))
    const body = (await res.json()) as {
      lock: {
        active: boolean
        mode: string
        state: string | null
        tier: string | null
        hardCapAt: string | null
      }
    }
    expect(body.lock.active).toBe(true)
    expect(body.lock.mode).toBe('max')
    expect(body.lock.state).toBe('locked')
    expect(body.lock.tier).toBe('owner')
    expect(body.lock.hardCapAt).not.toBeNull()
  })
})

describe('/api/focus/max/extend', () => {
  it('moves the planned end and keeps the hard cap fixed', async () => {
    const before = await H.max.GET(new Request(url('/api/focus/max')))
    const beforeLock = (await before.json()) as { lock: { endsAt: string; hardCapAt: string } }
    const res = await H.extend.POST(
      new Request(url('/api/focus/max/extend'), json({ extraMinutes: 30 })),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; lock: { endsAt: string; hardCapAt: string } }
    expect(body.ok).toBe(true)
    expect(new Date(body.lock.endsAt).getTime()).toBe(
      new Date(beforeLock.lock.endsAt).getTime() + 30 * 60_000,
    )
    expect(body.lock.hardCapAt).toBe(beforeLock.lock.hardCapAt)
  })

  it('rejects bad extend bodies at the boundary (rule 5)', async () => {
    const zero = await H.extend.POST(
      new Request(url('/api/focus/max/extend'), json({ extraMinutes: 0 })),
    )
    expect(zero.status).toBe(400)
  })
})

describe('/api/focus/max/exit — PIN-gated early exit', () => {
  it('request triggers the cooldown and status shows it', async () => {
    const res = await H.exit.POST(
      new Request(url('/api/focus/max/exit'), json({ action: 'request' })),
    )
    expect(res.status).toBe(200)
    const status = await H.max.GET(new Request(url('/api/focus/max')))
    const body = (await status.json()) as { lock: { state: string | null; exitState: string } }
    expect(body.lock.exitState).toBe('cooldown')
    expect(body.lock.state).toBe('cooldown')
  })

  it('confirm without a PIN is a 400 boundary error', async () => {
    const res = await H.exit.POST(
      new Request(
        url('/api/focus/max/exit'),
        json({ action: 'confirm', reflection: 'a reflection that is long enough here' }),
      ),
    )
    expect(res.status).toBe(400)
  })

  it('confirm with the correct PIN mid-cooldown is a 409 reflection-gate conflict', async () => {
    const res = await H.exit.POST(
      new Request(
        url('/api/focus/max/exit'),
        json({
          action: 'confirm',
          reflection: 'a reflection that is long enough here',
          pin: '135790',
          vault,
        }),
      ),
    )
    expect(res.status).toBe(409)
  })

  it('wrong PINs are 401 and rate-limit to 429 after five failures', async () => {
    backdateExitRequest(2) // cooldown elapsed; the gate now only blocks on the PIN
    for (let i = 0; i < 5; i++) {
      const res = await H.exit.POST(
        new Request(
          url('/api/focus/max/exit'),
          json({
            action: 'confirm',
            reflection: 'a reflection that is long enough here',
            pin: '000000',
            vault,
          }),
        ),
      )
      expect(res.status).toBe(401)
    }
    const locked = await H.exit.POST(
      new Request(
        url('/api/focus/max/exit'),
        json({
          action: 'confirm',
          reflection: 'a reflection that is long enough here',
          pin: '000000',
          vault,
        }),
      ),
    )
    expect(locked.status).toBe(429)
    expect(locked.headers.get('retry-after')).not.toBeNull()
  })

  it('a few (not lockout-level) failures do not block the correct PIN', async () => {
    // Two more wrong attempts (below the 5-failure lockout on a fresh window
    // would be 429 — so first clear the lockout by waiting it out in-process:
    // the window is process-local, so a new session id resets the counter.
    // Ending this session first frees the counter keyed to it.
    const status = await H.max.GET(new Request(url('/api/focus/max')))
    const body = (await status.json()) as { lock: { sessionId: number | null } }
    const db = H.db.getDb()
    db.delete(H.db.frictionEvents).run()
    if (body.lock.sessionId !== null) {
      db.delete(H.db.focusSessions).where(eq(H.db.focusSessions.id, body.lock.sessionId)).run()
    }

    // fresh session + fresh exit request, backdated past the cooldown
    const start = await H.max.POST(new Request(url('/api/focus/max'), json({ minutes: 20 })))
    expect(start.status).toBe(201)
    await H.exit.POST(new Request(url('/api/focus/max/exit'), json({ action: 'request' })))
    backdateExitRequest(2)

    const wrong = await H.exit.POST(
      new Request(
        url('/api/focus/max/exit'),
        json({
          action: 'confirm',
          reflection: 'a reflection that is long enough here',
          pin: '999999',
          vault,
        }),
      ),
    )
    expect(wrong.status).toBe(401)

    const right = await H.exit.POST(
      new Request(
        url('/api/focus/max/exit'),
        json({
          action: 'confirm',
          reflection: 'a reflection that is long enough here',
          pin: '135790',
          vault,
        }),
      ),
    )
    expect(right.status).toBe(200)
    const done = (await right.json()) as {
      session: { state: string | null; exitReason: string | null; endedEarly: boolean }
    }
    expect(done.session.state).toBe('ended')
    expect(done.session.exitReason).toBe('pin')
    expect(done.session.endedEarly).toBe(true)
  })
})

describe('/api/focus/max/history', () => {
  it('lists max sessions and the exit reflections (friction log)', async () => {
    const res = await H.history.GET(new Request(url('/api/focus/max/history')))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      sessions: { mode: string; exitReason: string | null; state: string | null }[]
      exits: { trigger: string; proceeded: boolean }[]
    }
    expect(body.ok).toBe(true)
    expect(body.sessions.length).toBeGreaterThan(0)
    expect(body.sessions.every((s) => s.mode === 'max')).toBe(true)
    expect(body.exits.length).toBe(1)
    expect(body.exits[0]).toMatchObject({ trigger: 'max_focus_exit', proceeded: true })
  })

  it('rejects a bad limit query at the boundary (rule 5)', async () => {
    const bad = await H.history.GET(new Request(url('/api/focus/max/history?limit=nope')))
    expect(bad.status).toBe(400)
  })
})

describe('route coverage (M2-29) — the max focus slice in the hub registry', () => {
  it('every focus/max route shim method is registered for the native hub', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative, resolve, sep } = await import('node:path')
    const { registeredRoutes } = await import('@/hub/handlers-registry')

    const maxDir = resolve(__dirname, '../app/api/focus/max')
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else if (entry === 'route.ts') out.push(full)
      }
      return out
    }
    const methodsOf = (file: string): string[] =>
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) =>
        new RegExp(
          `export\s+(?:const|async\s+function|function)\s+${m}\b|export\s*\{[^}]*\b${m}\b`,
        ).test(readFileSync(file, 'utf8')),
      )

    const registered = new Set(registeredRoutes().map((r) => `${r.method} ${r.path}`))
    const missing: string[] = []
    for (const file of walk(maxDir)) {
      const rel = relative(resolve(maxDir), file).split(sep).slice(0, -1).join('/')
      const path = `/api/focus/max/${rel}`.replace(/\/$/, '')
      for (const method of methodsOf(file)) {
        if (!registered.has(`${method} ${path}`)) missing.push(`${method} ${path}`)
      }
    }
    // start/status, exit, extend, history — every shim the epic adds
    expect(missing).toEqual([])
    expect(registered.has('GET /api/focus/max')).toBe(true)
    expect(registered.has('POST /api/focus/max')).toBe(true)
    expect(registered.has('POST /api/focus/max/exit')).toBe(true)
    expect(registered.has('POST /api/focus/max/extend')).toBe(true)
    expect(registered.has('GET /api/focus/max/history')).toBe(true)
  })
})
