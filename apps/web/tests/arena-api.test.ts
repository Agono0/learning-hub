/**
 * Arena API handler integration tests — server-issued run settlement.
 *
 * Covers the full settlement contract:
 *  - GET builds a session from real due cards through the review engine and
 *    ISSUES a server-owned run (runId) bound to the exact queue it dealt.
 *  - POST settles only against that run: invented cards and repeated cards
 *    are rejected (400), unknown runs 404, a fresh in-progress claim 409s,
 *    and a stale claim can be reclaimed by a retry.
 *  - The outcome is recomputed server-side: a lying client (inflated
 *    bestCombo / wrong result) cannot change coins or XP.
 *  - Settlement is exactly-once: an identical replay returns the stored
 *    response with no re-mint, an altered log on a settled run is 409, and
 *    concurrent duplicate POSTs settle once.
 *  - Reviews, coins, XP, run record, achievements and the status flip are
 *    one atomic transaction (rollback covered in packages/db tests).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-arena-test-')), 'arena.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  arena: typeof import('../src/server/handlers/arena/route')
  history: typeof import('../src/server/handlers/arena/history/route')
  nemesis: typeof import('../src/server/handlers/arena/nemesis/route')
  exportRoute: typeof import('../src/server/handlers/arena/export/route')
  progress: typeof import('../src/server/handlers/arena/progress/route')
  cardRoute: typeof import('../src/server/handlers/arena/card/[id]/route')
  historyId: typeof import('../src/server/handlers/arena/history/[id]/route')
  db: typeof import('@learning-hub/db')
  core: typeof import('@learning-hub/core')
}

let M: Modules
let deckSeq = 0

type Exchange = { cardId: number; grade: number; confidence: number; timeMs: number }

/** summarizeGradeLog takes the strict grade/confidence unions; test logs are loose. */
function strict(
  log: Exchange[],
): Parameters<typeof import('@learning-hub/core').summarizeGradeLog>[0] {
  return log as Parameters<typeof import('@learning-hub/core').summarizeGradeLog>[0]
}

/**
 * Seed a fresh deck with `n` due cards. Settlement tests each get their own
 * deck because the settlement runs REAL reviews: FSRS reschedules graded
 * cards minutes to days ahead, so a shared pool depletes mid-suite.
 */
function seedDeckWithCards(n: number): { deckId: number; cardIds: number[] } {
  deckSeq += 1
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const [deck] = M.db.db
    .insert(M.db.decks)
    .values({ name: `Arena Deck ${deckSeq}`, description: 'Settlement harness deck' })
    .returning()
    .all()
  const ids: number[] = []
  for (let i = 0; i < n; i++) {
    const [card] = M.db.db
      .insert(M.db.cards)
      .values({
        deckId: deck!.id,
        type: 'basic',
        content: { basic: { front: `Arena D${deckSeq} Q${i + 1}`, back: `A${i + 1}` } },
        due: past,
      })
      .returning()
      .all()
    ids.push(card!.id)
  }
  return { deckId: deck!.id, cardIds: ids }
}

/** Issue a real run through GET and return its id + dealt queue. */
async function startRun(deckId: number, limit = 10): Promise<{ runId: string; queue: number[] }> {
  const res = await M.arena.GET(
    new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=${limit}`),
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(typeof body.runId).toBe('string')
  expect(body.runId.length).toBeGreaterThan(0)
  expect(body.cards.length).toBeGreaterThan(0)
  return { runId: body.runId, queue: body.cards.map((c: { id: number }) => c.id) }
}

function gradeLog(queue: number[], slice: [number, number], base = 2500): Exchange[] {
  return queue.slice(slice[0], slice[1]).map((cardId, i) => ({
    cardId,
    grade: i === slice[1] - slice[0] - 1 ? 1 : 3,
    confidence: i === 0 ? 1 : 0,
    timeMs: base + i * 700,
  }))
}

function postSettlement(payload: Record<string, unknown>): Promise<Response> {
  return M.arena.POST(
    new Request('http://localhost/api/arena', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}

function settlePayload(runId: string, exchanges: Exchange[], extra: Record<string, unknown> = {}) {
  return { runId, exchanges, bestCombo: 2, result: 'victory', ...extra }
}

function revlogCount(): number {
  return M.db.db.select().from(M.db.revlog).all().length
}

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const arenaMod = await import('../src/server/handlers/arena/route')
  const historyMod = await import('../src/server/handlers/arena/history/route')
  const nemesisMod = await import('../src/server/handlers/arena/nemesis/route')
  const exportMod = await import('../src/server/handlers/arena/export/route')
  const progressMod = await import('../src/server/handlers/arena/progress/route')
  const cardMod = await import('../src/server/handlers/arena/card/[id]/route')
  const historyIdMod = await import('../src/server/handlers/arena/history/[id]/route')
  const coreMod = await import('@learning-hub/core')
  M = {
    arena: arenaMod,
    history: historyMod,
    nemesis: nemesisMod,
    exportRoute: exportMod,
    progress: progressMod,
    cardRoute: cardMod,
    historyId: historyIdMod,
    db: dbMod,
    core: coreMod,
  }
})

describe('Arena API — GET /api/arena', () => {
  it('builds a session from real due cards and issues a server-owned run', async () => {
    const { deckId } = seedDeckWithCards(6)
    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=5`),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.runId).toBe('string')
    expect(body.cards.length).toBeGreaterThan(0)
    expect(body.cards.length).toBeLessThanOrEqual(5)
    for (const card of body.cards) {
      expect(card.content.basic.front).toMatch(/^Arena D/)
      expect(card.previews).toBeDefined()
    }
    expect(body.config.maxHp).toBeGreaterThan(0)

    // The issued run row binds the dealt queue + guardian server-side.
    const run = M.db.getArenaSession(body.runId)
    expect(run).toBeDefined()
    expect(run!.status).toBe('open')
    expect(run!.cardIds.slice().sort()).toEqual(body.cards.map((c: { id: number }) => c.id).sort())
    expect(run!.archetype).toBe(body.guardian.archetype)
    expect(run!.boss).toBe(body.guardian.boss)
  })

  it('issues a distinct runId per request', async () => {
    const { deckId } = seedDeckWithCards(5)
    const a = await startRun(deckId, 5)
    const b = await startRun(deckId, 5)
    expect(a.runId).not.toBe(b.runId)
  })

  it('defaults to a 10-card run when no limit is given (NaN regression)', async () => {
    const { deckId } = seedDeckWithCards(4)
    const res = await M.arena.GET(new Request(`http://localhost/api/arena?deckIds=${deckId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.limit).toBe(10)
    expect(body.cards.length).toBe(4) // all four due cards, no NaN-empty queue
  })

  it('clamps the limit into the arena band (5..20)', async () => {
    const { deckId } = seedDeckWithCards(2)
    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=500`),
    )
    const body = await res.json()
    expect(body.limit).toBeLessThanOrEqual(20)
  })
})

describe('Arena API — POST settlement validation', () => {
  it('rejects an unknown runId with 404', async () => {
    const res = await postSettlement(
      settlePayload(crypto.randomUUID(), [{ cardId: 1, grade: 3, confidence: 1, timeMs: 900 }]),
    )
    expect(res.status).toBe(404)
  })

  it('rejects a card the server never dealt into the run (invented card)', async () => {
    const { deckId, cardIds } = seedDeckWithCards(5)
    const { runId } = await startRun(deckId, 5)
    const { cardIds: otherDeckCards } = seedDeckWithCards(2)
    const before = revlogCount()
    // A card id that exists but was never dealt into this run — and a
    // completely fabricated id — are both rejected.
    for (const inventedId of [otherDeckCards[0]!, 999_999]) {
      const res = await postSettlement(
        settlePayload(runId, [{ cardId: inventedId, grade: 3, confidence: 0, timeMs: 1000 }]),
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/not part of this arena run/)
    }
    // No reviews were applied and the claim was released (run is open again).
    expect(revlogCount()).toBe(before)
    expect(M.db.getArenaSession(runId)!.status).toBe('open')
    expect(cardIds.length).toBe(5)
  })

  it('rejects a repeated card in the grade log', async () => {
    const { deckId } = seedDeckWithCards(5)
    const { runId, queue } = await startRun(deckId, 5)
    const cardId = queue[0]!
    const res = await postSettlement(
      settlePayload(runId, [
        { cardId, grade: 3, confidence: 1, timeMs: 900 },
        { cardId, grade: 4, confidence: 0, timeMs: 400 },
      ]),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/more than once/)
    expect(M.db.getArenaSession(runId)!.status).toBe('open')
  })

  it('rejects a settlement with no exchanges (schema, before any claim)', async () => {
    const res = await postSettlement(settlePayload(crypto.randomUUID(), []))
    expect(res.status).toBe(400)
  })

  it('rejects an out-of-range grade (schema, before any claim)', async () => {
    const res = await postSettlement(
      settlePayload(crypto.randomUUID(), [{ cardId: 1, grade: 7, confidence: 0, timeMs: 1000 }]),
    )
    expect(res.status).toBe(400)
  })

  it('rejects a malformed runId (schema)', async () => {
    const res = await postSettlement(
      settlePayload('not-a-uuid', [{ cardId: 1, grade: 3, confidence: 0, timeMs: 1000 }]),
    )
    expect(res.status).toBe(400)
  })
})

describe('Arena API — settlement execution', () => {
  it('schedules every exchange through the canonical review engine', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = gradeLog(queue, [0, 3])
    const before = revlogCount()
    const res = await postSettlement(settlePayload(runId, exchanges))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.summary.rounds).toBe(3)
    expect(revlogCount() - before).toBe(3)

    // FSRS actually rescheduled the cards (due moved into the future).
    const first = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, queue[0]!))
      .limit(1)
      .all()[0]
    expect(new Date(first!.due).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(first!.reps).toBe(1)

    // The run is settled, with the accepted log + response persisted.
    const run = M.db.getArenaSession(runId)!
    expect(run.status).toBe('settled')
    expect(run.settledAt).toBeTruthy()
    expect((run.gradeLog as Exchange[]).length).toBe(3)
    expect((run.settlementJson as { ok: boolean }).ok).toBe(true)

    // Per-card schedule recap matches what FSRS actually persisted.
    expect(body.schedule.length).toBe(3)
    for (const entry of body.schedule) {
      const card = M.db.db
        .select()
        .from(M.db.cards)
        .where(eq(M.db.cards.id, entry.cardId))
        .limit(1)
        .all()[0]!
      expect(entry.due).toBe(card.due)
      expect(entry.reps).toBe(card.reps)
      expect(entry.xpEarned).toBeGreaterThan(0)
    }
  })

  it('recomputes the summary server-side and ignores a lying client', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const res = await postSettlement(
      settlePayload(runId, gradeLog(queue, [0, 3], 9100), {
        bestCombo: 999,
        result: 'defeat',
        // Stray client fields are stripped by the schema, never trusted.
        archetype: 'colossus',
        boss: true,
      }),
    )
    const body = await res.json()
    // Two correct + one Again: the engine's own count wins over the client.
    expect(body.summary.correct).toBe(2)
    expect(body.summary.bestCombo).toBeLessThan(10)
    // 3 of 5 queued cards graded: an unfinished queue is never a victory,
    // whatever the (truncated) log or the client claims.
    expect(body.summary.result).toBe('defeat')
  })

  it('awards arena XP as a distinct xp_events source', async () => {
    const rows = M.db.db
      .select()
      .from(M.db.xpEvents)
      .all()
      .filter((r) => r.source === 'arena')
    expect(rows.length).toBeGreaterThan(0)
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBeGreaterThan(0)
  })
})

describe('Arena API — exactly-once settlement', () => {
  it('identical replay returns the stored response and mints nothing twice', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = gradeLog(queue, [0, 2])
    const payload = settlePayload(runId, exchanges)
    const before = revlogCount()

    const first = await postSettlement(payload)
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.coinsAwarded).toBeGreaterThan(0)

    const replay = await postSettlement(payload)
    expect(replay.status).toBe(200)
    const replayBody = await replay.json()
    // The exact stored response — no recompute, no re-mint, no re-review.
    expect(replayBody).toEqual(firstBody)
    expect(revlogCount() - before).toBe(2)

    // One coin row, one arena run row, keyed to the server-issued run id.
    const coinRows = M.db.db
      .select()
      .from(M.db.studyCoinLedger)
      .all()
      .filter((r) => r.referenceId === `arena:${runId}`)
    expect(coinRows.length).toBe(1)
  })

  it('rejects an altered grade log on a settled run (409, no double-mint)', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = gradeLog(queue, [0, 2], 3100)
    const first = await postSettlement(settlePayload(runId, exchanges))
    expect(first.status).toBe(200)
    const firstBody = await first.json()

    // Same run, same cards, different timings → an altered log.
    const altered = exchanges.map((e) => ({ ...e, timeMs: e.timeMs + 1 }))
    const res = await postSettlement(settlePayload(runId, altered))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/does not match/)

    const balance = M.db.getCoinBalance('default')
    expect(balance).toBe(firstBody.coinBalance)
  })

  it('rejects settlement while a fresh claim is in progress (409)', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const claim = M.db.claimArenaSettlement(runId, { userId: 'default' })
    expect(claim.kind).toBe('claimed')

    const res = await postSettlement(settlePayload(runId, gradeLog(queue, [0, 2], 4100)))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/in progress/)

    // Cleanup: release so the run does not wedge (fenced release).
    if (claim.kind === 'claimed') M.db.releaseArenaClaim(runId, claim.attempt)
    expect(M.db.getArenaSession(runId)!.status).toBe('open')
  })

  it('a stale in-progress claim can be reclaimed by a retry', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    // Simulate a crashed settler: claim stamped 10 minutes in the past.
    const staleClaim = M.db.claimArenaSettlement(runId, {
      userId: 'default',
      now: new Date(Date.now() - 10 * 60 * 1000),
    })
    expect(staleClaim.kind).toBe('claimed')

    const res = await postSettlement(settlePayload(runId, gradeLog(queue, [0, 2], 4300)))
    expect(res.status).toBe(200)
    expect(M.db.getArenaSession(runId)!.status).toBe('settled')
  })

  it('concurrent duplicate POSTs settle exactly once', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = gradeLog(queue, [0, 3], 4700)
    const before = revlogCount()

    const [a, b] = await Promise.all([
      postSettlement(settlePayload(runId, exchanges)),
      postSettlement(settlePayload(runId, exchanges)),
    ])
    const statuses = [a.status, b.status].sort()
    // One settles (200); the other either replays the stored response (200)
    // or observes the in-progress claim (409). Never two settlements.
    expect(statuses[0]).toBe(200)
    expect([200, 409]).toContain(statuses[1])

    expect(revlogCount() - before).toBe(3)
    const coinRows = M.db.db
      .select()
      .from(M.db.studyCoinLedger)
      .all()
      .filter((r) => r.referenceId === `arena:${runId}`)
    expect(coinRows.length).toBe(1)
    expect(M.db.getArenaSession(runId)!.status).toBe('settled')
  })

  it('a run owned by another owner context is missing, not settleable', async () => {
    const { deckId } = seedDeckWithCards(5)
    const { runId } = await startRun(deckId, 5)
    const claim = M.db.claimArenaSettlement(runId, { userId: 'someone-else' })
    expect(claim.kind).toBe('missing')
  })
})

describe('Arena API — weak-card drill (rematch)', () => {
  it('builds a drill queue from exactly the run’s weak cards', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    // Grade two cards weak (1 and 2), the rest Good.
    const exchanges = queue.slice(0, 4).map((cardId, i) => ({
      cardId,
      grade: [1, 2, 3, 4][i]!,
      confidence: 1,
      timeMs: 1000 + i * 500,
    }))
    const settle = await postSettlement(settlePayload(runId, exchanges))
    expect(settle.status).toBe(200)

    const res = await M.arena.GET(new Request(`http://localhost/api/arena?rematch=${runId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drill).toBe(true)
    expect(body.cards.map((c: { id: number }) => c.id).sort()).toEqual(
      [queue[0]!, queue[1]!].sort(),
    )
    // The drill issues its own server-owned run bound to the drill queue.
    expect(typeof body.runId).toBe('string')
    expect(body.runId).not.toBe(runId)
    const drillRun = M.db.getArenaSession(body.runId)!
    expect(drillRun.cardIds.slice().sort()).toEqual([queue[0]!, queue[1]!].sort())
    expect(drillRun.status).toBe('open')
  })

  it('a perfect run has no weak cards — drill reports empty', async () => {
    const { deckId } = seedDeckWithCards(5)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = queue.slice(0, 3).map((cardId, i) => ({
      cardId,
      grade: 4,
      confidence: 1,
      timeMs: 900 + i * 300,
    }))
    const settle = await postSettlement(settlePayload(runId, exchanges))
    expect(settle.status).toBe(200)

    const res = await M.arena.GET(new Request(`http://localhost/api/arena?rematch=${runId}`))
    const body = await res.json()
    expect(body.drillEmpty).toBe(true)
    expect(body.cards).toEqual([])
    expect(body.runId).toBeNull()
  })

  it('unknown or unsettled rematch runs are 404', async () => {
    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?rematch=${crypto.randomUUID()}`),
    )
    expect(res.status).toBe(404)

    // An open (never settled) run has no accepted grade log to drill from.
    const { deckId } = seedDeckWithCards(5)
    const { runId } = await startRun(deckId, 5)
    const res2 = await M.arena.GET(new Request(`http://localhost/api/arena?rematch=${runId}`))
    expect(res2.status).toBe(404)
  })
})

describe('Arena API — run detail (/api/arena/history/[id])', () => {
  it('returns the run with its accepted round-by-round grade log', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = queue.slice(0, 3).map((cardId, i) => ({
      cardId,
      grade: [3, 1, 4][i]!,
      confidence: i === 1 ? 0 : 1,
      timeMs: 1200 + i * 400,
    }))
    const settle = await postSettlement(settlePayload(runId, exchanges))
    expect(settle.status).toBe(200)

    // Find the run row id via the record book.
    const hist = await (
      await M.history.GET(new Request('http://localhost/api/arena/history'))
    ).json()
    const row = hist.runs.find((r: { referenceId: string }) => r.referenceId === `arena:${runId}`)
    expect(row).toBeDefined()

    const res = await M.historyId.GET(new Request(`http://localhost/api/arena/history/${row.id}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.run.id).toBe(row.id)
    expect(body.settledAt).toBeTruthy()
    // The accepted log, in order, exactly as validated at settlement.
    expect(body.rounds.length).toBe(3)
    expect(body.rounds.map((r: { cardId: number }) => r.cardId)).toEqual(
      exchanges.map((e) => e.cardId),
    )
    expect(body.rounds.map((r: { grade: number }) => r.grade)).toEqual([3, 1, 4])
    expect(body.rounds[0].round).toBe(1)
    // Card content resolves for still-existing cards.
    const contents = body.cards as Array<{
      id: number
      content: { basic?: { front: string } } | null
    }>
    expect(contents.length).toBe(3)
    for (const c of contents) {
      expect(c.content?.basic?.front).toMatch(/^Arena D/)
    }
  })

  it('a deleted card renders with null content, log intact', async () => {
    const { deckId, cardIds } = seedDeckWithCards(5)
    const { runId, queue } = await startRun(deckId, 5)
    const exchanges = queue.slice(0, 2).map((cardId, i) => ({
      cardId,
      grade: 3,
      confidence: 1,
      timeMs: 900 + i * 300,
    }))
    const settle = await postSettlement(settlePayload(runId, exchanges))
    expect(settle.status).toBe(200)

    const hist = await (
      await M.history.GET(new Request('http://localhost/api/arena/history'))
    ).json()
    const row = hist.runs.find((r: { referenceId: string }) => r.referenceId === `arena:${runId}`)

    // Delete one graded card (and its dependents) — history must survive.
    const victim = exchanges[0]!.cardId
    expect(cardIds).toContain(victim)
    M.db.db.delete(M.db.revlog).where(eq(M.db.revlog.cardId, victim)).run()
    M.db.db.delete(M.db.cards).where(eq(M.db.cards.id, victim)).run()

    const res = await M.historyId.GET(new Request(`http://localhost/api/arena/history/${row.id}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rounds.length).toBe(2)
    const victimEntry = (body.cards as Array<{ id: number; content: unknown }>).find(
      (c) => c.id === victim,
    )
    expect(victimEntry?.content).toBeNull()
  })

  it('400 on a non-numeric id, 404 on an unknown run', async () => {
    const bad = await M.historyId.GET(new Request('http://localhost/api/arena/history/abc'))
    expect(bad.status).toBe(400)
    const missing = await M.historyId.GET(new Request('http://localhost/api/arena/history/999999'))
    expect(missing.status).toBe(404)
  })
})

describe('Arena API — achievements', () => {
  it('arena_first unlocked exactly once across all settlements above', async () => {
    const achievementsRes = await import('../src/server/handlers/achievements/route').then((m) =>
      m.GET(new Request('http://localhost/api/achievements')),
    )
    const catalog = await achievementsRes.json()
    const badge = catalog.catalog.find((a: { key: string }) => a.key === 'arena_first')
    expect(badge.unlocked).toBe(true)
    expect(catalog.newlyUnlocked).not.toContain('arena_first') // already unlocked earlier
  })
})

describe('Arena API — run history (/api/arena/history)', () => {
  it('records one history row per settled run, never two on replay', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Settled runs above: canonical + lying-client + replay-first +
    // altered-first + stale-reclaim + concurrent + the two drill-test runs +
    // the two detail-test runs. 400/409 settlements and replays added none.
    expect(body.stats.runs).toBe(10)
    expect(body.runs.length).toBe(10)
  })

  it('lists runs newest-first keyed by the server-issued run id', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=2'))
    const body = await res.json()
    expect(body.runs.length).toBe(2)
    expect(body.runs[0].id).toBeGreaterThan(body.runs[1].id)
    expect(body.runs[0].referenceId).toMatch(/^arena:[0-9a-f-]{36}$/)
    expect(body.runs[0].deckIds.length).toBeGreaterThan(0)
    expect(['victory', 'defeat']).toContain(body.runs[0].result)
  })
})

describe('Arena API — daily modifier', () => {
  it('GET surfaces the daily modifier and issues a config tuned by it', async () => {
    const { deckId } = seedDeckWithCards(6)
    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=5`),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const expected = M.core.arenaModifierForDate(new Date().toISOString().slice(0, 10))
    expect(body.modifier.key).toBe(expected)
    expect(body.modifier.name.length).toBeGreaterThan(0)
    expect(body.modifier.description.length).toBeGreaterThan(0)
    const tuned = M.core.applyArenaModifier(
      expected,
      M.core.guardianConfig(body.guardian.archetype, M.core.ARENA_DEFAULTS),
    )
    expect(body.config.baseDamage).toBe(tuned.baseDamage)
    expect(body.config.critTimeMs).toBe(tuned.critTimeMs)
    expect(body.config.maxShield).toBe(tuned.maxShield)
  })

  it('settles under the modifier stored at issuance, never the day of settlement', async () => {
    const { deckId } = seedDeckWithCards(6)
    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=5`),
    )
    const body = await res.json()
    const runId: string = body.runId
    const today = M.core.arenaModifierForDate(new Date().toISOString().slice(0, 10))
    // Simulate a run issued under a different day's twist: the stored row
    // must be authoritative at settlement.
    const flipped = today === 'heavy_air' ? 'swift_strikes' : 'heavy_air'
    M.db.db
      .update(M.db.arenaSessions)
      .set({ modifier: flipped })
      .where(eq(M.db.arenaSessions.id, runId))
      .run()

    const queue: number[] = body.cards.map((c: { id: number }) => c.id)
    const log = gradeLog(queue, [0, Math.min(4, queue.length)])
    const post = await postSettlement(settlePayload(runId, log))
    expect(post.status).toBe(200)
    const settled = await post.json()
    const expected = M.core.summarizeGradeLog(
      strict(log),
      M.core.ARENA_DEFAULTS,
      body.guardian.archetype,
      flipped,
      undefined,
      queue.length,
    )
    expect(settled.summary.score).toBe(expected.score)
    expect(settled.summary.crits).toBe(expected.crits)
    expect(settled.summary.coins).toBe(expected.coins)
  })
})

describe('Arena API — per-deck record', () => {
  it('history returns per-deck aggregates enriched with deck names', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const post = await postSettlement(settlePayload(runId, gradeLog(queue, [0, queue.length])))
    expect(post.status).toBe(200)

    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.perDeck)).toBe(true)
    const row = body.perDeck.find((d: { deckId: number }) => d.deckId === deckId)
    expect(row).toBeTruthy()
    expect(row.runs).toBeGreaterThanOrEqual(1)
    expect(row.winRate).toBeGreaterThanOrEqual(0)
    expect(row.winRate).toBeLessThanOrEqual(1)
    expect(typeof row.name).toBe('string')
    expect(row.name.length).toBeGreaterThan(0)
    // Aggregate sanity: per-deck totals stay consistent with the run row.
    const runRow = body.runs.find(
      (r: { referenceId: string }) => r.referenceId === `arena:${runId}`,
    )
    expect(runRow).toBeTruthy()
    expect(row.bestScore).toBeGreaterThanOrEqual(runRow.score)
  })
})

describe('Arena API — expanded achievements', () => {
  it('a flawless 10-round victory unlocks arena_flawless exactly once', async () => {
    const { deckId } = seedDeckWithCards(12)
    const { runId, queue } = await startRun(deckId, 10)
    // Every card graded Good, confidently: correct == rounds and a win.
    const log = queue.map((cardId, i) => ({
      cardId,
      grade: 3,
      confidence: 1,
      timeMs: 2500 + i * 500,
    }))
    const post = await postSettlement(settlePayload(runId, log))
    expect(post.status).toBe(200)
    const settled = await post.json()
    expect(settled.summary.result).toBe('victory')
    expect(settled.summary.correct).toBe(settled.summary.rounds)
    expect(settled.achievements).toContain('arena_flawless')

    // And it is recorded in the catalog with a timestamp.
    const { getAchievementStats, listAchievements } = M.db as unknown as {
      getAchievementStats: () => { arenaFlawlessWins: number; arenaTotalCrits: number }
      listAchievements: () => Array<{ key: string; unlockedAt: string | null }>
    }
    const stats = getAchievementStats()
    expect(stats.arenaFlawlessWins).toBeGreaterThanOrEqual(1)
    const row = listAchievements().find((a) => a.key === 'arena_flawless')
    expect(row).toBeTruthy()
    expect(row!.unlockedAt).not.toBeNull()
  })
})

describe('Arena API — accuracy trend and insight', () => {
  it('history returns an oldest-to-newest trend and a structured insight', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.trend)).toBe(true)
    expect(body.trend.length).toBeGreaterThan(0)
    expect(body.trend.length).toBeLessThanOrEqual(10)
    for (const point of body.trend) {
      expect(typeof point.runId).toBe('string')
      expect(point.accuracy).toBeGreaterThanOrEqual(0)
      expect(point.accuracy).toBeLessThanOrEqual(1)
      expect(['victory', 'defeat']).toContain(point.result)
    }
    // Oldest first: createdAt never decreases along the series.
    const stamps = body.trend.map((p: { createdAt: string }) => Date.parse(p.createdAt))
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]!).toBeGreaterThanOrEqual(stamps[i - 1]!)
    }
    expect(body.insight).toBeTruthy()
    if (body.insight.direction !== null) {
      expect(['up', 'down', 'flat']).toContain(body.insight.direction)
      expect(body.insight.deltaPercent).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('Arena API — card-format flavor at settlement', () => {
  it('recomputes the summary with the queue cards’ real formats', async () => {
    // A deck of cloze + typein cards: flavor nudges must flow into the
    // server-side recompute from the queue snapshot, not the client.
    deckSeq += 1
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const [deck] = M.db.db
      .insert(M.db.decks)
      .values({ name: `Flavor Deck ${deckSeq}`, description: 'format flavor harness' })
      .returning()
      .all()
    const cardIds: number[] = []
    for (let i = 0; i < 6; i++) {
      const [card] = M.db.db
        .insert(M.db.cards)
        .values({
          deckId: deck!.id,
          type: i % 2 === 0 ? 'cloze' : 'typein',
          content: { basic: { front: `Flavor D${deckSeq} Q${i + 1}`, back: `A${i + 1}` } },
          due: past,
        })
        .returning()
        .all()
      cardIds.push(card!.id)
    }

    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deck!.id}&limit=5`),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const queue: number[] = body.cards.map((c: { id: number }) => c.id)
    // Fast, confident Good answers: crits (cloze +2) and typein +1 both fire.
    const log = queue.map((cardId, i) => ({
      cardId,
      grade: 3,
      confidence: 1,
      timeMs: 900 + i * 100,
    }))
    const post = await postSettlement(settlePayload(body.runId as string, log))
    expect(post.status).toBe(200)
    const settled = await post.json()

    const formatByCard = new Map(
      body.cards.map((c: { id: number; type: string }): [number, string] => [c.id, c.type]),
    )
    const expected = M.core.summarizeGradeLog(
      strict(log),
      M.core.ARENA_DEFAULTS,
      body.guardian.archetype,
      body.modifier.key,
      (id) => formatByCard.get(id) as string | undefined,
    )
    expect(settled.summary.score).toBe(expected.score)
    // And it really is the flavored score, not the plain one.
    const plain = M.core.summarizeGradeLog(
      strict(log),
      M.core.ARENA_DEFAULTS,
      body.guardian.archetype,
      body.modifier.key,
    )
    expect(settled.summary.score).not.toBe(plain.score)
  })
})

describe('Arena API — rival ghost (best-run pace)', () => {
  it('history names the highest-scoring run as the rival ghost', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.bestRunId === 'number' || body.bestRunId === null).toBe(true)
    if (body.bestRunId !== null) {
      const best = body.runs.find((r: { id: number }) => r.id === body.bestRunId)
      // The ghost may fall outside the ?limit=5 page; verify via detail.
      const detail = await M.historyId.GET(
        new Request(`http://localhost/api/arena/history/${body.bestRunId}`),
      )
      expect(detail.status).toBe(200)
      const detailBody = await detail.json()
      expect(detailBody.run.id).toBe(body.bestRunId)
      expect(best === undefined || best.score <= detailBody.run.score).toBe(true)
    }
  })

  it('run detail replays a cumulative score series matching prefix summaries', async () => {
    const { deckId } = seedDeckWithCards(8)
    const { runId, queue } = await startRun(deckId, 6)
    const log = gradeLog(queue, [0, queue.length])
    const post = await postSettlement(settlePayload(runId, log))
    expect(post.status).toBe(200)
    const settled = await post.json()

    const hist = await M.history.GET(new Request('http://localhost/api/arena/history?limit=50'))
    const histBody = await hist.json()
    const row = histBody.runs.find(
      (r: { referenceId: string }) => r.referenceId === `arena:${runId}`,
    )
    expect(row).toBeTruthy()

    const detail = await M.historyId.GET(
      new Request(`http://localhost/api/arena/history/${row.id}`),
    )
    expect(detail.status).toBe(200)
    const body = await detail.json()
    expect(Array.isArray(body.scoreSeries)).toBe(true)
    expect(body.scoreSeries.length).toBe(settled.summary.rounds)
    // The series is non-decreasing and ends at the settled score.
    for (let i = 1; i < body.scoreSeries.length; i++) {
      expect(body.scoreSeries[i]!).toBeGreaterThanOrEqual(body.scoreSeries[i - 1]!)
    }
    expect(body.scoreSeries[body.scoreSeries.length - 1]).toBe(settled.summary.score)
  })
})

describe('Arena API — drill improvement tracking', () => {
  it('a drill settlement reports per-card improvement against the source run', async () => {
    const { deckId } = seedDeckWithCards(8)
    const { runId, queue } = await startRun(deckId, 6)
    // Struggle on the first three cards (Again), clean on the rest.
    const log = queue.map((cardId, i) => ({
      cardId,
      grade: i < 3 ? 1 : 3,
      confidence: 0,
      timeMs: 3000 + i * 500,
    }))
    const post = await postSettlement(settlePayload(runId, log))
    expect(post.status).toBe(200)
    const settled = await post.json()
    expect(settled.drill ?? null).toBeNull() // not itself a drill

    // Drill the weak cards and do better on two of them.
    const drillRes = await M.arena.GET(new Request(`http://localhost/api/arena?rematch=${runId}`))
    expect(drillRes.status).toBe(200)
    const drillBody = await drillRes.json()
    expect(drillBody.drill).toBe(true)
    expect(drillBody.cards.length).toBe(3)
    const drillQueue: number[] = drillBody.cards.map((c: { id: number }) => c.id)
    const drillLog = drillQueue.map((cardId, i) => ({
      cardId,
      grade: i < 2 ? 3 : 1, // two improve, one still struggles
      confidence: 1,
      timeMs: 2500 + i * 400,
    }))
    const drillPost = await postSettlement(settlePayload(drillBody.runId as string, drillLog))
    expect(drillPost.status).toBe(200)
    const drillSettled = await drillPost.json()
    expect(drillSettled.drill).toBeTruthy()
    expect(drillSettled.drill.sourceRunId).toBe(runId)
    expect(drillSettled.drill.compared).toBe(3)
    expect(drillSettled.drill.improved).toBe(2)
    expect(drillSettled.drill.steady).toBe(1)
    expect(drillSettled.drill.slipped).toBe(0)
  })

  it('a non-drill settlement carries no drill report', async () => {
    const { deckId } = seedDeckWithCards(6)
    const { runId, queue } = await startRun(deckId, 5)
    const post = await postSettlement(settlePayload(runId, gradeLog(queue, [0, queue.length])))
    expect(post.status).toBe(200)
    const settled = await post.json()
    expect(settled.drill ?? null).toBeNull()
  })
})

describe('Arena API — guardian bestiary', () => {
  it('history returns per-guardian records consistent with the run rows', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.perGuardian)).toBe(true)
    // The suite has settled runs across all three rotating guardians.
    expect(body.perGuardian.length).toBeGreaterThanOrEqual(1)
    let totalRuns = 0
    for (const g of body.perGuardian) {
      expect(['warden', 'colossus', 'shade']).toContain(g.archetype)
      expect(g.runs).toBeGreaterThan(0)
      expect(g.winRate).toBeGreaterThanOrEqual(0)
      expect(g.winRate).toBeLessThanOrEqual(1)
      expect(g.bestScore).toBeGreaterThanOrEqual(0)
      totalRuns += g.runs
    }
    expect(totalRuns).toBe(body.stats.runs)
  })
})

describe('Arena API — weekly trial', () => {
  it('history returns this week’s trial with bounded progress', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const t = body.trial
    expect(t.weekKey).toMatch(/^\d{4}-W\d{2}$/)
    expect(['three_wins', 'boss_win', 'combo_12']).toContain(t.key)
    expect(t.target).toBeGreaterThan(0)
    expect(t.progress).toBeGreaterThanOrEqual(0)
    expect(t.progress).toBeLessThanOrEqual(t.target)
    expect(t.done).toBe(t.progress >= t.target)
  })
})

describe('Arena API — nemesis cards', () => {
  it('ranks missed cards from settled logs and resolves their fronts', async () => {
    const { deckId } = seedDeckWithCards(5)
    // Settled sessions are seeded directly (a real settlement reschedules the
    // cards, so the same cards would not be dealt twice); the handler under
    // test reads only the persisted accepted logs.
    const { queue } = await startRun(deckId, 5)
    const cardId = queue[0]!
    for (let i = 0; i < 3; i++) {
      M.db.db
        .insert(M.db.arenaSessions)
        .values({
          id: crypto.randomUUID(),
          deckIds: [deckId],
          cardIds: [cardId],
          status: 'settled',
          gradeLog: [{ cardId, grade: 1, confidence: 1, timeMs: 3000 }],
          settledAt: new Date(Date.now() + i).toISOString(),
        })
        .run()
    }
    const res = await M.nemesis.GET(new Request('http://localhost/api/arena/nemesis?limit=3'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sampledRuns).toBeGreaterThan(0)
    expect(body.cardsSeen).toBeGreaterThan(0)
    expect(body.nemeses.length).toBeGreaterThan(0)
    expect(body.nemeses.length).toBeLessThanOrEqual(3)
    expect(body.nemeses[0].cardId).toBe(cardId)
    expect(body.nemeses[0].attempts).toBeGreaterThanOrEqual(3)
    expect(body.nemeses[0].front).toMatch(/^Arena D/)
    const scores = body.nemeses.map((n: { nemesisScore: number }) => n.nemesisScore)
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores)
    for (const n of body.nemeses) {
      expect(n.attempts).toBeGreaterThanOrEqual(2)
      expect(typeof n.front).toBe('string')
      expect(n.misses).toBeLessThanOrEqual(n.attempts)
    }
    const t = body.tiers
    expect(t.new + t.shaky + t.learning + t.steady + t.mastered).toBe(body.cardsSeen)
  })

  it('clamps the limit parameter', async () => {
    const res = await M.nemesis.GET(new Request('http://localhost/api/arena/nemesis?limit=9999'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nemeses.length).toBeLessThanOrEqual(20)
  })
})

describe('Arena API — record-book export', () => {
  it('serves CSV by default with an attachment header and one row per run', async () => {
    const res = await M.exportRoute.GET(new Request('http://localhost/api/arena/export'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="arena-record-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    const text = await res.text()
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toBe(
      'run_id,played_at,result,guardian,boss,rounds,correct,accuracy_pct,best_combo,crits,score,coins,xp,duration_s,deck_ids',
    )
    const hist = await (
      await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    ).json()
    expect(lines.length - 1).toBe(hist.stats.runs)
  })

  it('serves versioned JSON flagged self-reported, totals matching the rows', async () => {
    const res = await M.exportRoute.GET(
      new Request('http://localhost/api/arena/export?format=json'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const doc = await res.json()
    expect(doc.version).toBe(1)
    expect(doc.selfReported).toBe(true)
    expect(doc.runCount).toBe(doc.runs.length)
    expect(doc.totals.victories + doc.totals.defeats).toBe(doc.runCount)
    const ids = doc.runs.map((r: { id: number }) => r.id)
    expect([...ids].sort((a: number, b: number) => a - b)).toEqual(ids)
  })

  it('rejects an unknown format', async () => {
    const res = await M.exportRoute.GET(new Request('http://localhost/api/arena/export?format=xml'))
    expect(res.status).toBe(400)
  })
})

describe('Arena API — nemesis drill', () => {
  it('deals the cards the settled logs keep missing, with no drill lineage', async () => {
    const { deckId } = seedDeckWithCards(4)
    const { queue } = await startRun(deckId, 4)
    const cardId = queue[0]!
    for (let i = 0; i < 4; i++) {
      M.db.db
        .insert(M.db.arenaSessions)
        .values({
          id: crypto.randomUUID(),
          deckIds: [deckId],
          cardIds: [cardId],
          status: 'settled',
          gradeLog: [{ cardId, grade: 1, confidence: 1, timeMs: 2000 }],
          settledAt: new Date(Date.now() + 1000 + i).toISOString(),
        })
        .run()
    }
    const res = await M.arena.GET(new Request('http://localhost/api/arena?nemesis=1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.drill).toBe(true)
    expect(typeof body.runId).toBe('string')
    expect(body.cards.map((c: { id: number }) => c.id)).toContain(cardId)
    expect(body.cards.length).toBeLessThanOrEqual(M.core.NEMESIS_DRILL_SIZE)
    const session = M.db.getArenaSession(body.runId as string)
    expect(session?.drillOfRunId ?? null).toBeNull()
    expect(session?.cardIds).toContain(cardId)
  })

  it('a nemesis drill settles like any run and reports no drill comparison', async () => {
    const res = await M.arena.GET(new Request('http://localhost/api/arena?nemesis=1'))
    const body = await res.json()
    const log = body.cards.slice(0, 2).map((c: { id: number }) => ({
      cardId: c.id,
      grade: 3,
      confidence: 0,
      timeMs: 3000,
    }))
    const post = await postSettlement(settlePayload(body.runId as string, log))
    expect(post.status).toBe(200)
    const settled = await post.json()
    expect(settled.drill ?? null).toBeNull()
  })
})

describe('Arena API — practice progression', () => {
  it('returns a rank and a heatmap consistent with the run rows', async () => {
    const res = await M.progress.GET(new Request('http://localhost/api/arena/progress'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scope).toBe('local-practice')
    expect(body.rank.points).toBeGreaterThanOrEqual(0)
    expect(body.rank.progressPct).toBeGreaterThanOrEqual(0)
    expect(body.rank.progressPct).toBeLessThanOrEqual(100)
    expect(body.heatmap.days).toHaveLength(84)
    expect(body.pace.sampleRuns).toBeGreaterThanOrEqual(0)
    expect(body.bests.longestWinStreak).toBeGreaterThanOrEqual(0)
    if (body.bests.bestScore) expect(body.bests.bestScore.value).toBeGreaterThanOrEqual(0)
    if (body.pace.medianMsPerCard !== null) expect(body.pace.medianMsPerCard).toBeGreaterThan(0)
    const hist = await (
      await M.history.GET(new Request('http://localhost/api/arena/history?limit=5'))
    ).json()
    // Every run in the suite happened today, so the window holds all of them.
    expect(body.heatmap.totalRuns).toBe(hist.stats.runs)
    expect(body.heatmap.days[83].date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('honors the days parameter and rejects out-of-range values', async () => {
    const ok = await M.progress.GET(new Request('http://localhost/api/arena/progress?days=30'))
    expect((await ok.json()).heatmap.days).toHaveLength(30)
    const bad = await M.progress.GET(new Request('http://localhost/api/arena/progress?days=3'))
    expect(bad.status).toBe(400)
    const worse = await M.progress.GET(new Request('http://localhost/api/arena/progress?days=999'))
    expect(worse.status).toBe(400)
  })
})

describe('Arena API — card timeline', () => {
  it('returns the attempt timeline for a card seen in settled runs', async () => {
    const { deckId } = seedDeckWithCards(3)
    const { queue } = await startRun(deckId, 3)
    const cardId = queue[0]!
    const grades = [1, 2, 3, 4, 3]
    grades.forEach((grade, i) => {
      M.db.db
        .insert(M.db.arenaSessions)
        .values({
          id: crypto.randomUUID(),
          deckIds: [deckId],
          cardIds: [cardId],
          status: 'settled',
          gradeLog: [{ cardId, grade, confidence: grade <= 2 ? 1 : 0, timeMs: 5000 - i * 800 }],
          settledAt: new Date(Date.now() + 5000 + i).toISOString(),
        })
        .run()
    })
    const res = await M.cardRoute.GET(new Request(`http://localhost/api/arena/card/${cardId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cardId).toBe(cardId)
    expect(body.front).toMatch(/^Arena D/)
    expect(body.attempts.length).toBeGreaterThanOrEqual(5)
    const mine = body.attempts.slice(-5)
    expect(mine.map((a: { grade: number }) => a.grade)).toEqual(grades)
    expect(mine[0].overconfident).toBe(true)
    expect(body.stats.attempts).toBe(body.attempts.length)
    expect(body.fastestMs).toBeLessThanOrEqual(body.slowestMs)
    expect(body.bestCorrectStreak).toBeGreaterThanOrEqual(3)
  })

  it('404s for a card with no arena history and 400s for a bad id', async () => {
    const missing = await M.cardRoute.GET(new Request('http://localhost/api/arena/card/99999999'))
    expect(missing.status).toBe(404)
    const bad = await M.cardRoute.GET(new Request('http://localhost/api/arena/card/abc'))
    expect(bad.status).toBe(400)
  })
})
