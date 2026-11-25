import { describe, expect, it } from 'vitest'
import {
  describeRosterLines,
  MAX_ROSTER_ROWS,
  type RemoteRoster,
} from '../src/leagues/remote-roster'

const base: RemoteRoster = {
  blockedCount: 0,
  moderation: [],
  title: 'Cup',
  round: 2,
  inviteOnly: false,
  liveInvites: 0,
  members: [],
  hidden: 0,
}

describe('describeRosterLines', () => {
  it('states an empty open league plainly', () => {
    const lines = describeRosterLines(base)
    expect(lines[0]).toBe('Cup · round 2')
    expect(lines).toContain('Open to join')
    expect(lines).toContain('No members yet.')
    expect(lines.at(-1)).toMatch(/not a ranking/)
  })

  it('pluralizes live invites', () => {
    expect(describeRosterLines({ ...base, inviteOnly: true, liveInvites: 1 })[1]).toBe(
      'Invite only · 1 live invite',
    )
    expect(describeRosterLines({ ...base, inviteOnly: true, liveInvites: 3 })[1]).toBe(
      'Invite only · 3 live invites',
    )
  })

  it('keeps member order as given and never adds rank numbers', () => {
    const lines = describeRosterLines({
      ...base,
      members: [
        { name: 'Ada', activityPoints: 5, duels: 2 },
        { name: 'Bo', activityPoints: 90, duels: 7 },
      ],
    })
    const rows = lines.filter((l) => l.startsWith('  '))
    expect(rows[0]).toContain('Ada')
    expect(rows[1]).toContain('Bo')
    expect(rows.join('')).not.toMatch(/#\d|1st|rank 1/i)
  })

  it('reports hidden members and the moderation log with verbs', () => {
    const at = Date.UTC(2026, 0, 2, 3, 4)
    const lines = describeRosterLines({
      ...base,
      hidden: 4,
      blockedCount: 2,
      moderation: [
        { at, action: 'remove', by: 'Ada', target: 'Cy' },
        { at, action: 'unblock', by: 'Ada', target: 'Cy' },
        { at, action: 'transfer', by: 'Ada', target: 'Bo' },
      ],
    })
    expect(lines).toContain('  4 more not shown.')
    expect(lines).toContain('Moderation · 2 blocked')
    expect(lines).toContain('  2026-01-02 03:04 UTC · Ada removed Cy')
    expect(lines).toContain('  2026-01-02 03:04 UTC · Ada unblocked Cy')
    expect(lines).toContain('  2026-01-02 03:04 UTC · Ada made founder Bo')
  })

  it('exposes the row cap used for hidden counts', () => {
    expect(MAX_ROSTER_ROWS).toBe(200)
  })
})
