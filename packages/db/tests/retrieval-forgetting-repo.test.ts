import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cards,
  decks,
  RIF_MAX_DISMISSED,
  RifLimitError,
  dismissRifCard,
  initDb,
  listRifAudits,
  listRifDismissed,
  planBalancedSession,
  restoreRifCard,
  revlog,
  revlogUndos,
  rifAudits,
  rifDismissals,
  runRifAudit,
  saveRifAudit,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const NOW = new Date('2026-11-20T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-rif-')), 'rif.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(rifDismissals).run()
  db.delete(rifAudits).run()
  db.delete(revlogUndos).run()
  db.delete(revlog).run()
  db.delete(cards).run()
  db.delete(decks).run()
  db.insert(decks).values({ id: 1, name: 'Fruit' }).run()
  db.insert(decks).values({ id: 2, name: 'Other' }).run()
})

function addCard(id: number, front: string, back: string, deckId = 1, extra: object = {}) {
  db.insert(cards)
    .values({
      id,
      deckId,
      type: 'basic',
      content: { basic: { front, back } },
      due: daysAgo(-1),
      stability: 3,
      lastReview: daysAgo(10),
      state: 2,
      ...extra,
    })
    .run()
}
let rid = 1_700_000_000_000
function addReview(cardId: number, rating: number, d: number) {
  db.insert(revlog)
    .values({
      id: rid++,
      cardId,
      rating,
      state: 2,
      elapsedDays: 1,
      scheduledDays: 2,
      timeMs: 4000,
      reviewedAt: daysAgo(d),
    })
    .run()
}

function seedFruit() {
  addCard(1, 'Fruit that is red and grows on trees', 'apple')
  addCard(2, 'Fruit that is yellow and grows on trees', 'banana')
  addCard(3, 'Fruit that is orange and grows on trees', 'tangerine')
  for (const d of [1, 2, 3, 4, 5]) {
    addReview(1, 3, d)
    addReview(2, 4, d)
  }
}

describe('retrieval forgetting repo', () => {
  it('finds the neglected sibling from real cards and reviews', () => {
    seedFruit()
    const { audit, rescue, report } = runRifAudit({ now: NOW })
    expect(audit.clusters).toHaveLength(1)
    expect(rescue[0]!.cardId).toBe(3)
    expect(report.headline).toMatch(/card/)
  })
  it('skips suspended cards and unsupported formats, and respects the deck filter', () => {
    seedFruit()
    db.insert(cards)
      .values({
        id: 50,
        deckId: 1,
        type: 'occlusion',
        content: { occlusion: { imageId: 1, rects: [] } },
        due: daysAgo(-1),
      })
      .run()
    addCard(51, 'Fruit that is green and grows on trees', 'lime', 1, { suspended: true })
    addCard(60, 'Fruit that is purple and grows on vines', 'grape', 2)
    const all = runRifAudit({ now: NOW }).audit
    expect(all.clusters.flatMap((c) => c.members).map((m) => m.cardId)).not.toContain(51)
    expect(runRifAudit({ now: NOW, deckId: 2 }).audit.clusters).toEqual([])
  })
  it('ignores undone reviews', () => {
    seedFruit()
    const before = runRifAudit({ now: NOW }).audit.atRisk + runRifAudit({ now: NOW }).audit.watch
    const all = db.select().from(revlog).all()
    for (const r of all) db.insert(revlogUndos).values({ revlogId: r.id, cardId: r.cardId }).run()
    const after = runRifAudit({ now: NOW }).audit
    expect(before).toBeGreaterThan(0)
    expect(after.atRisk + after.watch).toBe(0)
  })
  it('stores audit summaries newest first', () => {
    seedFruit()
    const first = runRifAudit({ now: NOW }).audit
    const id1 = saveRifAudit(first, null)
    const id2 = saveRifAudit({ ...first, asOf: daysAgo(-1) }, 1)
    const rows = listRifAudits(5)
    expect(rows.map((r) => r.id)).toEqual([id2, id1])
    expect(rows[1]!.top.length).toBeGreaterThan(0)
    expect(rows[0]!.deckId).toBe(1)
  })
  it('dismisses and restores cards, idempotently, and dismissed cards leave the rescue queue', () => {
    seedFruit()
    expect(dismissRifCard(999)).toBe(false)
    expect(dismissRifCard(3, 'on purpose')).toBe(true)
    expect(dismissRifCard(3)).toBe(true)
    expect(listRifDismissed()).toEqual([3])
    expect(runRifAudit({ now: NOW }).rescue.some((r) => r.cardId === 3)).toBe(false)
    expect(restoreRifCard(3)).toBe(true)
    expect(restoreRifCard(3)).toBe(false)
    expect(runRifAudit({ now: NOW }).rescue.some((r) => r.cardId === 3)).toBe(true)
  })
  it('keeps one saved audit per deck per hour and never deletes history', () => {
    seedFruit()
    const audit = runRifAudit({ now: NOW }).audit
    const id = saveRifAudit(audit, null)
    expect(
      saveRifAudit({ ...audit, asOf: new Date(NOW.getTime() + 600_000).toISOString() }, null),
    ).toBe(id)
    expect(listRifAudits(10)).toHaveLength(1)
    const next = saveRifAudit(
      { ...audit, asOf: new Date(NOW.getTime() + 3_700_000).toISOString() },
      null,
    )
    expect(next).not.toBe(id)
    expect(saveRifAudit({ ...audit, asOf: audit.asOf }, 1)).not.toBe(id)
    expect(listRifAudits(10)).toHaveLength(3)
    expect(listRifAudits(1)).toHaveLength(1)
  })
  it('caps dismissals', () => {
    for (let i = 1; i <= RIF_MAX_DISMISSED; i++) {
      addCard(i, `Cue ${i} unique`, `answer ${i}`)
      dismissRifCard(i)
    }
    addCard(RIF_MAX_DISMISSED + 1, 'one more cue', 'one more answer')
    expect(() => dismissRifCard(RIF_MAX_DISMISSED + 1)).toThrow(RifLimitError)
    expect(dismissRifCard(5)).toBe(true)
  })
  it('restoring keeps the row inactive and dismissing again reactivates it', () => {
    seedFruit()
    dismissRifCard(3, 'a')
    expect(restoreRifCard(3)).toBe(true)
    const row = db.select().from(rifDismissals).all()
    expect(row).toHaveLength(1)
    expect(row[0]!.active).toBe(false)
    expect(listRifDismissed()).toEqual([])
    dismissRifCard(3, 'b')
    expect(listRifDismissed()).toEqual([3])
    expect(db.select().from(rifDismissals).all()).toHaveLength(1)
  })
  it('orders the card scan by id so a truncated scan is stable', () => {
    for (let i = 1600; i >= 1; i--) addCard(i, `Unique cue number ${i} zeta`, `ans${i}`)
    const { audit } = runRifAudit({ now: NOW })
    expect(audit.truncatedScope).toBe(true)
    expect(audit.scanned).toBe(1500)
  })
  it('dismissing twice keeps one row and keeps the first reason', () => {
    seedFruit()
    dismissRifCard(3, 'first')
    dismissRifCard(3, 'second')
    const rows = db.select().from(rifDismissals).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.reason).toBe('first')
  })
  it('removes dismissals when the card is deleted', () => {
    seedFruit()
    dismissRifCard(3)
    db.delete(cards).where(eqId(3)).run()
    expect(listRifDismissed()).toEqual([])
  })
  it('plans a balanced session that adds suppressed siblings', () => {
    seedFruit()
    const plan = planBalancedSession([1], { now: NOW, budget: 2 })
    expect(plan.added.map((a) => a.cardId)).toContain(3)
    expect(plan.ids[0]).toBe(1)
    expect(new Set(plan.ids).size).toBe(plan.ids.length)
  })
})

import { eq } from 'drizzle-orm'
function eqId(id: number) {
  return eq(cards.id, id)
}
