import { describe, expect, it } from 'vitest'
import {
  applyProposalOperations,
  ChannelProposalSchema,
  createChannel,
  publishUpdate,
  ProposalOperationSchema,
} from '../src/share-channels'

const manifest = () =>
  createChannel({
    channelId: 'ch-prop',
    type: 'deck',
    title: 'Proposal deck',
    authorHandle: 'owner',
    visibility: 'link',
    items: [
      { id: 'a', content: { front: 'Qa?', back: 'A' } },
      { id: 'b', content: { front: 'Qb?', back: 'B' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })

describe('applyProposalOperations', () => {
  it('applies upserts and removes onto the current version', () => {
    const res = applyProposalOperations(manifest(), [
      { kind: 'upsert', item: { id: 'b', content: { front: 'Qb fixed?', back: 'B' } } },
      { kind: 'upsert', item: { id: 'c', content: { front: 'Qc?', back: 'C' } } },
      { kind: 'remove', itemId: 'a' },
    ])
    expect(res.ok).toBe(true)
    expect(res.items!.map((i) => i.id).sort()).toEqual(['b', 'c'])
    expect(res.summary).toEqual({ added: 1, updated: 1, removed: 1 })
    // an upsert onto an existing id preserves its revision for publish-time bumping
    expect(res.items!.find((i) => i.id === 'b')!.revision).toBe(2 - 1) // manifest v1 items have revision 1
  })

  it('rejects proposals that change nothing', () => {
    const res = applyProposalOperations(manifest(), [
      { kind: 'upsert', item: { id: 'a', content: { front: 'Qa?', back: 'A' } } },
    ])
    expect(res.ok).toBe(false)
    expect(res.error).toContain('changes nothing')
    const ghostRemove = applyProposalOperations(manifest(), [{ kind: 'remove', itemId: 'ghost' }])
    expect(ghostRemove.ok).toBe(false)
  })

  it('applies onto a version newer than the proposal base', () => {
    let m = manifest()
    m = publishUpdate(
      m,
      [
        { id: 'a', content: { front: 'Qa?', back: 'A' } },
        { id: 'b', content: { front: 'Qb v2?', back: 'B' } },
        { id: 'd', content: { front: 'Qd?', back: 'D' } },
      ],
      'v2',
      '2026-01-02T00:00:00Z',
    )
    // proposal written against v1 still lands on v2's state
    const res = applyProposalOperations(m, [
      { kind: 'upsert', item: { id: 'b', content: { front: 'Qb v2 fixed?', back: 'B' } } },
    ])
    expect(res.ok).toBe(true)
    expect(res.items!.map((i) => i.id).sort()).toEqual(['a', 'b', 'd'])
    const next = publishUpdate(
      m,
      res.items!.map((i) => ({ id: i.id, content: i.content })),
      'proposal accepted',
      '2026-01-03T00:00:00Z',
    )
    expect(next.currentVersion).toBe(3)
    const b = next.versions[2].items.find((i) => i.id === 'b')!
    expect(b.content.front).toBe('Qb v2 fixed?')
    expect(b.revision).toBe(3) // rev 1 at v1, 2 at v2, 3 after proposal
  })
})

describe('ProposalOperationSchema', () => {
  it('validates upsert and remove operations', () => {
    expect(
      ProposalOperationSchema.safeParse({
        kind: 'upsert',
        item: { id: 'x', content: { front: 'Q' } },
      }).success,
    ).toBe(true)
    expect(ProposalOperationSchema.safeParse({ kind: 'remove', itemId: 'x' }).success).toBe(true)
    expect(
      ProposalOperationSchema.safeParse({ kind: 'upsert', item: { content: {} } }).success,
    ).toBe(false)
    expect(ProposalOperationSchema.safeParse({ kind: 'delete', itemId: 'x' }).success).toBe(false)
  })
})

describe('ChannelProposalSchema', () => {
  it('round-trips a stored proposal', () => {
    const parsed = ChannelProposalSchema.parse({
      id: 'p1',
      channelId: 'ch-prop',
      authorHandle: 'fox',
      title: 'fix b',
      note: '',
      baseVersion: 1,
      operations: [{ kind: 'remove', itemId: 'b' }],
      status: 'open',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(parsed.status).toBe('open')
    expect(
      ChannelProposalSchema.parse({ ...parsed, status: 'accepted', acceptedVersion: 2 })
        .acceptedVersion,
    ).toBe(2)
  })
})
