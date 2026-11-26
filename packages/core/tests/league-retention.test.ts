import { describe, expect, it } from 'vitest'
import {
  COMPLETED_DUEL_RETENTION_MS,
  EXPIRED_DUEL_GRACE_MS,
  MAX_DUELS,
  pruneDuels,
  type DuelRuntime,
} from '../src/leagues'

const NOW = Date.parse('2026-03-20T10:00:00.000Z')
const HOUR = 60 * 60_000

function duel(
  id: string,
  over: Partial<DuelRuntime> & { openedAgoMs?: number; expiresInMs?: number } = {},
): DuelRuntime {
  const { openedAgoMs = HOUR, expiresInMs = 23 * HOUR, ...rest } = over
  return {
    id,
    playerA: 'usr_a',
    playerB: 'usr_b',
    prompts: [{ id: 'p1', question: 'q', answers: ['x'] }],
    openedAt: NOW - openedAgoMs,
    expiresAt: NOW + expiresInMs,
    sideA: null,
    sideB: null,
    answersA: [],
    answersB: [],
    status: 'open',
    result: null,
    ...rest,
  }
}

const done = (id: string, openedAgoMs: number): DuelRuntime =>
  duel(id, {
    openedAgoMs,
    expiresInMs: -openedAgoMs,
    status: 'complete',
    result: { winner: 'usr_a', loser: 'usr_b', draw: false, correctA: 1, correctB: 0 },
  })

const table = (...ds: DuelRuntime[]) => Object.fromEntries(ds.map((d) => [d.id, d]))

describe('pruneDuels', () => {
  it('returns the same object when nothing is stale', () => {
    const t = table(duel('live'), done('fresh', HOUR))
    const r = pruneDuels(t, NOW)
    expect(r.duels).toBe(t)
    expect(r.dropped).toEqual([])
  })

  it('drops completed duels past retention and keeps younger ones', () => {
    const t = table(
      done('old', COMPLETED_DUEL_RETENTION_MS + 1),
      done('edge', COMPLETED_DUEL_RETENTION_MS - 1),
    )
    const r = pruneDuels(t, NOW)
    expect(r.dropped).toEqual(['old'])
    expect(Object.keys(r.duels)).toEqual(['edge'])
  })

  it('retention boundary is inclusive of the drop: exactly at the limit is dropped', () => {
    const r = pruneDuels(table(done('exact', COMPLETED_DUEL_RETENTION_MS)), NOW)
    expect(r.dropped).toEqual(['exact'])
  })

  it('keeps an expired open duel through the grace window, then drops it', () => {
    const justExpired = duel('just', { expiresInMs: -HOUR })
    const longGone = duel('gone', { expiresInMs: -(EXPIRED_DUEL_GRACE_MS + 1) })
    const r = pruneDuels(table(justExpired, longGone), NOW)
    expect(r.dropped).toEqual(['gone'])
    expect(r.duels.just).toBeDefined()
  })

  it('never touches a live open duel, however old it is', () => {
    const r = pruneDuels(table(duel('live', { openedAgoMs: 30 * 24 * HOUR })), NOW)
    expect(r.dropped).toEqual([])
  })

  it('enforces the cap: oldest completed first, then expired, live duels immune', () => {
    const live = Array.from({ length: 3 }, (_, i) => duel(`live${i}`))
    const expired = duel('expired', { openedAgoMs: 40 * HOUR, expiresInMs: -2 * HOUR })
    const completed = [done('c-old', 3 * 24 * HOUR), done('c-new', 1 * HOUR)]
    const r = pruneDuels(table(...live, expired, ...completed), NOW, 4)
    // 6 kept before the cap, limit 4: drop two. Completed go before expired-open.
    expect(r.dropped.sort()).toEqual(['c-new', 'c-old'])
    expect(Object.keys(r.duels).sort()).toEqual(['expired', 'live0', 'live1', 'live2'])
  })

  it('the cap cannot drop live duels even when over the limit', () => {
    const live = Array.from({ length: 6 }, (_, i) => duel(`live${i}`))
    const r = pruneDuels(table(...live), NOW, 2)
    expect(r.dropped).toEqual([])
    expect(Object.keys(r.duels)).toHaveLength(6)
  })

  it('cap ordering is deterministic for equal ages', () => {
    const a = done('b-id', 2 * HOUR)
    const b = done('a-id', 2 * HOUR)
    const r1 = pruneDuels(table(a, b), NOW, 1)
    const r2 = pruneDuels(table(b, a), NOW, 1)
    expect(r1.dropped).toEqual(r2.dropped)
    expect(r1.dropped).toEqual(['a-id'])
  })

  it('does not mutate its input', () => {
    const t = table(done('old', COMPLETED_DUEL_RETENTION_MS + 5), duel('live'))
    const before = JSON.stringify(t)
    pruneDuels(t, NOW)
    expect(JSON.stringify(t)).toBe(before)
  })

  it('default cap is a fixed bound', () => {
    expect(MAX_DUELS).toBe(400)
    const many = table(...Array.from({ length: MAX_DUELS + 10 }, (_, i) => done(`d${i}`, HOUR + i)))
    const r = pruneDuels(many, NOW)
    expect(Object.keys(r.duels)).toHaveLength(MAX_DUELS)
    expect(r.dropped).toHaveLength(10)
    // The ten oldest (largest openedAgo) are the ones that went.
    expect(r.dropped.every((id) => Number(id.slice(1)) >= MAX_DUELS)).toBe(true)
  })
})
