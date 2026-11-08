import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addSeasonXp,
  claimSeasonReward,
  contributeGuildXp,
  createGuild,
  getGuild,
  getMyGuildMembership,
  getSeasonalProgress,
  guildMembers,
  guilds,
  initDb,
  joinGuild,
  listGuildMembers,
  listGuilds,
  listRecentDuels,
  recordDuelResult,
  reviewDuels,
  seasonalProgress,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-guilds-'))
  db = await initDb({ path: join(tmp, 'guilds.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(guildMembers).run()
  db.delete(guilds).run()
  db.delete(seasonalProgress).run()
  db.delete(reviewDuels).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('guilds', () => {
  it('creates a guild with an upper-cased tag and its creator as leader', () => {
    const g = createGuild({ name: 'Curie', tag: 'cur', leaderAlias: 'Marie' })
    expect(g).toMatchObject({ tag: 'CUR', totalXp: 0, level: 1 })
    expect(getMyGuildMembership('Marie')).toMatchObject({ guildId: g.id, role: 'leader' })
    expect(getGuild(g.id)?.name).toBe('Curie')
    expect(getGuild(99_999)).toBeNull()
    expect(getGuild(Number.NaN)).toBeNull()
  })

  it('re-joining your own guild never demotes the leader', () => {
    const g = createGuild({ name: 'A', tag: 'AA', leaderAlias: 'Lead' })
    expect(joinGuild(g.id, 'Lead')).toBe(true)
    expect(getMyGuildMembership('Lead')?.role).toBe('leader')
  })

  it('joins, moves between guilds (one membership), and rejects missing guilds', () => {
    const a = createGuild({ name: 'A', tag: 'AA', leaderAlias: 'LeadA' })
    const b = createGuild({ name: 'B', tag: 'BB', leaderAlias: 'LeadB' })
    expect(joinGuild(a.id, 'Ann')).toBe(true)
    contributeGuildXp(a.id, 'Ann', 10)
    expect(joinGuild(b.id, 'Ann')).toBe(true)
    const m = getMyGuildMembership('Ann')!
    expect(m).toMatchObject({ guildId: b.id, role: 'member', xpContributed: 0 })
    expect(
      db
        .select()
        .from(guildMembers)
        .all()
        .filter((r) => r.alias === 'Ann'),
    ).toHaveLength(1)
    expect(joinGuild(99_999, 'Ann')).toBe(false)
    expect(getMyGuildMembership('Ann')?.guildId).toBe(b.id)
  })

  it('pools XP atomically, levels up, and ranks members', () => {
    const g = createGuild({ name: 'G', tag: 'GG', leaderAlias: 'Lead' })
    joinGuild(g.id, 'Bob')
    expect(contributeGuildXp(g.id, 'Lead', 100)).toBe(true)
    expect(contributeGuildXp(g.id, 'Bob', 1500)).toBe(true)
    const after = getGuild(g.id)!
    expect(after.totalXp).toBe(1600)
    expect(after.level).toBeGreaterThan(1)
    expect(listGuildMembers(g.id).map((m) => m.alias)).toEqual(['Bob', 'Lead'])
  })

  it('refuses contributions from non-members and non-positive amounts', () => {
    const a = createGuild({ name: 'A', tag: 'AA', leaderAlias: 'LeadA' })
    const b = createGuild({ name: 'B', tag: 'BB', leaderAlias: 'LeadB' })
    expect(contributeGuildXp(a.id, 'LeadB', 500)).toBe(false) // member of B, not A
    expect(contributeGuildXp(a.id, 'Nobody', 500)).toBe(false)
    expect(contributeGuildXp(a.id, 'LeadA', 0)).toBe(false)
    expect(contributeGuildXp(a.id, 'LeadA', -50)).toBe(false)
    expect(contributeGuildXp(a.id, 'LeadA', 0.5)).toBe(false)
    expect(getGuild(a.id)!.totalXp).toBe(0)
    expect(getGuild(b.id)!.totalXp).toBe(0)
    expect(getMyGuildMembership('LeadB')!.xpContributed).toBe(0)
  })

  it('lists guilds by total XP', () => {
    const a = createGuild({ name: 'A', tag: 'AA', leaderAlias: 'LA' })
    const b = createGuild({ name: 'B', tag: 'BB', leaderAlias: 'LB' })
    contributeGuildXp(b.id, 'LB', 50)
    expect(listGuilds().map((g) => g.id)).toEqual([b.id, a.id])
    expect(listGuilds(1)).toHaveLength(1)
  })
})

describe('seasonal pass', () => {
  it('creates progress lazily and accrues XP into tiers', () => {
    expect(getSeasonalProgress('s')).toMatchObject({ seasonXp: 0, tier: 0 })
    const p = addSeasonXp(10_000, 's')
    expect(p.seasonXp).toBe(10_000)
    expect(p.tier).toBeGreaterThan(0)
    expect(addSeasonXp(-5, 's').seasonXp).toBe(10_000)
    expect(addSeasonXp(Number.NaN, 's').seasonXp).toBe(10_000)
  })

  it('claims reached tiers once and rejects out-of-range tiers', () => {
    const { tier } = addSeasonXp(10_000, 's')
    expect(claimSeasonReward(1, 's')).toBe(true)
    expect(claimSeasonReward(1, 's')).toBe(true) // idempotent
    expect(getSeasonalProgress('s').claimedRewards).toEqual([1])
    expect(claimSeasonReward(0, 's')).toBe(false)
    expect(claimSeasonReward(31, 's')).toBe(false)
    expect(claimSeasonReward(1.5, 's')).toBe(false)
    if (tier < 30) expect(claimSeasonReward(tier + 1, 's')).toBe(false)
  })
})

describe('duels', () => {
  it('records results and lists newest first', () => {
    const d = recordDuelResult({
      player1Alias: 'A',
      player2Alias: 'B',
      player1Score: 3,
      player2Score: 1,
      winnerAlias: 'A',
    })
    expect(d).toMatchObject({ winnerAlias: 'A', player1Score: 3 })
    recordDuelResult({ player1Alias: 'C', player2Alias: 'D', player1Score: 2, player2Score: 2 })
    expect(listRecentDuels()).toHaveLength(2)
    expect(listRecentDuels(1)).toHaveLength(1)
  })
})
