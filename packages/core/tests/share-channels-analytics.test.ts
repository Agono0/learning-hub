import { describe, expect, it } from 'vitest'
import { createChannel, manifestAnalytics, publishUpdate } from '../src/share-channels'

describe('manifestAnalytics', () => {
  it('tracks per-version activity and lifetime totals', () => {
    let m = createChannel({
      channelId: 'ch-an',
      type: 'deck',
      title: 't',
      authorHandle: 'o',
      visibility: 'link',
      items: [
        { id: 'a', content: { v: 1 } },
        { id: 'b', content: { v: 1 } },
      ],
      now: '2026-01-01T00:00:00Z',
    })
    m = publishUpdate(
      m,
      [
        { id: 'a', content: { v: 1 } },
        { id: 'b', content: { v: 2 } },
        { id: 'c', content: { v: 1 } },
      ],
      'v2',
      '2026-01-02T00:00:00Z',
    )
    m = publishUpdate(m, [{ id: 'a', content: { v: 3 } }], 'v3', '2026-01-03T00:00:00Z')
    const a = manifestAnalytics(m)
    expect(a.channelId).toBe('ch-an')
    expect(a.currentVersion).toBe(3)
    expect(a.itemCount).toBe(1)
    expect(a.versions).toHaveLength(3)
    expect(a.versions[0]).toMatchObject({ version: 1, added: 2, removed: 0, changed: 0 })
    expect(a.versions[1]).toMatchObject({ version: 2, added: 1, removed: 0, changed: 1 })
    expect(a.versions[2]).toMatchObject({ version: 3, added: 0, removed: 2, changed: 1 })
    expect(a.lifetime).toEqual({ added: 3, removed: 2, changed: 2 })
    // 7 touches over 6 published item-slots
    expect(a.churnRate).toBeCloseTo(7 / 6, 5)
  })

  it('handles a single-version channel', () => {
    const m = createChannel({
      channelId: 'ch-solo',
      type: 'course',
      title: 't',
      authorHandle: 'o',
      visibility: 'invite',
      items: [{ id: 'x', content: { v: 1 } }],
      now: '2026-01-01T00:00:00Z',
    })
    const a = manifestAnalytics(m)
    expect(a.versions).toHaveLength(1)
    expect(a.lifetime).toEqual({ added: 1, removed: 0, changed: 0 })
    expect(a.churnRate).toBe(1)
  })
})
