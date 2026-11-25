import { describe, expect, it } from 'vitest'
import { MAX_ROSTER_ROWS, cleanName, parseRemoteRoster } from '../src/lib/remote-roster'

const player = (handle: string, seasonPoints = 0, duelsWon = 0, duelsLost = 0) => ({
  handle,
  seasonPoints,
  duelsWon,
  duelsLost,
})

const state = (over: Record<string, unknown> = {}) => ({
  league: {
    title: 'Friendly league',
    currentRound: 2,
    players: [player('usr_b', 5, 1, 0), player('usr_a', 9, 0, 2)],
  },
  aliases: { usr_a: 'Zed', usr_b: 'Amy' },
  inviteOnly: true,
  liveInvites: 3,
  ...over,
})

describe('parseRemoteRoster', () => {
  it('lists members alphabetically by name and never ranks by points', () => {
    const r = parseRemoteRoster(state())!
    expect(r.members.map((m) => m.name)).toEqual(['Amy', 'Zed'])
    // Zed has more points but still sorts last: this is not a leaderboard.
    expect(r.members[1]).toEqual({ name: 'Zed', activityPoints: 9, duels: 2 })
    expect(r).toMatchObject({
      title: 'Friendly league',
      round: 2,
      inviteOnly: true,
      liveInvites: 3,
    })
  })

  it('accepts the route envelope and refuses a failed one', () => {
    expect(parseRemoteRoster({ ok: true, status: 200, remote: state() })).not.toBeNull()
    expect(parseRemoteRoster({ ok: false, status: 404, remote: { error: 'no' } })).toBeNull()
  })

  it('returns null for junk instead of throwing', () => {
    for (const junk of [
      null,
      undefined,
      5,
      'x',
      [],
      {},
      { league: 1 },
      { league: { title: 'x' } },
    ]) {
      expect(parseRemoteRoster(junk)).toBeNull()
    }
  })

  it('never shows a raw handle: members without an alias are just "member"', () => {
    const r = parseRemoteRoster(state({ aliases: {} }))!
    expect(r.members.map((m) => m.name)).toEqual(['member', 'member'])
    expect(JSON.stringify(r)).not.toContain('usr_')
  })

  it('defaults the invite fields when an older server omits them', () => {
    const s = state() as Record<string, unknown>
    delete s.inviteOnly
    delete s.liveInvites
    expect(parseRemoteRoster(s)).toMatchObject({ inviteOnly: false, liveInvites: 0 })
  })

  it('caps the listed rows and reports how many are hidden', () => {
    const players = Array.from({ length: MAX_ROSTER_ROWS + 25 }, (_, i) => player(`usr_${i}`))
    const aliases = Object.fromEntries(
      players.map((p, i) => [p.handle, `m${String(i).padStart(4, '0')}`]),
    )
    const r = parseRemoteRoster(
      state({ league: { title: 'Big', currentRound: 0, players }, aliases }),
    )!
    expect(r.members).toHaveLength(MAX_ROSTER_ROWS)
    expect(r.hidden).toBe(25)
  })

  it('rejects absurd values rather than rendering them', () => {
    expect(
      parseRemoteRoster(
        state({ league: { title: 'x', currentRound: 0, players: [player('a', -1)] } }),
      ),
    ).toBeNull()
    expect(parseRemoteRoster(state({ liveInvites: 1e9 }))).toBeNull()
  })
})

describe('cleanName', () => {
  it('strips control and bidi override characters and collapses spaces', () => {
    expect(cleanName('A\u0000b\u202ec   d\n')).toBe('Abc d')
    expect(cleanName('  \u200f  ')).toBe('')
  })

  it('caps long names with an ellipsis', () => {
    const out = cleanName('x'.repeat(100))
    expect(out).toHaveLength(40)
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves ordinary and non-latin names alone', () => {
    expect(cleanName('Zoë 学生')).toBe('Zoë 学生')
  })
})
