import { describe, expect, it } from 'vitest'

import {
  acceptChannelVersion,
  applyAllPendingVersions,
  applyChannelUpdate,
  diffVersions,
  migrateV1Envelope,
  canSubscribe,
  issueInviteToken,
  verifyInviteToken,
  createChannel,
  hasPendingUpdate,
  publishUpdate,
  subscribeToChannel,
  verifyManifest,
  type ChannelManifest,
  type LocalItem,
} from '../src/share-channels'

function manifestWithTwo(): ChannelManifest {
  return createChannel({
    channelId: 'ch-bio-101',
    type: 'deck',
    title: 'Biology 101',
    authorHandle: 'study-owl',
    visibility: 'link',
    items: [
      { id: 'c1', content: { front: 'What is mitosis?', back: 'Cell division' } },
      { id: 'c2', content: { front: 'What is meiosis?', back: 'Gamete division' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })
}

function localFrom(manifest: ChannelManifest): LocalItem[] {
  const v = manifest.versions[0]
  return v.items.map((i) => ({
    channelItemId: i.id,
    channelContent: i.content,
    channelRevision: i.revision,
    localContent: i.content,
    learnerState: { fsrs: { stability: 12.3 }, note: 'remember for exam' },
  }))
}

describe('channel creation and publishing', () => {
  it('creates a valid v2 manifest at version 1', () => {
    const m = manifestWithTwo()
    expect(m.schema).toBe('lh-share/v2')
    expect(m.currentVersion).toBe(1)
    expect(m.versions).toHaveLength(1)
    expect(verifyManifest(m).ok).toBe(true)
  })

  it('publishes updates with bumped revisions only for changed items', () => {
    const m = publishUpdate(
      manifestWithTwo(),
      [
        { id: 'c1', content: { front: 'What is mitosis?', back: 'Somatic cell division' } },
        { id: 'c2', content: { front: 'What is meiosis?', back: 'Gamete division' } },
        { id: 'c3', content: { front: 'New card', back: 'New answer' } },
      ],
      'Clarified mitosis, added a card',
      '2026-01-02T00:00:00Z',
    )
    expect(m.currentVersion).toBe(2)
    const v2 = m.versions[1]
    expect(v2.items.find((i) => i.id === 'c1')?.revision).toBe(2)
    expect(v2.items.find((i) => i.id === 'c2')?.revision).toBe(1)
    expect(v2.items.find((i) => i.id === 'c3')?.revision).toBe(1)
    expect(verifyManifest(m).ok).toBe(true)
  })
})

describe('subscription state', () => {
  it('detects pending updates', () => {
    const m = manifestWithTwo()
    const sub = subscribeToChannel(m.channelId, '2026-01-01T01:00:00Z')
    expect(hasPendingUpdate(sub, m)).toBe(true)
    const upToDate = { ...sub, localVersion: 1 }
    expect(hasPendingUpdate(upToDate, m)).toBe(false)
  })
})

describe('applyChannelUpdate', () => {
  it('fast-forwards undiverged items and preserves learner state', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    const m1 = publishUpdate(
      m0,
      [
        { id: 'c1', content: { front: 'What is mitosis?', back: 'Somatic cell division' } },
        { id: 'c2', content: { front: 'What is meiosis?', back: 'Gamete division' } },
      ],
      'Clarified mitosis',
    )
    const { items, result } = applyChannelUpdate(local, m1.versions[1])
    expect(result.updatedCount).toBe(1)
    expect(result.conflictCount).toBe(0)
    const c1 = items.find((i) => i.channelItemId === 'c1')!
    expect(c1.localContent.back).toBe('Somatic cell division')
    expect(c1.learnerState).toEqual({ fsrs: { stability: 12.3 }, note: 'remember for exam' })
  })

  it('adds new publisher items', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    const m1 = publishUpdate(
      m0,
      [...m0.versions[0].items, { id: 'c9', content: { front: 'Extra', back: 'Card' } }],
      'Added a card',
    )
    const { items, result } = applyChannelUpdate(local, m1.versions[1])
    expect(result.addedCount).toBe(1)
    expect(items.find((i) => i.channelItemId === 'c9')?.learnerState).toEqual({})
  })

  it('records a conflict when both sides changed, and the learner wins', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    local[0] = { ...local[0], localContent: { front: 'What is mitosis?', back: 'My own wording' } }
    const m1 = publishUpdate(
      m0,
      [
        { id: 'c1', content: { front: 'What is mitosis?', back: 'Publisher wording' } },
        m0.versions[0].items[1],
      ],
      'Publisher rewrote c1',
    )
    const { items, result } = applyChannelUpdate(local, m1.versions[1])
    expect(result.conflicts).toEqual(['c1'])
    const c1 = items.find((i) => i.channelItemId === 'c1')!
    expect(c1.localContent.back).toBe('My own wording')
    expect(c1.channelContent?.back).toBe('Publisher wording')
  })

  it('keeps publisher-removed items locally with learner state intact', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    const m1 = publishUpdate(m0, [m0.versions[0].items[0]], 'Removed c2')
    const { items, result } = applyChannelUpdate(local, m1.versions[1])
    expect(result.removedCount).toBe(1)
    const c2 = items.find((i) => i.channelItemId === 'c2')!
    expect(c2.learnerState).toEqual({ fsrs: { stability: 12.3 }, note: 'remember for exam' })
  })

  it('never touches learner-created items', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    local.push({
      channelItemId: null,
      channelContent: null,
      channelRevision: null,
      localContent: { front: 'My card', back: 'Mine' },
      learnerState: { note: 'personal' },
    })
    const m1 = publishUpdate(m0, [m0.versions[0].items[0]], 'Removed c2')
    const { items } = applyChannelUpdate(local, m1.versions[1])
    const mine = items.find((i) => i.channelItemId === null)!
    expect(mine.localContent).toEqual({ front: 'My card', back: 'Mine' })
  })

  it('is idempotent: re-applying the same version changes nothing', () => {
    const m0 = manifestWithTwo()
    const m1 = publishUpdate(
      m0,
      [{ id: 'c1', content: { front: 'What is mitosis?', back: 'New' } }, m0.versions[0].items[1]],
      'v2',
    )
    const first = applyChannelUpdate(localFrom(m0), m1.versions[1])
    const second = applyChannelUpdate(first.items, m1.versions[1])
    expect(second.result.addedCount).toBe(0)
    expect(second.result.updatedCount).toBe(0)
    expect(second.items).toEqual(first.items)
  })
})

describe('acceptChannelVersion', () => {
  it('lets the learner take the publisher content after a conflict', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    local[0] = { ...local[0], localContent: { front: 'q', back: 'mine' } }
    const m1 = publishUpdate(
      m0,
      [{ id: 'c1', content: { front: 'q', back: 'theirs' } }, m0.versions[0].items[1]],
      'v2',
    )
    const { items } = applyChannelUpdate(local, m1.versions[1])
    const resolved = acceptChannelVersion(items[0], m1.versions[1])
    expect(resolved.localContent.back).toBe('theirs')
  })
})

describe('verifyManifest', () => {
  it('flags a tampered version', () => {
    const m = manifestWithTwo()
    const tampered = {
      ...m,
      versions: [{ ...m.versions[0], checksum: 'deadbeef' }],
    }
    const report = verifyManifest(tampered)
    expect(report.ok).toBe(false)
    expect(report.badVersions).toEqual([1])
  })
})

describe('invite tokens', () => {
  it('issues and verifies deterministic tokens', () => {
    const t = issueInviteToken('ch-bio-101', 'creator-secret')
    expect(verifyInviteToken('ch-bio-101', 'creator-secret', t)).toBe(true)
    expect(verifyInviteToken('ch-bio-101', 'wrong-secret', t)).toBe(false)
    expect(verifyInviteToken('ch-other', 'creator-secret', t)).toBe(false)
  })

  it('link channels accept anyone; invite channels require a token', () => {
    const link = manifestWithTwo()
    expect(canSubscribe(link).allowed).toBe(true)
    const invite = { ...link, visibility: 'invite' as const }
    expect(canSubscribe(invite).allowed).toBe(false)
    expect(canSubscribe(invite).reason).toMatch(/invite-only/)
    const token = issueInviteToken(invite.channelId, 'creator-secret')
    expect(canSubscribe(invite, token).allowed).toBe(true)
    expect(canSubscribe(invite, 'bogus-token', 'creator-secret').allowed).toBe(false)
    expect(canSubscribe(invite, token, 'creator-secret').allowed).toBe(true)
  })
})

describe('diffVersions', () => {
  it('reports added, removed, changed and unchanged items', () => {
    const m0 = manifestWithTwo()
    const m1 = publishUpdate(
      m0,
      [
        { id: 'c1', content: { front: 'What is mitosis?', back: 'Changed' } },
        { id: 'c3', content: { front: 'Brand new', back: 'Card' } },
      ],
      'v2',
    )
    const diff = diffVersions(m0.versions[0], m1.versions[1])
    expect(diff.addedIds).toEqual(['c3'])
    expect(diff.removedIds).toEqual(['c2'])
    expect(diff.changedIds).toEqual(['c1'])
    expect(diff.unchangedIds).toEqual([])
  })
})

describe('applyAllPendingVersions', () => {
  it('folds multiple versions in order and dedupes conflicts', () => {
    const m0 = manifestWithTwo()
    const local = localFrom(m0)
    local[0] = { ...local[0], localContent: { front: 'q', back: 'mine' } }
    let m = publishUpdate(
      m0,
      [{ id: 'c1', content: { front: 'q', back: 'theirs v2' } }, m0.versions[0].items[1]],
      'v2',
      '2026-01-02T00:00:00Z',
    )
    m = publishUpdate(
      m,
      [
        { id: 'c1', content: { front: 'q', back: 'theirs v3' } },
        m0.versions[0].items[1],
        { id: 'c4', content: { front: 'new', back: 'card' } },
      ],
      'v3',
      '2026-01-03T00:00:00Z',
    )
    const sub = { ...subscribeToChannel(m.channelId), localVersion: 1 }
    const { items, result, appliedVersions } = applyAllPendingVersions(local, sub, m)
    expect(appliedVersions).toEqual([2, 3])
    expect(result.newVersion).toBe(3)
    expect(result.addedCount).toBe(1)
    expect(result.conflicts).toEqual(['c1'])
    expect(items.find((i) => i.channelItemId === 'c1')?.localContent.back).toBe('mine')
    expect(items.find((i) => i.channelItemId === 'c1')?.channelContent?.back).toBe('theirs v3')
  })

  it('is a no-op when the subscription is current', () => {
    const m = manifestWithTwo()
    const sub = { ...subscribeToChannel(m.channelId), localVersion: 1 }
    const { result, appliedVersions } = applyAllPendingVersions(localFrom(m), sub, m)
    expect(appliedVersions).toEqual([])
    expect(result.addedCount).toBe(0)
  })
})

describe('migrateV1Envelope', () => {
  it('upgrades a v1 envelope into a v2 channel at version 1', () => {
    const m = migrateV1Envelope({
      envelope: {
        type: 'deck',
        metadata: { title: 'Old Deck', author: 'legacy' },
        data: {
          items: [
            { id: 'a', front: 'Q', back: 'A' },
            { front: 'No id', back: 'B' },
          ],
        },
      },
      channelId: 'ch-legacy',
      authorHandle: 'study-owl',
      visibility: 'link',
      now: '2026-01-01T00:00:00Z',
    })
    expect(m.schema).toBe('lh-share/v2')
    expect(m.currentVersion).toBe(1)
    const ids = m.versions[0].items.map((i) => i.id)
    expect(ids).toEqual(['a', 'item-2'])
    expect(verifyManifest(m).ok).toBe(true)
  })
})
