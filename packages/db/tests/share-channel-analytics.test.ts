import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createChannel } from '@learning-hub/core'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { LearningHubDB, RawSqliteHandle } from '../src/index'
import {
  createChannelProposal,
  decideChannelProposal,
  hostChannel,
  hostedChannelAnalytics,
  publishHostedChannelVersion,
  subscriptionSyncStats,
} from '../src/repos'
import { shareChannelSyncRecords } from '../src/schema'

function freshDb(): LearningHubDB {
  const sqlite = new Database(':memory:')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return drizzle(sqlite, { schema }) as unknown as LearningHubDB
}

const item = (id: string, q: string) => ({ id, content: { question: q, answer: 'a' } })

function setupHosted(db: LearningHubDB) {
  hostChannel(
    createChannel({
      channelId: 'ch-analytics',
      type: 'deck',
      title: 'Analytics deck',
      authorHandle: 'owner',
      visibility: 'link',
      items: [item('a', 'q1'), item('b', 'q2')],
      now: '2026-01-01T00:00:00Z',
    }),
    db,
  )
  publishHostedChannelVersion(
    {
      channelId: 'ch-analytics',
      items: [item('a', 'q1'), item('b', 'q2-edit'), item('c', 'q3')],
      changelog: 'v2',
      now: '2026-01-02T00:00:00Z',
    },
    db,
  )
}

describe('hostedChannelAnalytics', () => {
  it('combines manifest history with proposal stats', () => {
    const db = freshDb()
    setupHosted(db)
    const accepted = createChannelProposal(
      {
        channelId: 'ch-analytics',
        authorHandle: 'fox',
        title: 'fix b',
        operations: [{ kind: 'upsert', item: item('b', 'q2-fixed') }],
      },
      db,
    )
    decideChannelProposal(accepted.proposal!.id, 'accept', db)
    const declined = createChannelProposal(
      {
        channelId: 'ch-analytics',
        authorHandle: 'owl',
        title: 'drop a',
        operations: [{ kind: 'remove', itemId: 'a' }],
      },
      db,
    )
    decideChannelProposal(declined.proposal!.id, 'decline', db)

    const res = hostedChannelAnalytics('ch-analytics', db)
    expect(res.ok).toBe(true)
    const a = res.analytics!
    expect(a.currentVersion).toBe(3)
    expect(a.itemCount).toBe(3)
    expect(a.lifetime.added).toBe(3) // a,b at v1 + c at v2
    expect(a.lifetime.changed).toBe(2) // b at v2 + b at v3
    expect(a.versions).toHaveLength(3)
    expect(a.proposals.total).toBe(2)
    expect(a.proposals.accepted).toBe(1)
    expect(a.proposals.declined).toBe(1)
    expect(a.proposals.topContributors).toEqual([{ authorHandle: 'fox', accepted: 1 }])
  })

  it('fails for unhosted channels', () => {
    const db = freshDb()
    expect(hostedChannelAnalytics('nope', db).ok).toBe(false)
  })
})

describe('subscriptionSyncStats', () => {
  it('summarizes sync outcomes per channel', () => {
    const db = freshDb()
    const rows = [
      { at: '2026-01-01T00:00:00Z', outcome: 'updated' },
      { at: '2026-01-02T00:00:00Z', outcome: 'already-current' },
      { at: '2026-01-03T00:00:00Z', outcome: 'failed' },
    ]
    for (const r of rows) {
      db.insert(shareChannelSyncRecords)
        .values({
          channelId: 'ch-sub',
          at: r.at,
          fromVersion: 0,
          toVersion: 1,
          outcome: r.outcome,
          ...(r.outcome === 'failed' ? { errorMessage: 'timeout' } : {}),
        })
        .run()
    }
    const stats = subscriptionSyncStats('ch-sub', db)
    expect(stats.totalSyncs).toBe(3)
    expect(stats.updated).toBe(1)
    expect(stats.alreadyCurrent).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.lastSyncAt).toBe('2026-01-03T00:00:00Z')
    expect(stats.lastError).toBe('timeout')
    expect(subscriptionSyncStats('ch-none', db).totalSyncs).toBe(0)
  })
})
