/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers pass JSON payloads around */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import {
  createChannel,
  publishUpdate,
  type ChannelManifest,
} from '../../../packages/core/src/share-channels'
import { createIsolatedTestDb, type TestDbContext } from '../helpers/test-db'

/**
 * Share-channels SYNC parity suite: exercises the stateful routes
 * (subscribe → sync → sync-records) against a stub remote host that serves
 * manifest JSON the way any static host or peer hub would. Verifies the
 * subscriber's local SQLite state moves version-to-version and that learner
 * state survives remote updates end to end.
 */

let server: Server
let baseUrl: string
let remote: Server
let remoteUrl: string
let testDb: TestDbContext
let remoteManifest: ChannelManifest

beforeAll(async () => {
  testDb = createIsolatedTestDb('share-channels-sync')

  // The subscriber hub under test.
  server = createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  // The publisher: a minimal static manifest host.
  remoteManifest = createChannel({
    channelId: 'ch-remote-deck',
    type: 'deck',
    title: 'Remote Deck',
    authorHandle: 'remote-fox',
    visibility: 'link',
    items: [
      { id: 'r1', content: { front: 'Remote Q1?', back: 'A1' } },
      { id: 'r2', content: { front: 'Remote Q2?', back: 'A2' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })
  remote = createServer((req, res) => {
    const match = req.url?.match(/^\/share\/channels\/([^/]+)\/manifest$/)
    if (req.method === 'GET' && match && match[1] === remoteManifest.channelId) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(remoteManifest))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', () => resolve()))
  remoteUrl = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await new Promise<void>((resolve) => remote.close(() => resolve()))
  testDb.cleanup()
})

async function post(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`)
  return { status: res.status, data: await res.json() }
}

describe('share-channels sync routes', () => {
  it('subscribes, seeds items, and lists the subscription', async () => {
    const { status, data } = await post('/share/channels/subscribe', {
      manifest: remoteManifest,
      hostBaseUrl: remoteUrl,
    })
    expect(status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.itemCount).toBe(2)
    expect(data.localVersion).toBe(1)

    const list = await get('/share/channels/subscriptions')
    expect(list.data.ok).toBe(true)
    const row = list.data.subscriptions.find((r: any) => r.channelId === 'ch-remote-deck')
    expect(row.title).toBe('Remote Deck')
    expect(row.hostBaseUrl).toBe(remoteUrl)
    expect(row.hasPending).toBe(false)
  })

  it('rejects a tampered manifest on subscribe', async () => {
    const bad = JSON.parse(JSON.stringify(remoteManifest))
    bad.versions[0].checksum = 'tampered'
    const { status, data } = await post('/share/channels/subscribe', { manifest: bad })
    expect(status).toBe(400)
    expect(data.ok).toBe(false)
  })

  it('reports already-current when the host has not moved', async () => {
    const { status, data } = await post('/share/channels/sync', { channelId: 'ch-remote-deck' })
    expect(status).toBe(200)
    expect(data.record.outcome).toBe('already-current')
  })

  it('pulls a published update end to end and logs the sync', async () => {
    // Publisher ships v2 with a revised card and a new card.
    remoteManifest = publishUpdate(
      remoteManifest,
      [
        { id: 'r1', content: { front: 'Remote Q1 revised?', back: 'A1' } },
        { id: 'r2', content: { front: 'Remote Q2?', back: 'A2' } },
        { id: 'r3', content: { front: 'Remote Q3?', back: 'A3' } },
      ],
      'Revised Q1, added Q3',
      '2026-01-02T00:00:00Z',
    )

    const { status, data } = await post('/share/channels/sync', { channelId: 'ch-remote-deck' })
    expect(status).toBe(200)
    expect(data.record.outcome).toBe('updated')
    expect(data.record.fromVersion).toBe(1)
    expect(data.record.toVersion).toBe(2)
    expect(data.record.merge.addedCount).toBe(1)
    expect(data.record.merge.updatedCount).toBe(1)

    // The dashboard view now shows we are current with the seen version.
    const list = await get('/share/channels/subscriptions')
    const row = list.data.subscriptions.find((r: any) => r.channelId === 'ch-remote-deck')
    expect(row.localVersion).toBe(2)
    expect(row.seenVersion).toBe(2)
    expect(row.hasPending).toBe(false)

    // Sync log carries both the earlier already-current and this update.
    const records = await post('/share/channels/sync-records', { channelId: 'ch-remote-deck' })
    expect(records.data.records.length).toBeGreaterThanOrEqual(2)
    expect(records.data.records[0].outcome).toBe('updated')
  })

  it('imports the synced channel into a reviewable deck', async () => {
    const { status, data } = await post('/share/channels/import', { channelId: 'ch-remote-deck' })
    expect(status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.itemCount).toBe(3)
    expect(data.created).toBe(3)
    // Re-import is idempotent: no new cards, content already current.
    const again = await post('/share/channels/import', { channelId: 'ch-remote-deck' })
    expect(again.data.created).toBe(0)
    expect(again.data.updated).toBe(0)
  })

  it('sync-all walks every subscription and summarizes', async () => {
    const { status, data } = await post('/share/channels/sync-all', {})
    expect(status).toBe(200)
    expect(data.summary.checked).toBeGreaterThanOrEqual(1)
    expect(data.summary.failed).toBe(0)
  })

  it('fails honestly when the host disappears', async () => {
    const { data } = await post('/share/channels/sync', {
      channelId: 'ch-remote-deck',
      hostBaseUrl: 'http://127.0.0.1:1',
    })
    expect(data.ok).toBe(false)
    expect(data.record.outcome).toBe('failed')
    expect(data.record.errorCode).toBeTruthy()
  })
})
