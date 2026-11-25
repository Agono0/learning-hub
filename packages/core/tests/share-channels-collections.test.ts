import { describe, expect, it } from 'vitest'
import {
  createChannel,
  createCollection,
  planCollectionSubscription,
  removeCollectionChannel,
  upsertCollectionChannel,
  ChannelCollectionSchema,
} from '../src/share-channels'

const manifest = (channelId: string, title: string) =>
  createChannel({
    channelId,
    type: 'deck',
    title,
    authorHandle: 'owner',
    visibility: 'link',
    items: [{ id: 'i1', content: { front: 'Q?', back: 'A' } }],
    now: '2026-01-01T00:00:00Z',
  })

describe('channel collections', () => {
  it('creates a validated collection', () => {
    const c = createCollection({
      id: 'col-1',
      title: 'Biology pack',
      ownerHandle: 'teacher',
      channels: [manifest('ch-cells', 'Cells'), manifest('ch-dna', 'DNA')],
      now: '2026-01-01T00:00:00Z',
    })
    expect(c.schema).toBe('lh-share-collection/v1')
    expect(c.channels).toHaveLength(2)
    expect(ChannelCollectionSchema.parse(c)).toBeTruthy()
  })

  it('upserts a channel snapshot and bumps updatedAt', () => {
    const c = createCollection({
      id: 'col-1',
      title: 't',
      ownerHandle: 'o',
      channels: [manifest('ch-a', 'A')],
      now: '2026-01-01T00:00:00Z',
    })
    const updated = upsertCollectionChannel(
      c,
      manifest('ch-a', 'A revised'),
      '2026-01-02T00:00:00Z',
    )
    expect(updated.channels).toHaveLength(1)
    expect(updated.channels[0].title).toBe('A revised')
    expect(updated.updatedAt).toBe('2026-01-02T00:00:00Z')
    const added = upsertCollectionChannel(c, manifest('ch-b', 'B'), '2026-01-02T00:00:00Z')
    expect(added.channels.map((x) => x.channelId).sort()).toEqual(['ch-a', 'ch-b'])
  })

  it('removes channels but never empties the collection', () => {
    const c = createCollection({
      id: 'col-1',
      title: 't',
      ownerHandle: 'o',
      channels: [manifest('ch-a', 'A')],
      now: '2026-01-01T00:00:00Z',
    })
    expect(removeCollectionChannel(c, 'ch-missing').ok).toBe(false)
    expect(removeCollectionChannel(c, 'ch-a').ok).toBe(false) // last channel
    const two = upsertCollectionChannel(c, manifest('ch-b', 'B'))
    const removed = removeCollectionChannel(two, 'ch-a')
    expect(removed.ok).toBe(true)
    expect(removed.collection!.channels[0].channelId).toBe('ch-b')
  })

  it('plans a subscribe-all against existing subscriptions', () => {
    const c = createCollection({
      id: 'col-1',
      title: 't',
      ownerHandle: 'o',
      channels: [manifest('ch-a', 'A'), manifest('ch-b', 'B'), manifest('ch-c', 'C')],
      now: '2026-01-01T00:00:00Z',
    })
    const plan = planCollectionSubscription(c, ['ch-b'])
    expect(plan.toSubscribe).toEqual(['ch-a', 'ch-c'])
    expect(plan.alreadyHave).toEqual(['ch-b'])
  })
})
