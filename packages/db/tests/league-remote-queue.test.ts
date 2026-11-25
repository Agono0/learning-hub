import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueLeagueMutation,
  initDb,
  leagueRemoteLinks,
  leagueRemoteQueues,
  linkRemoteLeague,
  loadLeagueQueue,
  saveLeagueQueue,
  setDb,
  type LearningHubDB,
} from '../src/index'
import {
  MAX_QUEUE_ITEMS,
  SyncQueueFullError,
  createSyncQueue,
  enqueue,
  recordOutcome,
} from '@learning-hub/core/leagues'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-remote-q-'))
  db = await initDb({ path: join(tmp, 'remote-q.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueRemoteQueues).run()
  db.delete(leagueRemoteLinks).run()
})

const link = () =>
  linkRemoteLeague({
    serverUrl: 'https://league.example.workers.dev',
    remoteLeagueId: 'lg-queue-1',
  })

describe('league remote queue persistence', () => {
  it('a link with no stored queue loads as empty, not recovered', () => {
    const l = link()
    const r = loadLeagueQueue(l.id)
    expect(r.queue.items).toHaveLength(0)
    expect(r.recovered).toBe(false)
  })

  it('round-trips a queue including item state', () => {
    const l = link()
    let q = enqueue(createSyncQueue(), { type: 'join', alias: 'Ada' }, 1000).queue
    q = recordOutcome(q, q.items[0]!.id, { kind: 'transport-error' }, 2000)
    saveLeagueQueue(l.id, q)
    const back = loadLeagueQueue(l.id)
    expect(back.recovered).toBe(false)
    expect(back.queue).toEqual(q)
    expect(back.queue.items[0]!.attempts).toBe(1)
  })

  it('save overwrites rather than duplicating the row', () => {
    const l = link()
    saveLeagueQueue(l.id, createSyncQueue())
    saveLeagueQueue(l.id, enqueue(createSyncQueue(), { type: 'join', alias: 'Bo' }, 5).queue)
    expect(db.select().from(leagueRemoteQueues).all()).toHaveLength(1)
    expect(loadLeagueQueue(l.id).queue.items).toHaveLength(1)
  })

  it('enqueueLeagueMutation appends in order and persists each item', () => {
    const l = link()
    const a = enqueueLeagueMutation(l.id, { type: 'join', alias: 'Ada' })
    const b = enqueueLeagueMutation(l.id, { type: 'duel-start', duelId: 'd1' })
    expect(a.itemId).not.toBe(b.itemId)
    const stored = loadLeagueQueue(l.id).queue
    expect(stored.items.map((i) => i.mutation.type)).toEqual(['join', 'duel-start'])
  })

  it('a full queue refuses another item and leaves storage untouched', () => {
    const l = link()
    let q = createSyncQueue()
    for (let i = 0; i < MAX_QUEUE_ITEMS; i++) {
      q = enqueue(q, { type: 'duel-start', duelId: `d${i}` }, 10).queue
    }
    saveLeagueQueue(l.id, q)
    expect(() => enqueueLeagueMutation(l.id, { type: 'duel-start', duelId: 'overflow' })).toThrow(
      SyncQueueFullError,
    )
    expect(loadLeagueQueue(l.id).queue.items).toHaveLength(MAX_QUEUE_ITEMS)
  })

  it('a corrupt document recovers to an empty queue and says so', () => {
    const l = link()
    db.insert(leagueRemoteQueues).values({ linkId: l.id, queueJson: '{not json' }).run()
    expect(loadLeagueQueue(l.id)).toMatchObject({ recovered: true })
    db.update(leagueRemoteQueues)
      .set({ queueJson: JSON.stringify({ schema: 'lh-league-sync/v1', counter: 0, items: [{}] }) })
      .run()
    const r = loadLeagueQueue(l.id)
    expect(r.recovered).toBe(true)
    expect(r.queue.items).toHaveLength(0)
  })

  it('rejects saving an invalid queue instead of storing it', () => {
    const l = link()
    const bad = { schema: 'lh-league-sync/v1', counter: -1, items: [] } as never
    expect(() => saveLeagueQueue(l.id, bad)).toThrow()
    expect(db.select().from(leagueRemoteQueues).all()).toHaveLength(0)
  })

  it('stores unsent mutations only: no signature or key material in the document', () => {
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'join', alias: 'Ada' })
    const raw = db.select().from(leagueRemoteQueues).all()[0]!.queueJson
    expect(raw).not.toMatch(/signature|privKey|privateKey|pubKey/i)
  })

  it('deleting a link removes its queue', () => {
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'join', alias: 'Ada' })
    db.delete(leagueRemoteLinks).run()
    expect(db.select().from(leagueRemoteQueues).all()).toHaveLength(0)
  })
})
