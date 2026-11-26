import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createChannel } from '@learning-hub/core'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { LearningHubDB, RawSqliteHandle } from '../src/index'
import {
  decideChannelProposal,
  getHostedChannel,
  hostChannel,
  listHostedChannels,
  publishHostedChannelVersion,
  unhostChannel,
  createChannelProposal,
  listChannelProposals,
} from '../src/repos'

function freshDb(): LearningHubDB {
  const sqlite = new Database(':memory:')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return drizzle(sqlite, { schema }) as unknown as LearningHubDB
}

const item = (id: string, q: string) => ({ id, content: { question: q, answer: 'a' } })

function hostedManifest(channelId = 'ch-host') {
  return createChannel({
    channelId,
    type: 'deck',
    title: 'Hosted deck',
    authorHandle: 'owner',
    visibility: 'link',
    items: [item('a', 'q1'), item('b', 'q2')],
  })
}

describe('share-channel hosting', () => {
  it('hosts, lists, publishes and unhosts a channel', () => {
    const db = freshDb()
    expect(hostChannel(hostedManifest(), db).ok).toBe(true)
    expect(hostChannel(hostedManifest(), db).ok).toBe(false) // duplicate
    expect(listHostedChannels(db)).toHaveLength(1)
    const published = publishHostedChannelVersion(
      {
        channelId: 'ch-host',
        items: [item('a', 'q1'), item('b', 'q2-edited'), item('c', 'q3')],
        changelog: 'more',
      },
      db,
    )
    expect(published.ok).toBe(true)
    expect(published.manifest!.currentVersion).toBe(2)
    expect(getHostedChannel('ch-host', db)!.versions).toHaveLength(2)
    expect(unhostChannel('ch-host', db).ok).toBe(true)
    expect(getHostedChannel('ch-host', db)).toBeUndefined()
  })
})

describe('channel proposals', () => {
  it('accepting a proposal publishes a new version', () => {
    const db = freshDb()
    hostChannel(hostedManifest(), db)
    const created = createChannelProposal(
      {
        channelId: 'ch-host',
        authorHandle: 'learner',
        title: 'Fix q2 and add q3',
        operations: [
          { kind: 'upsert', item: item('b', 'q2-fixed') },
          { kind: 'upsert', item: item('c', 'q3') },
        ],
      },
      db,
    )
    expect(created.ok).toBe(true)
    expect(listChannelProposals('ch-host', 'open', db)).toHaveLength(1)
    const decided = decideChannelProposal(created.proposal!.id, 'accept', db)
    expect(decided.ok).toBe(true)
    expect(decided.version).toBe(2)
    const manifest = getHostedChannel('ch-host', db)!
    expect(manifest.currentVersion).toBe(2)
    expect(manifest.versions[1].items.map((i) => i.id).sort()).toEqual(['a', 'b', 'c'])
    expect(manifest.versions[1].changelog).toContain('Fix q2')
    // already decided — cannot decide twice
    expect(decideChannelProposal(created.proposal!.id, 'accept', db).ok).toBe(false)
  })

  it('declining leaves the channel untouched', () => {
    const db = freshDb()
    hostChannel(hostedManifest(), db)
    const created = createChannelProposal(
      {
        channelId: 'ch-host',
        authorHandle: 'learner',
        title: 'remove a',
        operations: [{ kind: 'remove', itemId: 'a' }],
      },
      db,
    )
    expect(decideChannelProposal(created.proposal!.id, 'decline', db).ok).toBe(true)
    expect(getHostedChannel('ch-host', db)!.currentVersion).toBe(1)
    expect(listChannelProposals('ch-host', 'declined', db)).toHaveLength(1)
  })

  it('rejects proposals that change nothing or target unhosted channels', () => {
    const db = freshDb()
    expect(
      createChannelProposal(
        {
          channelId: 'nope',
          authorHandle: 'x',
          title: 't',
          operations: [{ kind: 'remove', itemId: 'a' }],
        },
        db,
      ).ok,
    ).toBe(false)
    hostChannel(hostedManifest(), db)
    expect(
      createChannelProposal(
        {
          channelId: 'ch-host',
          authorHandle: 'x',
          title: 't',
          operations: [{ kind: 'remove', itemId: 'ghost' }],
        },
        db,
      ).ok,
    ).toBe(false)
  })
})
