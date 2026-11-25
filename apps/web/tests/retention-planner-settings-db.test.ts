/**
 * Retention Planner against the REAL settings handler and an isolated temp
 * database (never the user's collection): actual PUT semantics (partial,
 * clamped, validated), the staleness fingerprint from the real loader, and the
 * guarded apply/restore sequence the UI runs, including a stale setting, a
 * rejected (partial-failure) update and an intervening change.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-rp-settings-')), 'rp.db')

let settingsRoute: typeof import('@/server/handlers/settings/route')
let plannerRoute: typeof import('@/server/handlers/retention-planner/route')
let dbm: typeof import('@learning-hub/db')

const req = (method: string, body?: unknown) =>
  new Request('http://x/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const put = (body: unknown) => settingsRoute.PUT(req('PUT', body))
const live = async () =>
  ((await (await settingsRoute.GET()).json()) as { settings: { desiredRetention: number } })
    .settings.desiredRetention
const fp = async () =>
  (
    (await (await plannerRoute.POST(req('POST', { fingerprintOnly: true }))).json()) as {
      fingerprint: string
    }
  ).fingerprint

/** The same guarded sequence ApplyPanel runs, against the real handlers. */
async function guardedApply(baseline: number, fingerprint: string, candidate: number) {
  const before = await live()
  if (Math.abs(before - baseline) > 1e-9) return { refused: 'baseline' as const, before }
  if ((await fp()) !== fingerprint) return { refused: 'inputs' as const, before }
  const res = await put({ desiredRetention: candidate })
  if (!res.ok) return { refused: 'rejected' as const, before }
  return { applied: candidate, previous: before }
}
async function guardedRestore(rec: { applied: number; previous: number }) {
  if (Math.abs((await live()) - rec.applied) > 1e-9) return { refused: true as const }
  await put({ desiredRetention: rec.previous })
  return { refused: false as const }
}

beforeAll(async () => {
  settingsRoute = await import('@/server/handlers/settings/route')
  plannerRoute = await import('@/server/handlers/retention-planner/route')
  dbm = await import('@learning-hub/db')
  dbm.db.insert(dbm.decks).values({ id: 1, name: 'RP deck' }).onConflictDoNothing().run()
  dbm.db
    .insert(dbm.cards)
    .values({
      id: 1,
      deckId: 1,
      type: 'basic',
      content: { basic: { front: 'F', back: 'B' } },
      tags: [],
      state: 2,
      due: new Date().toISOString(),
      stability: 5,
      difficulty: 5,
    })
    .onConflictDoNothing()
    .run()
})

describe('retention planner with the real settings handler (temp DB)', () => {
  it('PUT is partial: only desiredRetention changes and other fields are kept', async () => {
    expect((await put({ theme: 'light' })).status).toBe(200)
    expect((await put({ desiredRetention: 0.93 })).status).toBe(200)
    const body = (await (await settingsRoute.GET()).json()) as {
      settings: { desiredRetention: number; theme: string }
    }
    expect(body.settings.desiredRetention).toBe(0.93)
    expect(body.settings.theme).toBe('light')
  })

  it('PUT clamps to 0.5..0.97 and rejects non-numbers without changing the value', async () => {
    await put({ desiredRetention: 0.93 })
    await put({ desiredRetention: 0.99 })
    expect(await live()).toBe(0.97)
    await put({ desiredRetention: 0.2 })
    expect(await live()).toBe(0.5)
    await put({ desiredRetention: 0.93 })
    const bad = await put({ desiredRetention: 'high' })
    expect(bad.status).toBe(400)
    expect(await live()).toBe(0.93)
  })

  it('a rejected update (partial failure) leaves the stored value untouched', async () => {
    const res = await put({ desiredRetention: 0.9, theme: 'nonsense' })
    expect(res.status).toBe(400)
    expect(await live()).toBe(0.93)
  })

  it('the run baseline comes from the stored setting and the fingerprint is stable', async () => {
    const a = await fp()
    expect(await fp()).toBe(a)
    const res = await plannerRoute.POST(req('POST', { budgetMinutes: 20, horizonDays: 30 }))
    const json = (await res.json()) as { result: { currentRetention: number; fingerprint: string } }
    expect(json.result.currentRetention).toBe(0.93)
    expect(json.result.fingerprint).toBe(a)
  })

  it('apply then restore works and restores the exact previous value', async () => {
    const baseline = await live()
    const rec = await guardedApply(baseline, await fp(), 0.9)
    expect(rec).toMatchObject({ applied: 0.9, previous: 0.93 })
    expect(await live()).toBe(0.9)
    if (!('applied' in rec)) throw new Error('expected an applied record')
    expect((await guardedRestore(rec)).refused).toBe(false)
    expect(await live()).toBe(0.93)
  })

  it('a stale setting refuses the apply and writes nothing', async () => {
    const baseline = 0.93
    const fingerprint = await fp()
    await put({ desiredRetention: 0.95 }) // changed elsewhere after the run
    const out = await guardedApply(baseline, fingerprint, 0.9)
    expect(out).toMatchObject({ refused: 'baseline', before: 0.95 })
    expect(await live()).toBe(0.95)
    await put({ desiredRetention: 0.93 })
  })

  it('changed cards invalidate the run: fingerprint differs and apply is refused', async () => {
    const baseline = await live()
    const fingerprint = await fp()
    dbm.db
      .insert(dbm.cards)
      .values({
        id: 2,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'F2', back: 'B2' } },
        tags: [],
        state: 2,
        due: new Date().toISOString(),
        stability: 9,
        difficulty: 4,
      })
      .run()
    expect(await fp()).not.toBe(fingerprint)
    expect(await guardedApply(baseline, fingerprint, 0.9)).toMatchObject({ refused: 'inputs' })
    expect(await live()).toBe(0.93)
  })

  it('changed global weights invalidate the run', async () => {
    const fingerprint = await fp()
    const w = Array.from({ length: 21 }, (_, i) => 0.5 + i / 100)
    const r = await put({ fsrsWeights: w })
    expect(r.status).toBe(200)
    expect(await fp()).not.toBe(fingerprint)
  })

  it('restore refuses when something else changed the setting in between', async () => {
    const rec = { applied: 0.9, previous: 0.93 }
    await put({ desiredRetention: 0.9 })
    await put({ desiredRetention: 0.85 })
    expect((await guardedRestore(rec)).refused).toBe(true)
    expect(await live()).toBe(0.85)
  })
})
